-- Reusable minigame programs, destination assignments, QR dependency groups,
-- scan attribution, and destination mascot configuration.

alter table public.destinations
  add column if not exists mascot_mode text not null default 'tiloc',
  add column if not exists mascot_image_url text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'destinations_mascot_mode_allowed' and conrelid = 'public.destinations'::regclass) then
    alter table public.destinations add constraint destinations_mascot_mode_allowed check (mascot_mode in ('tiloc', 'custom'));
  end if;
end $$;

create table if not exists public.tourism_minigame_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_enabled boolean not null default false,
  components text[] not null default array['chat_ai']::text[],
  required_components text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tourism_minigame_components_allowed check (components <@ array['find_friends', 'photobox', 'chat_ai']::text[]),
  constraint tourism_minigame_required_components_allowed check (required_components <@ array['find_friends', 'photobox']::text[] and required_components <@ components)
);

create table if not exists public.tourism_minigame_destinations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.tourism_minigame_programs(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  is_enabled boolean not null default true,
  components text[] not null default '{}',
  required_components text[] not null default '{}',
  photobox_access_mode text not null default 'standalone' check (photobox_access_mode in ('standalone', 'mission_reward')),
  photobox_templates jsonb not null default '[]'::jsonb,
  caption_template text not null default 'Kenangan seru di {destination}! #TiLoc',
  max_caption_length integer not null default 280 check (max_caption_length between 40 and 1000),
  max_dependency_distance_meters integer not null default 1000 check (max_dependency_distance_meters between 100 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, destination_id),
  constraint tourism_minigame_destination_components_allowed check (components <@ array['find_friends', 'photobox', 'chat_ai']::text[]),
  constraint tourism_minigame_destination_required_components_allowed check (required_components <@ array['find_friends', 'photobox']::text[] and required_components <@ components),
  constraint tourism_minigame_photo_templates_array check (jsonb_typeof(photobox_templates) = 'array')
);

create table if not exists public.tourism_minigame_qr_points (
  assignment_id uuid not null references public.tourism_minigame_destinations(id) on delete cascade,
  qr_point_id uuid not null references public.qr_points(id) on delete cascade,
  is_required boolean not null default true,
  friend_name text,
  friend_image_url text,
  primary key (assignment_id, qr_point_id)
);

create table if not exists public.tourism_minigame_qr_dependencies (
  assignment_id uuid not null,
  qr_point_id uuid not null,
  prerequisite_qr_point_id uuid not null,
  primary key (assignment_id, qr_point_id, prerequisite_qr_point_id),
  constraint tourism_minigame_dependency_not_self check (qr_point_id <> prerequisite_qr_point_id),
  constraint tourism_minigame_dependency_point_fk foreign key (assignment_id, qr_point_id)
    references public.tourism_minigame_qr_points(assignment_id, qr_point_id) on delete cascade,
  constraint tourism_minigame_dependency_prerequisite_fk foreign key (assignment_id, prerequisite_qr_point_id)
    references public.tourism_minigame_qr_points(assignment_id, qr_point_id) on delete cascade
);

create table if not exists public.tourism_minigame_progress (
  visitor_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.tourism_minigame_destinations(id) on delete cascade,
  scanned_qr_point_ids uuid[] not null default '{}',
  completed_components text[] not null default '{}',
  photos_created integer not null default 0 check (photos_created >= 0),
  xp integer not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now(),
  primary key (visitor_id, assignment_id)
);

create table if not exists public.tourism_qr_visits (
  visitor_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  qr_point_id uuid not null references public.qr_points(id) on delete cascade,
  source text not null default 'qr_link' check (source in ('qr_link', 'camera')),
  first_scanned_at timestamptz not null default now(),
  primary key (visitor_id, qr_point_id)
);

create table if not exists public.tourism_minigame_photos (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.tourism_minigame_destinations(id) on delete cascade,
  template_id text not null,
  caption text not null,
  drive_file_id text,
  created_at timestamptz not null default now()
);

