-- Ordered, location-aware Find Our Friends routes and server-owned progress.
alter table public.destinations
  add column if not exists photobox_access_mode text not null default 'standalone';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'destinations_photobox_access_mode_allowed'
      and conrelid = 'public.destinations'::regclass
  ) then
    alter table public.destinations
      add constraint destinations_photobox_access_mode_allowed
      check (photobox_access_mode in ('standalone', 'mission_reward'));
  end if;
end $$;

alter table public.qr_points
  add column if not exists mission_order integer,
  add column if not exists scan_radius_meters integer not null default 150;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'qr_points_mission_order_range'
      and conrelid = 'public.qr_points'::regclass
  ) then
    alter table public.qr_points
      add constraint qr_points_mission_order_range
      check (mission_order is null or mission_order between 1 and 30);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'qr_points_scan_radius_range'
      and conrelid = 'public.qr_points'::regclass
  ) then
    alter table public.qr_points
      add constraint qr_points_scan_radius_range
      check (scan_radius_meters between 25 and 2000);
  end if;
end $$;

-- Existing QR points become an ordered route in their original creation order.
with ranked as (
  select q.id, row_number() over (partition by q.destination_id order by q.created_at, q.id) as step
  from public.qr_points q
  join public.destinations d on d.id = q.destination_id
  where q.is_active and q.mission_order is null
    and q.latitude is not null and q.longitude is not null
    and 'find_friends' = any(d.additional_minigames)
)
update public.qr_points q
set mission_order = ranked.step
from ranked
  where q.id = ranked.id and ranked.step <= 30;

create unique index if not exists qr_points_destination_mission_order_unique
  on public.qr_points (destination_id, mission_order)
  where mission_order is not null;

create index if not exists qr_points_destination_mission_route_idx
  on public.qr_points (destination_id, mission_order)
  where is_active and mission_order is not null;

-- Keep a route from starting empty when a destination's minigame is enabled.
create or replace function public.assign_new_qr_mission_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mission_order is null and new.is_active and new.latitude is not null and new.longitude is not null and exists (
    select 1 from public.destinations d
    where d.id = new.destination_id
      and 'find_friends' = any(d.additional_minigames)
  ) then
    select coalesce(max(q.mission_order), 0) + 1
      into new.mission_order
    from public.qr_points q
    where q.destination_id = new.destination_id
      and q.mission_order is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists qr_points_assign_mission_order on public.qr_points;
create trigger qr_points_assign_mission_order
before insert on public.qr_points
for each row execute function public.assign_new_qr_mission_order();

create or replace function public.initialize_destination_mission_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if 'find_friends' = any(new.additional_minigames)
     and (tg_op = 'INSERT' or not ('find_friends' = any(coalesce(old.additional_minigames, '{}'::text[])))) then
    with ranked as (
      select q.id,
        coalesce((select max(current_qr.mission_order) from public.qr_points current_qr where current_qr.destination_id = new.id), 0)
          + row_number() over (order by q.created_at, q.id) as step
      from public.qr_points q
      where q.destination_id = new.id and q.is_active and q.mission_order is null
        and q.latitude is not null and q.longitude is not null
    )
    update public.qr_points q set mission_order = ranked.step
    from ranked where q.id = ranked.id and ranked.step <= 30;
  end if;
  return new;
end;
$$;

drop trigger if exists destinations_initialize_mission_route on public.destinations;
create trigger destinations_initialize_mission_route
after insert or update of additional_minigames on public.destinations
for each row execute function public.initialize_destination_mission_route();