create index if not exists tourism_minigame_destinations_destination_idx on public.tourism_minigame_destinations(destination_id, is_enabled);
create index if not exists tourism_minigame_programs_enabled_idx on public.tourism_minigame_programs(is_enabled, slug);
create index if not exists tourism_minigame_qr_points_qr_idx on public.tourism_minigame_qr_points(qr_point_id);
create index if not exists tourism_qr_visits_destination_idx on public.tourism_qr_visits(visitor_id, destination_id, first_scanned_at desc);

alter table public.tourism_minigame_programs enable row level security;
alter table public.tourism_minigame_destinations enable row level security;
alter table public.tourism_minigame_qr_points enable row level security;
alter table public.tourism_minigame_qr_dependencies enable row level security;
alter table public.tourism_minigame_progress enable row level security;
alter table public.tourism_qr_visits enable row level security;
alter table public.tourism_minigame_photos enable row level security;

revoke all on public.tourism_minigame_programs, public.tourism_minigame_destinations,
  public.tourism_minigame_qr_points, public.tourism_minigame_qr_dependencies,
  public.tourism_minigame_progress, public.tourism_qr_visits,
  public.tourism_minigame_photos from anon, authenticated;
grant select, insert, update, delete on public.tourism_minigame_programs,
  public.tourism_minigame_destinations, public.tourism_minigame_qr_points,
  public.tourism_minigame_qr_dependencies to authenticated;

drop policy if exists "Staff manage minigame programs" on public.tourism_minigame_programs;
create policy "Staff manage minigame programs" on public.tourism_minigame_programs
  for all to authenticated using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));
drop policy if exists "Staff manage minigame destination assignments" on public.tourism_minigame_destinations;
create policy "Staff manage minigame destination assignments" on public.tourism_minigame_destinations
  for all to authenticated using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));
drop policy if exists "Staff manage minigame QR points" on public.tourism_minigame_qr_points;
create policy "Staff manage minigame QR points" on public.tourism_minigame_qr_points
  for all to authenticated using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));
drop policy if exists "Staff manage minigame QR dependencies" on public.tourism_minigame_qr_dependencies;
create policy "Staff manage minigame QR dependencies" on public.tourism_minigame_qr_dependencies
  for all to authenticated using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));

create or replace function public.save_tourism_minigame_program(
  p_program_id uuid,
  p_name text,
  p_slug text,
  p_is_enabled boolean,
  p_components text[],
  p_required_components text[],
  p_destination_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_program_id uuid;
begin
  if auth.uid() is null or not public.has_staff_role('editor') then
    return jsonb_build_object('error', 'STAFF_REQUIRED');
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120
    or coalesce(p_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or coalesce(p_components, '{}') = '{}'
    or not (coalesce(p_components, '{}') <@ array['find_friends', 'photobox', 'chat_ai']::text[])
    or not (coalesce(p_required_components, '{}') <@ array['find_friends', 'photobox']::text[])
    or not (coalesce(p_required_components, '{}') <@ coalesce(p_components, '{}')) then
    return jsonb_build_object('error', 'INVALID_PROGRAM');
  end if;

  if p_program_id is null then
    insert into public.tourism_minigame_programs(name, slug, is_enabled, components, required_components, created_by, updated_by)
    values (trim(p_name), p_slug, coalesce(p_is_enabled, false), p_components, coalesce(p_required_components, '{}'), auth.uid(), auth.uid())
    returning id into v_program_id;
  else
    update public.tourism_minigame_programs set name = trim(p_name), slug = p_slug,
      is_enabled = coalesce(p_is_enabled, false), components = p_components,
      required_components = coalesce(p_required_components, '{}'), updated_by = auth.uid(), updated_at = now()
    where id = p_program_id returning id into v_program_id;
    if v_program_id is null then return jsonb_build_object('error', 'PROGRAM_NOT_FOUND'); end if;
  end if;

  insert into public.tourism_minigame_destinations(program_id, destination_id, components, required_components)
  select v_program_id, d.id, p_components, coalesce(p_required_components, '{}')
  from public.destinations d
  where d.id = any(coalesce(p_destination_ids, '{}'))
  on conflict (program_id, destination_id) do update set
    is_enabled = true,
    components = excluded.components,
    required_components = excluded.required_components,
    photobox_access_mode = case
      when 'find_friends' = any(excluded.components) and 'photobox' = any(excluded.components)
        then tourism_minigame_destinations.photobox_access_mode
      else 'standalone'
    end,
    updated_at = now();

  update public.tourism_minigame_destinations a set is_enabled = false, updated_at = now()
  where a.program_id = v_program_id and not (a.destination_id = any(coalesce(p_destination_ids, '{}')));

  return jsonb_build_object('programId', v_program_id);
exception when unique_violation then
  return jsonb_build_object('error', 'SLUG_IN_USE');
end;
$$;

create or replace function public.configure_tourism_minigame_assignment(
  p_assignment_id uuid,
  p_is_enabled boolean,
  p_components text[],
  p_required_components text[],
  p_photobox_access_mode text,
  p_photobox_templates jsonb,
  p_caption_template text,
  p_max_caption_length integer,
  p_max_dependency_distance_meters integer,
  p_find_points jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.tourism_minigame_destinations%rowtype;
  v_item jsonb;
  v_point_id uuid;
  v_cycles boolean;
begin
  if auth.uid() is null or not public.has_staff_role('editor') then return jsonb_build_object('error', 'STAFF_REQUIRED'); end if;
  select * into v_assignment from public.tourism_minigame_destinations where id = p_assignment_id for update;
  if not found then return jsonb_build_object('error', 'ASSIGNMENT_NOT_FOUND'); end if;
  if coalesce(p_components, '{}') = '{}'
    or not (coalesce(p_components, '{}') <@ array['find_friends', 'photobox', 'chat_ai']::text[])
    or not (coalesce(p_required_components, '{}') <@ array['find_friends', 'photobox']::text[])
    or not (coalesce(p_required_components, '{}') <@ coalesce(p_components, '{}'))
    or p_photobox_access_mode is null or p_photobox_access_mode not in ('standalone', 'mission_reward')
    or jsonb_typeof(coalesce(p_photobox_templates, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_photobox_templates, '[]'::jsonb)) > 12
    or exists (select 1 from jsonb_array_elements(coalesce(p_photobox_templates, '[]'::jsonb)) t where coalesce(t->>'ratio', '') not in ('portrait', 'story', 'square'))
    or length(coalesce(p_caption_template, '')) > 500
    or p_max_caption_length is null or p_max_caption_length not between 40 and 1000
    or p_max_dependency_distance_meters is null or p_max_dependency_distance_meters not between 100 and 10000
    or jsonb_typeof(coalesce(p_find_points, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_find_points, '[]'::jsonb)) > 100 then
    return jsonb_build_object('error', 'INVALID_ASSIGNMENT');
  end if;
  if p_photobox_access_mode = 'mission_reward'
    and not ('find_friends' = any(p_components) and 'photobox' = any(p_components)) then
    return jsonb_build_object('error', 'PHOTOBOX_REWARD_REQUIRES_FIND_FRIENDS');
  end if;
  if 'photobox' = any(p_components) and not exists (
    select 1 from jsonb_array_elements(coalesce(p_photobox_templates, '[]'::jsonb)) t
    where coalesce((t->>'enabled')::boolean, true)
  ) then return jsonb_build_object('error', 'PHOTOBOX_REQUIRES_ENABLED_TEMPLATE'); end if;
  if 'find_friends' = any(p_components) and jsonb_array_length(coalesce(p_find_points, '[]'::jsonb)) = 0 then
    return jsonb_build_object('error', 'FIND_FRIENDS_REQUIRES_QR_POINTS');
  end if;
  if 'find_friends' = any(p_components) and not exists (
    select 1 from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) item
    where coalesce((item->>'isRequired')::boolean, true)
  ) then return jsonb_build_object('error', 'FIND_FRIENDS_REQUIRES_REQUIRED_POINT'); end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) item
    where not exists (
      select 1 from public.qr_points q where q.id = (item->>'qrPointId')::uuid
        and q.destination_id = v_assignment.destination_id and q.is_active
    )
  ) then return jsonb_build_object('error', 'QR_POINT_NOT_IN_DESTINATION'); end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) item
    cross join lateral jsonb_array_elements_text(coalesce(item->'requires', '[]'::jsonb)) dep(value)
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) other
      where other->>'qrPointId' = dep.value
    )
  ) then return jsonb_build_object('error', 'DEPENDENCY_NOT_IN_GROUP'); end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) item
    cross join lateral jsonb_array_elements_text(coalesce(item->'requires', '[]'::jsonb)) dep(value)
    join public.qr_points child on child.id = (item->>'qrPointId')::uuid
    join public.qr_points prerequisite on prerequisite.id = dep.value::uuid
    where child.latitude is null or child.longitude is null or prerequisite.latitude is null or prerequisite.longitude is null
      or 6371000 * 2 * asin(sqrt(least(1::double precision,
        power(sin(radians((child.latitude - prerequisite.latitude)::double precision) / 2), 2)
        + cos(radians(child.latitude::double precision)) * cos(radians(prerequisite.latitude::double precision))
        * power(sin(radians((child.longitude - prerequisite.longitude)::double precision) / 2), 2)
      ))) > p_max_dependency_distance_meters
  ) then return jsonb_build_object('error', 'DEPENDENCY_TOO_FAR'); end if;

  update public.tourism_minigame_destinations set is_enabled = coalesce(p_is_enabled, false),
    components = coalesce(p_components, '{}'), required_components = coalesce(p_required_components, '{}'),
    photobox_access_mode = p_photobox_access_mode,
    photobox_templates = coalesce(p_photobox_templates, '[]'::jsonb),
    caption_template = coalesce(nullif(trim(p_caption_template), ''), 'Kenangan seru di {destination}! #TiLoc'),
    max_caption_length = p_max_caption_length,
    max_dependency_distance_meters = p_max_dependency_distance_meters, updated_at = now()
  where id = p_assignment_id;

  if not ('find_friends' = any(p_components)) then
    delete from public.tourism_minigame_qr_points where assignment_id = p_assignment_id;
    return jsonb_build_object('status', 'saved');
  end if;

  delete from public.tourism_minigame_qr_points where assignment_id = p_assignment_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) loop
    v_point_id := (v_item->>'qrPointId')::uuid;
    insert into public.tourism_minigame_qr_points(assignment_id, qr_point_id, is_required, friend_name, friend_image_url)
    values (p_assignment_id, v_point_id, coalesce((v_item->>'isRequired')::boolean, true), nullif(trim(v_item->>'friendName'), ''), nullif(trim(v_item->>'friendImageUrl'), ''));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) loop
    v_point_id := (v_item->>'qrPointId')::uuid;
    insert into public.tourism_minigame_qr_dependencies(assignment_id, qr_point_id, prerequisite_qr_point_id)
    select p_assignment_id, v_point_id, dep.value::uuid
    from jsonb_array_elements_text(coalesce(v_item->'requires', '[]'::jsonb)) dep(value)
    where dep.value::uuid <> v_point_id;
  end loop;

  with recursive walk(start_id, node_id, path, has_cycle) as (
    select d.qr_point_id, d.prerequisite_qr_point_id,
      array[d.qr_point_id, d.prerequisite_qr_point_id], d.qr_point_id = d.prerequisite_qr_point_id
    from public.tourism_minigame_qr_dependencies d where d.assignment_id = p_assignment_id
    union all
    select w.start_id, d.prerequisite_qr_point_id, w.path || d.prerequisite_qr_point_id,
      d.prerequisite_qr_point_id = any(w.path)
    from walk w join public.tourism_minigame_qr_dependencies d
      on d.assignment_id = p_assignment_id and d.qr_point_id = w.node_id
    where not w.has_cycle
  ) select coalesce(bool_or(has_cycle), false) into v_cycles from walk;
  if v_cycles then raise exception using errcode = 'P0001', message = 'DEPENDENCY_CYCLE'; end if;

  return jsonb_build_object('status', 'saved');