create table if not exists public.tourism_game_progress (
  visitor_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  visited_qr_point_ids uuid[] not null default '{}',
  xp integer not null default 0 check (xp >= 0),
  photos_created integer not null default 0 check (photos_created >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (visitor_id, destination_id)
);

alter table public.tourism_game_progress enable row level security;
revoke all on public.tourism_game_progress from anon, authenticated;

create or replace function public.get_public_minigame_state(p_destination_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_destination public.destinations%rowtype;
  v_progress public.tourism_game_progress%rowtype;
  v_visitor_id uuid := auth.uid();
  v_steps jsonb;
  v_passive_campaigns jsonb;
begin
  select d.* into v_destination
  from public.destinations d
  where d.slug = p_destination_slug
    and d.is_published
    and d.image_url is not null
    and length(trim(d.image_url)) > 0
    and d.latitude is not null and d.longitude is not null;

  if not found then
    return jsonb_build_object('error', 'DESTINATION_NOT_FOUND');
  end if;

  if v_visitor_id is not null then
    select p.* into v_progress
    from public.tourism_game_progress p
    where p.visitor_id = v_visitor_id and p.destination_id = v_destination.id;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'name', q.name,
      'order', q.mission_order,
      'latitude', q.latitude,
      'longitude', q.longitude,
      'scanRadiusMeters', q.scan_radius_meters,
      'campaigns', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'title', c.title, 'description', c.description,
          'imageUrl', c.image_url, 'ctaLabel', c.cta_label, 'ctaUrl', c.cta_url
        ) order by c.created_at desc)
        from public.promotion_campaigns c
        join public.tourism_partners p on p.id = c.partner_id
        where c.qr_point_id = q.id and c.experience_type = 'minigame'
          and c.status = 'published' and p.status = 'active'
          and (c.starts_at is null or c.starts_at <= now())
          and (c.ends_at is null or c.ends_at > now())
      ), '[]'::jsonb)
    ) order by q.mission_order
  ), '[]'::jsonb)
  into v_steps
  from public.qr_points q
  where q.destination_id = v_destination.id
    and q.is_active and q.mission_order is not null
    and q.latitude is not null and q.longitude is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description,
    'imageUrl', c.image_url, 'experienceType', c.experience_type,
    'ctaLabel', c.cta_label, 'ctaUrl', c.cta_url,
    'latitude', q.latitude, 'longitude', q.longitude,
    'maxDistanceMeters', p.max_distance_meters
  ) order by c.created_at desc), '[]'::jsonb)
  into v_passive_campaigns
  from public.promotion_campaigns c
  join public.tourism_partners p on p.id = c.partner_id
  join public.qr_points q on q.id = c.qr_point_id
  where p.destination_id = v_destination.id and q.destination_id = v_destination.id
    and q.is_active and q.latitude is not null and q.longitude is not null
    and c.experience_type in ('popup', 'photobox')
    and c.status = 'published' and p.status = 'active'
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now());

  return jsonb_build_object(
    'destinationId', v_destination.id,
    'games', case when cardinality(v_destination.additional_minigames) = 0
      then array['photobox']::text[] else v_destination.additional_minigames end,
    'photoboxAccessMode', v_destination.photobox_access_mode,
    'steps', v_steps,
    'passiveCampaigns', v_passive_campaigns,
    'progress', jsonb_build_object(
      'visitedQrPointIds', coalesce(v_progress.visited_qr_point_ids, '{}'::uuid[]),
      'xp', coalesce(v_progress.xp, 0),
      'photosCreated', coalesce(v_progress.photos_created, 0),
      'completed', v_progress.completed_at is not null,
      'completedAt', v_progress.completed_at
    )
  );
end;
$$;