exception when foreign_key_violation or invalid_text_representation or unique_violation then
  return jsonb_build_object('error', 'INVALID_QR_DEPENDENCY');
when sqlstate 'P0001' then
  return jsonb_build_object('error', 'DEPENDENCY_CYCLE');
end;
$$;

create or replace function public.get_public_minigame_state(p_destination_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_destination public.destinations%rowtype; v_programs jsonb; v_visitor_id uuid := auth.uid();
begin
  select * into v_destination from public.destinations d
  where d.slug = p_destination_slug and d.is_published and d.image_url is not null and d.latitude is not null and d.longitude is not null;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignmentId', a.id, 'programId', p.id, 'programName', p.name, 'programSlug', p.slug,
    'components', a.components, 'requiredComponents', a.required_components,
    'photoboxAccessMode', a.photobox_access_mode, 'photoboxTemplates', a.photobox_templates,
    'captionTemplate', a.caption_template, 'maxCaptionLength', a.max_caption_length,
    'maxDependencyDistanceMeters', a.max_dependency_distance_meters,
    'findPoints', coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id, 'name', q.name, 'code', q.code, 'isRequired', m.is_required,
      'friendName', m.friend_name, 'friendImageUrl', m.friend_image_url,
      'requires', coalesce((select jsonb_agg(dep.prerequisite_qr_point_id)
        from public.tourism_minigame_qr_dependencies dep
        where dep.assignment_id = a.id and dep.qr_point_id = q.id), '[]'::jsonb),
      'campaigns', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'description', c.description, 'imageUrl', c.image_url,
        'ctaLabel', c.cta_label, 'ctaUrl', c.cta_url, 'displayChance', c.display_chance,
        'experienceType', c.experience_type
      )) from public.promotion_campaigns c join public.tourism_partners partner on partner.id = c.partner_id
      where c.qr_point_id = q.id and c.experience_type in ('minigame', 'photobox') and c.status = 'published'
        and partner.status = 'active' and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
        and ((c.experience_type = 'minigame' and 'find_friends' = any(a.components))
          or (c.experience_type = 'photobox' and 'photobox' = any(a.components)))), '[]'::jsonb)
    ) order by q.name) from public.tourism_minigame_qr_points m
      join public.qr_points q on q.id = m.qr_point_id
      where m.assignment_id = a.id and q.is_active), '[]'::jsonb),
    'progress', jsonb_build_object(
      'scannedQrPointIds', coalesce(progress.scanned_qr_point_ids, '{}'),
      'completedComponents', coalesce(progress.completed_components, '{}'),
      'photosCreated', coalesce(progress.photos_created, 0), 'xp', coalesce(progress.xp, 0),
      'completed', cardinality(a.required_components) > 0 and a.required_components <@ coalesce(progress.completed_components, '{}')
    )
  ) order by p.created_at desc), '[]'::jsonb)
  into v_programs
  from public.tourism_minigame_destinations a
  join public.tourism_minigame_programs p on p.id = a.program_id
  left join public.tourism_minigame_progress progress on progress.assignment_id = a.id and progress.visitor_id = v_visitor_id
  where a.destination_id = v_destination.id and a.is_enabled and p.is_enabled;

  return jsonb_build_object('destinationId', v_destination.id, 'destinationName', v_destination.name,
    'destinationSlug', v_destination.slug, 'destinationAddress', v_destination.address,
    'destinationTags', v_destination.tags, 'programs', coalesce(v_programs, '[]'::jsonb),
    'passiveCampaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'description', coalesce(c.description, ''), 'imageUrl', c.image_url,
        'ctaLabel', c.cta_label, 'ctaUrl', c.cta_url, 'experienceType', c.experience_type,
        'latitude', q.latitude, 'longitude', q.longitude, 'maxDistanceMeters', partner.max_distance_meters,
        'programSlug', (select p.slug from public.tourism_minigame_destinations a2
          join public.tourism_minigame_programs p on p.id = a2.program_id
          where a2.destination_id = v_destination.id and a2.is_enabled and p.is_enabled
            and 'photobox' = any(a2.components) order by p.created_at desc limit 1)
      ) order by c.created_at desc)
      from public.promotion_campaigns c
      join public.tourism_partners partner on partner.id = c.partner_id
      join public.qr_points q on q.id = c.qr_point_id
      where q.destination_id = v_destination.id and q.is_active
        and c.experience_type in ('popup', 'photobox') and c.status = 'published'
        and partner.status = 'active' and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
    ), '[]'::jsonb));