create or replace function public.record_public_minigame_scan(
  p_destination_slug text,
  p_code text,
  p_latitude double precision,
  p_longitude double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid := auth.uid();
  v_destination public.destinations%rowtype;
  v_point public.qr_points%rowtype;
  v_expected public.qr_points%rowtype;
  v_previous public.qr_points%rowtype;
  v_progress public.tourism_game_progress%rowtype;
  v_step_count integer;
  v_distance double precision;
  v_leg_distance double precision;
  v_award integer;
  v_new_ids uuid[];
  v_is_complete boolean;
begin
  if v_visitor_id is null then
    return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED');
  end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    return jsonb_build_object('error', 'LOCATION_REQUIRED');
  end if;

  select d.* into v_destination
  from public.destinations d
  where d.slug = p_destination_slug and d.is_published
    and 'find_friends' = any(d.additional_minigames);
  if not found then return jsonb_build_object('error', 'MINIGAME_NOT_AVAILABLE'); end if;

  select q.* into v_point
  from public.qr_points q
  where q.code = p_code and q.destination_id = v_destination.id
    and q.is_active and q.mission_order is not null;
  if not found then return jsonb_build_object('error', 'QR_NOT_IN_MISSION'); end if;

  select count(*) into v_step_count
  from public.qr_points q where q.destination_id = v_destination.id
    and q.is_active and q.mission_order is not null
    and q.latitude is not null and q.longitude is not null;
  if v_step_count = 0 then return jsonb_build_object('error', 'MISSION_EMPTY'); end if;

  insert into public.tourism_game_progress (visitor_id, destination_id)
  values (v_visitor_id, v_destination.id)
  on conflict (visitor_id, destination_id) do nothing;

  select p.* into v_progress
  from public.tourism_game_progress p
  where p.visitor_id = v_visitor_id and p.destination_id = v_destination.id
  for update;

  if v_point.id = any(v_progress.visited_qr_point_ids) then
    return jsonb_build_object('status', 'already_scanned', 'xp', v_progress.xp,
      'visitedQrPointIds', v_progress.visited_qr_point_ids,
      'completed', v_progress.completed_at is not null);
  end if;

  select q.* into v_expected
  from public.qr_points q
  where q.destination_id = v_destination.id and q.is_active and q.mission_order is not null
    and q.latitude is not null and q.longitude is not null
    and not (q.id = any(v_progress.visited_qr_point_ids))
  order by q.mission_order limit 1;

  if v_expected.id is distinct from v_point.id then
    return jsonb_build_object('error', 'OUT_OF_ORDER', 'expectedName', v_expected.name,
      'expectedOrder', v_expected.mission_order);
  end if;

  if v_point.latitude is null or v_point.longitude is null then
    return jsonb_build_object('error', 'QR_LOCATION_MISSING');
  end if;

  v_distance := 6371000 * 2 * asin(sqrt(
    power(sin(radians(p_latitude - v_point.latitude) / 2), 2) +
    cos(radians(v_point.latitude)) * cos(radians(p_latitude)) *
    power(sin(radians(p_longitude - v_point.longitude) / 2), 2)
  ));
  if v_distance > v_point.scan_radius_meters then
    return jsonb_build_object('error', 'TOO_FAR', 'distanceMeters', round(v_distance),
      'scanRadiusMeters', v_point.scan_radius_meters);
  end if;

  if cardinality(v_progress.visited_qr_point_ids) > 0 then
    select q.* into v_previous
    from public.qr_points q
    where q.id = v_progress.visited_qr_point_ids[cardinality(v_progress.visited_qr_point_ids)];
    if found then
      v_leg_distance := 6371000 * 2 * asin(sqrt(
        power(sin(radians(v_point.latitude - v_previous.latitude) / 2), 2) +
        cos(radians(v_previous.latitude)) * cos(radians(v_point.latitude)) *
        power(sin(radians(v_point.longitude - v_previous.longitude) / 2), 2)
      ));
      if v_leg_distance > 2000 then
        return jsonb_build_object('error', 'ROUTE_GAP', 'maximumLegMeters', 2000);
      end if;
    end if;
  end if;

  v_award := case when cardinality(v_progress.visited_qr_point_ids) = 0 then 50 else 30 end;
  v_new_ids := array_append(v_progress.visited_qr_point_ids, v_point.id);
  v_is_complete := cardinality(v_new_ids) >= v_step_count;
  if v_is_complete then v_award := v_award + 25; end if;

  update public.tourism_game_progress p
  set visited_qr_point_ids = v_new_ids,
      xp = p.xp + v_award,
      completed_at = case when v_is_complete then coalesce(p.completed_at, now()) else p.completed_at end,
      updated_at = now()
  where p.visitor_id = v_visitor_id and p.destination_id = v_destination.id
  returning p.* into v_progress;

  return jsonb_build_object('status', 'found', 'name', v_point.name,
    'order', v_point.mission_order, 'awardXp', v_award,
    'visitedQrPointIds', v_progress.visited_qr_point_ids,
    'xp', v_progress.xp, 'completed', v_is_complete,
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'description', c.description,
        'imageUrl', c.image_url, 'ctaLabel', c.cta_label, 'ctaUrl', c.cta_url
      ) order by c.created_at desc)
      from public.promotion_campaigns c
      join public.tourism_partners p on p.id = c.partner_id
      where c.qr_point_id = v_point.id and c.experience_type = 'minigame'
        and c.status = 'published' and p.status = 'active'
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
    ), '[]'::jsonb),
    'nextOrder', (select min(q.mission_order) from public.qr_points q
      where q.destination_id = v_destination.id and q.is_active and q.mission_order is not null
        and q.latitude is not null and q.longitude is not null
        and not (q.id = any(v_progress.visited_qr_point_ids))),
    'photoboxUnlocked', v_is_complete and v_destination.photobox_access_mode = 'mission_reward');
end;
$$;

create or replace function public.record_public_photobox_creation(p_destination_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid := auth.uid();
  v_destination public.destinations%rowtype;
  v_progress public.tourism_game_progress%rowtype;
  v_award integer := 0;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  select d.* into v_destination from public.destinations d
  where d.slug = p_destination_slug and d.is_published
    and (cardinality(d.additional_minigames) = 0 or 'photobox' = any(d.additional_minigames));
  if not found then return jsonb_build_object('error', 'PHOTOBOX_NOT_AVAILABLE'); end if;

  insert into public.tourism_game_progress (visitor_id, destination_id)
  values (v_visitor_id, v_destination.id)
  on conflict (visitor_id, destination_id) do nothing;
  select p.* into v_progress from public.tourism_game_progress p
  where p.visitor_id = v_visitor_id and p.destination_id = v_destination.id for update;

  if v_destination.photobox_access_mode = 'mission_reward'
     and v_progress.completed_at is null then
    return jsonb_build_object('error', 'PHOTOBOX_LOCKED');
  end if;

  if v_progress.photos_created = 0 then v_award := 30; end if;
  update public.tourism_game_progress p
  set photos_created = p.photos_created + 1,
      xp = p.xp + v_award,
      updated_at = now()
  where p.visitor_id = v_visitor_id and p.destination_id = v_destination.id
  returning p.* into v_progress;

  return jsonb_build_object('status', 'saved', 'photosCreated', v_progress.photos_created,
    'awardXp', v_award, 'xp', v_progress.xp);
end;
$$;

revoke all on function public.get_public_minigame_state(text) from public;
revoke all on function public.record_public_minigame_scan(text, text, double precision, double precision) from public;
revoke all on function public.record_public_photobox_creation(text) from public;
grant execute on function public.get_public_minigame_state(text) to anon, authenticated;
grant execute on function public.record_public_minigame_scan(text, text, double precision, double precision) to authenticated;
grant execute on function public.record_public_photobox_creation(text) to authenticated;