end;
$$;

create or replace function public.record_public_minigame_scan(
  p_program_slug text, p_destination_slug text, p_code text, p_source text default 'qr_link'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid := auth.uid(); v_assignment public.tourism_minigame_destinations%rowtype;
  v_program public.tourism_minigame_programs%rowtype; v_destination public.destinations%rowtype;
  v_point_id uuid; v_name text; v_progress public.tourism_minigame_progress%rowtype;
  v_scanned uuid[]; v_found uuid[]; v_missing integer; v_completed boolean; v_new_scan boolean;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  select d.* into v_destination from public.destinations d where d.slug = p_destination_slug and d.is_published;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;
  select p.* into v_program from public.tourism_minigame_programs p where p.slug = p_program_slug and p.is_enabled;
  if not found then return jsonb_build_object('error', 'MINIGAME_NOT_AVAILABLE'); end if;
  select a.* into v_assignment from public.tourism_minigame_destinations a where a.program_id = v_program.id
    and a.destination_id = v_destination.id and a.is_enabled and 'find_friends' = any(a.components);
  if not found then return jsonb_build_object('error', 'MINIGAME_NOT_AVAILABLE'); end if;
  select q.id, q.name into v_point_id, v_name from public.qr_points q
    join public.tourism_minigame_qr_points m on m.qr_point_id = q.id and m.assignment_id = v_assignment.id
    where q.code = p_code and q.destination_id = v_destination.id and q.is_active;
  if v_point_id is null then return jsonb_build_object('error', 'QR_NOT_IN_MISSION'); end if;

  insert into public.tourism_minigame_progress(visitor_id, assignment_id)
  values (v_visitor_id, v_assignment.id) on conflict do nothing;
  select * into v_progress from public.tourism_minigame_progress where visitor_id = v_visitor_id and assignment_id = v_assignment.id for update;
  v_new_scan := not (v_point_id = any(v_progress.scanned_qr_point_ids));
  v_scanned := case when v_new_scan then array_append(v_progress.scanned_qr_point_ids, v_point_id) else v_progress.scanned_qr_point_ids end;

  with recursive prereq(start_id, ancestor_id) as (
    select d.qr_point_id, d.prerequisite_qr_point_id from public.tourism_minigame_qr_dependencies d where d.assignment_id = v_assignment.id
    union
    select p.start_id, d.prerequisite_qr_point_id from prereq p
    join public.tourism_minigame_qr_dependencies d on d.assignment_id = v_assignment.id and d.qr_point_id = p.ancestor_id
  )
  select coalesce(array_agg(m.qr_point_id), '{}') into v_found
  from public.tourism_minigame_qr_points m
  where m.assignment_id = v_assignment.id and m.qr_point_id = any(v_scanned)
    and not exists (select 1 from prereq p where p.start_id = m.qr_point_id and not (p.ancestor_id = any(v_scanned)));

  select count(*) into v_missing from public.tourism_minigame_qr_points m
  where m.assignment_id = v_assignment.id and m.is_required
    and (not (m.qr_point_id = any(v_found)));
  v_completed := exists(select 1 from public.tourism_minigame_qr_points m where m.assignment_id = v_assignment.id and m.is_required)
    and v_missing = 0;

  update public.tourism_minigame_progress set scanned_qr_point_ids = v_scanned,
    completed_components = case when v_completed and not ('find_friends' = any(completed_components))
      then array_append(completed_components, 'find_friends') else completed_components end,
    xp = xp + case when v_new_scan then 30 else 0 end,
    updated_at = now()
  where visitor_id = v_visitor_id and assignment_id = v_assignment.id returning * into v_progress;

  return jsonb_build_object('status', case when v_new_scan then 'scanned' else 'already_scanned' end,
    'pointId', v_point_id, 'name', v_name, 'scannedQrPointIds', v_progress.scanned_qr_point_ids,
    'foundQrPointIds', v_found, 'completedComponents', v_progress.completed_components,
    'requiredCount', (select count(*) from public.tourism_minigame_qr_points m where m.assignment_id = v_assignment.id and m.is_required),
    'foundRequiredCount', (select count(*) from public.tourism_minigame_qr_points m where m.assignment_id = v_assignment.id and m.is_required and m.qr_point_id = any(v_found)),
    'completed', v_completed, 'xp', v_progress.xp);
end;
$$;

create or replace function public.record_public_qr_visit(p_code text, p_source text default 'qr_link')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_visitor_id uuid := auth.uid(); v_destination public.destinations%rowtype; v_point_id uuid; v_point_name text;
  v_inserted integer; v_game record; v_game_results jsonb := '[]'::jsonb;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  select d.* into v_destination from public.qr_points q join public.destinations d on d.id = q.destination_id
  where q.code = p_code and q.is_active and d.is_published and d.image_url is not null and d.latitude is not null and d.longitude is not null;
  if not found then return jsonb_build_object('error', 'QR_NOT_FOUND'); end if;
  select q.id, q.name into v_point_id, v_point_name from public.qr_points q
  where q.code = p_code and q.destination_id = v_destination.id and q.is_active;
  insert into public.tourism_qr_visits(visitor_id, destination_id, qr_point_id, source)
  values (v_visitor_id, v_destination.id, v_point_id,
    case when p_source = 'camera' then 'camera' else 'qr_link' end)
  on conflict (visitor_id, qr_point_id) do nothing;
  get diagnostics v_inserted = row_count;

  for v_game in select p.slug from public.tourism_minigame_destinations a
    join public.tourism_minigame_programs p on p.id = a.program_id
    join public.tourism_minigame_qr_points m on m.assignment_id = a.id and m.qr_point_id = v_point_id
    where a.destination_id = v_destination.id and a.is_enabled and p.is_enabled and 'find_friends' = any(a.components)
  loop
    v_game_results := v_game_results || jsonb_build_array(public.record_public_minigame_scan(v_game.slug, v_destination.slug, p_code, p_source));
  end loop;

  return jsonb_build_object('status', case when v_inserted = 1 then 'visited' else 'already_visited' end,
    'destinationSlug', v_destination.slug, 'destinationName', v_destination.name,
    'pointId', v_point_id, 'pointName', v_point_name, 'minigames', v_game_results);
end;
$$;

create or replace function public.record_public_minigame_photo(
  p_program_slug text, p_destination_slug text, p_template_id text, p_caption text, p_drive_file_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_visitor_id uuid := auth.uid(); v_destination public.destinations%rowtype;
  v_program public.tourism_minigame_programs%rowtype; v_assignment public.tourism_minigame_destinations%rowtype;
  v_progress public.tourism_minigame_progress%rowtype; v_award integer := 0;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  select * into v_destination from public.destinations where slug = p_destination_slug and is_published;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;
  select * into v_program from public.tourism_minigame_programs where slug = p_program_slug and is_enabled;
  if not found then return jsonb_build_object('error', 'MINIGAME_NOT_AVAILABLE'); end if;
  select * into v_assignment from public.tourism_minigame_destinations where program_id = v_program.id
    and destination_id = v_destination.id and is_enabled and 'photobox' = any(components);
  if not found then return jsonb_build_object('error', 'PHOTOBOX_NOT_AVAILABLE'); end if;
  if length(trim(coalesce(p_caption, ''))) = 0 or char_length(p_caption) > v_assignment.max_caption_length then
    return jsonb_build_object('error', 'CAPTION_REQUIRED_OR_TOO_LONG', 'maxLength', v_assignment.max_caption_length);
  end if;
  if coalesce(p_template_id, '') = ''
    or not exists (select 1 from jsonb_array_elements(v_assignment.photobox_templates) t where t->>'id' = p_template_id and coalesce((t->>'enabled')::boolean, true)) then
    return jsonb_build_object('error', 'TEMPLATE_OR_PHOTO_REQUIRED');
  end if;
  insert into public.tourism_minigame_progress(visitor_id, assignment_id) values (v_visitor_id, v_assignment.id) on conflict do nothing;
  select * into v_progress from public.tourism_minigame_progress where visitor_id = v_visitor_id and assignment_id = v_assignment.id for update;
  if v_assignment.photobox_access_mode = 'mission_reward' and not ('find_friends' = any(v_progress.completed_components)) then
    return jsonb_build_object('error', 'PHOTOBOX_LOCKED');
  end if;
  v_award := case when v_progress.photos_created = 0 then 30 else 0 end;
  insert into public.tourism_minigame_photos(visitor_id, assignment_id, template_id, caption, drive_file_id)
  values (v_visitor_id, v_assignment.id, p_template_id, left(trim(p_caption), v_assignment.max_caption_length), p_drive_file_id);
  update public.tourism_minigame_progress set photos_created = photos_created + 1,
    xp = xp + v_award,
    completed_components = case when not ('photobox' = any(completed_components))
      then array_append(completed_components, 'photobox') else completed_components end,
    updated_at = now()
  where visitor_id = v_visitor_id and assignment_id = v_assignment.id returning * into v_progress;
  return jsonb_build_object('status', 'saved', 'photosCreated', v_progress.photos_created,
    'completedComponents', v_progress.completed_components, 'xp', v_progress.xp);
end;
$$;

revoke all on function public.save_tourism_minigame_program(uuid, text, text, boolean, text[], text[], uuid[]) from public, anon;
revoke all on function public.configure_tourism_minigame_assignment(uuid, boolean, text[], text[], text, jsonb, text, integer, integer, jsonb) from public, anon;
revoke all on function public.get_public_minigame_state(text) from public;
revoke all on function public.record_public_minigame_scan(text, text, text, text) from public;
revoke all on function public.record_public_qr_visit(text, text) from public;
revoke all on function public.record_public_minigame_photo(text, text, text, text, text) from public;
grant execute on function public.save_tourism_minigame_program(uuid, text, text, boolean, text[], text[], uuid[]) to authenticated;
grant execute on function public.configure_tourism_minigame_assignment(uuid, boolean, text[], text[], text, jsonb, text, integer, integer, jsonb) to authenticated;
grant execute on function public.get_public_minigame_state(text) to anon, authenticated;
grant execute on function public.record_public_minigame_scan(text, text, text, text) to authenticated;
grant execute on function public.record_public_qr_visit(text, text) to authenticated;
grant execute on function public.record_public_minigame_photo(text, text, text, text, text) to authenticated;

-- Campaigns can be inserted between game points with a controllable probability.
alter table public.promotion_campaigns add column if not exists display_chance integer not null default 35;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'promotion_campaign_display_chance_range' and conrelid = 'public.promotion_campaigns'::regclass) then
    alter table public.promotion_campaigns add constraint promotion_campaign_display_chance_range check (display_chance between 0 and 100);
  end if;
end $$;
