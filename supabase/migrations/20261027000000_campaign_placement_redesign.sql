-- Separate partner identity from campaign placement and support independent
-- destination, minigame, Photobox, and site-wide campaign targets.

alter table public.tourism_partners
  add column if not exists business_categories text[] not null default '{}',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists allow_minigame_integration boolean not null default false;

update public.tourism_partners
set business_categories = array[trim(business_type)]
where cardinality(business_categories) = 0 and nullif(trim(business_type), '') is not null;

alter table public.tourism_partners
  drop constraint if exists tourism_partners_max_distance_meters_range,
  drop constraint if exists tourism_partners_max_distance_meters_fixed;
update public.tourism_partners set max_distance_meters = 500 where max_distance_meters <> 500;
alter table public.tourism_partners alter column max_distance_meters set default 500;
alter table public.tourism_partners
  add constraint tourism_partners_max_distance_meters_fixed check (max_distance_meters = 500);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tourism_partners_coordinates_pair' and conrelid = 'public.tourism_partners'::regclass) then
    alter table public.tourism_partners add constraint tourism_partners_coordinates_pair
      check ((latitude is null) = (longitude is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tourism_partners_latitude_range' and conrelid = 'public.tourism_partners'::regclass) then
    alter table public.tourism_partners add constraint tourism_partners_latitude_range check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tourism_partners_longitude_range' and conrelid = 'public.tourism_partners'::regclass) then
    alter table public.tourism_partners add constraint tourism_partners_longitude_range check (longitude is null or longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tourism_partners_minigame_location_required' and conrelid = 'public.tourism_partners'::regclass) then
    alter table public.tourism_partners add constraint tourism_partners_minigame_location_required
      check (not allow_minigame_integration or (latitude is not null and longitude is not null and destination_id is not null));
  end if;
end $$;

alter table public.promotion_campaigns
  alter column partner_id drop not null,
  alter column qr_point_id drop not null,
  add column if not exists placement_mode text not null default 'nearby',
  add column if not exists frame_url text,
  add column if not exists frame_layout text,
  add column if not exists frame_ratio text,
  add column if not exists exposure_mode text not null default 'chance',
  add column if not exists system_pages text[] not null default array['home', 'scan']::text[];

update public.promotion_campaigns
set placement_mode = case experience_type
  when 'minigame' then 'find_friends'
  when 'photobox' then 'photobox'
  else 'nearby'
end
where placement_mode = 'nearby' and experience_type in ('minigame', 'photobox');

alter table public.promotion_campaigns
  drop constraint if exists promotion_campaigns_placement_mode_check,
  drop constraint if exists promotion_campaigns_exposure_mode_check,
  drop constraint if exists promotion_campaigns_frame_layout_check,
  drop constraint if exists promotion_campaigns_frame_ratio_check,
  drop constraint if exists promotion_campaigns_system_pages_check;
alter table public.promotion_campaigns
  add constraint promotion_campaigns_placement_mode_check
    check (placement_mode in ('find_friends', 'photobox', 'nearby', 'system', 'destination_feedback', 'website_feedback')),
  add constraint promotion_campaigns_exposure_mode_check
    check (exposure_mode in ('chance', 'always')),
  add constraint promotion_campaigns_frame_layout_check
    check (frame_layout is null or frame_layout in ('single', 'strip2', 'grid6', 'travel_strip', 'memory_triptych')),
  add constraint promotion_campaigns_frame_ratio_check
    check (frame_ratio is null or frame_ratio in ('portrait', 'story', 'square')),
  add constraint promotion_campaigns_system_pages_check
    check (system_pages <@ array['home', 'scan', 'destination', 'minigame', 'photobox']::text[]);

create table if not exists public.promotion_campaign_destinations (
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, destination_id)
);

create table if not exists public.promotion_campaign_minigames (
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  assignment_id uuid not null references public.tourism_minigame_destinations(id) on delete cascade,
  qr_point_id uuid references public.qr_points(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, assignment_id)
);

insert into public.promotion_campaign_destinations(campaign_id, destination_id)
select c.id, q.destination_id
from public.promotion_campaigns c
join public.qr_points q on q.id = c.qr_point_id
on conflict do nothing;

insert into public.promotion_campaign_minigames(campaign_id, assignment_id, qr_point_id)
select c.id, m.assignment_id, c.qr_point_id
from public.promotion_campaigns c
join public.tourism_minigame_qr_points m on m.qr_point_id = c.qr_point_id
where c.placement_mode = 'find_friends'
on conflict do nothing;

create index if not exists promotion_campaign_destinations_destination_idx
  on public.promotion_campaign_destinations(destination_id, campaign_id);
create index if not exists promotion_campaign_minigames_assignment_idx
  on public.promotion_campaign_minigames(assignment_id, campaign_id);

alter table public.promotion_campaign_destinations enable row level security;
alter table public.promotion_campaign_minigames enable row level security;

drop policy if exists "Staff manage campaign destinations" on public.promotion_campaign_destinations;
create policy "Staff manage campaign destinations" on public.promotion_campaign_destinations
  for all to authenticated using (exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role in ('admin', 'editor')
  )) with check (exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role in ('admin', 'editor')
  ));
drop policy if exists "Public read active campaign destinations" on public.promotion_campaign_destinations;
create policy "Public read active campaign destinations" on public.promotion_campaign_destinations
  for select to anon, authenticated using (exists (
    select 1 from public.promotion_campaigns c where c.id = campaign_id and c.status = 'published'
      and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())
  ));

drop policy if exists "Staff manage campaign minigames" on public.promotion_campaign_minigames;
create policy "Staff manage campaign minigames" on public.promotion_campaign_minigames
  for all to authenticated using (exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role in ('admin', 'editor')
  )) with check (exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role in ('admin', 'editor')
  ));
drop policy if exists "Public read active campaign minigames" on public.promotion_campaign_minigames;
create policy "Public read active campaign minigames" on public.promotion_campaign_minigames
  for select to anon, authenticated using (exists (
    select 1 from public.promotion_campaigns c where c.id = campaign_id and c.status = 'published'
      and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())
  ));

grant select on public.promotion_campaign_destinations, public.promotion_campaign_minigames to anon, authenticated;
grant insert, update, delete on public.promotion_campaign_destinations, public.promotion_campaign_minigames to authenticated;
grant select (placement_mode, display_chance, exposure_mode, frame_url, frame_layout, frame_ratio, system_pages)
  on public.promotion_campaigns to anon, authenticated;

drop policy if exists "Public can read active tourism partner profiles" on public.tourism_partners;
create policy "Public can read active tourism partner profiles" on public.tourism_partners
  for select to anon using (status = 'active');
grant select (business_name, slug, business_type, business_categories, description, contact_phone, address, website_url, logo_url, status)
  on public.tourism_partners to anon;

-- Partner campaign QR stops are optional extras and must never invalidate the
-- visitor's required Find Our Friends progress when a campaign is attached.
create or replace function public.tourism_minigame_mission_hash(p_assignment_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(jsonb_build_object(
    'missions', coalesce((
      select jsonb_agg(component.value order by component.value)
      from unnest(a.components) as component(value)
      where component.value not in ('photobox', 'chat_ai')
    ), '[]'::jsonb),
    'requiredMissions', coalesce((
      select jsonb_agg(component.value order by component.value)
      from unnest(a.required_components) as component(value)
      where component.value not in ('photobox', 'chat_ai')
    ), '[]'::jsonb),
    'qrPoints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'qrPointId', m.qr_point_id,
        'required', m.is_required,
        'requires', coalesce((
          select jsonb_agg(d.prerequisite_qr_point_id order by d.prerequisite_qr_point_id)
          from public.tourism_minigame_qr_dependencies d
          where d.assignment_id = m.assignment_id and d.qr_point_id = m.qr_point_id
        ), '[]'::jsonb)
      ) order by m.qr_point_id)
      from public.tourism_minigame_qr_points m
      where m.assignment_id = a.id and 'find_friends' = any(a.components)
        and not exists (
          select 1 from public.promotion_campaign_minigames campaign_point
          where campaign_point.assignment_id = m.assignment_id and campaign_point.qr_point_id = m.qr_point_id
        )
    ), '[]'::jsonb)
  )::text)
  from public.tourism_minigame_destinations a
  where a.id = p_assignment_id;
$$;

update public.tourism_minigame_progress progress
set mission_config_hash = public.tourism_minigame_mission_hash(progress.assignment_id);

-- Reusable feedback campaigns can accept one response per visitor each WIB
-- month, matching the separate destination and website survey cadence.
alter table public.tourism_campaign_responses
  add column if not exists response_month date,
  add column if not exists destination_id uuid references public.destinations(id) on delete set null,
  add column if not exists feedback_scope text;
update public.tourism_campaign_responses
set response_month = date_trunc('month', submitted_at at time zone 'Asia/Jakarta')::date
where response_month is null;
update public.tourism_campaign_responses response
set feedback_scope = 'website'
from public.promotion_campaigns campaign
where campaign.id = response.campaign_id and campaign.placement_mode = 'website_feedback'
  and response.feedback_scope is null;
update public.tourism_campaign_responses response
set feedback_scope = 'destination', destination_id = (
  select target.destination_id from public.promotion_campaign_destinations target
  where target.campaign_id = response.campaign_id order by target.destination_id limit 1
)
from public.promotion_campaigns campaign
where campaign.id = response.campaign_id and campaign.placement_mode = 'destination_feedback'
  and response.feedback_scope is null;
alter table public.tourism_campaign_responses
  alter column response_month set default (date_trunc('month', now() at time zone 'Asia/Jakarta')::date),
  alter column response_month set not null;
alter table public.tourism_campaign_responses
  drop constraint if exists tourism_campaign_responses_campaign_id_visitor_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tourism_campaign_responses_feedback_scope_check' and conrelid = 'public.tourism_campaign_responses'::regclass) then
    alter table public.tourism_campaign_responses add constraint tourism_campaign_responses_feedback_scope_check
      check (feedback_scope is null or feedback_scope in ('website', 'destination'));
  end if;
end $$;
drop index if exists public.tourism_campaign_responses_monthly_unique;
create unique index tourism_campaign_responses_monthly_unique
  on public.tourism_campaign_responses(campaign_id, visitor_id, response_month)
  where feedback_scope is null;
create unique index if not exists tourism_campaign_feedback_monthly_unique
  on public.tourism_campaign_responses(
    visitor_id, feedback_scope, response_month,
    coalesce(destination_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where feedback_scope is not null;

drop function if exists public.submit_public_campaign_response(uuid, jsonb);
create or replace function public.submit_public_campaign_response(p_campaign_id uuid, p_values jsonb, p_destination_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid := auth.uid();
  v_campaign public.promotion_campaigns%rowtype;
  v_block jsonb;
  v_field_id text;
  v_raw jsonb;
  v_value text;
  v_required boolean;
  v_max_length integer;
  v_inserted integer;
  v_month date := date_trunc('month', now() at time zone 'Asia/Jakarta')::date;
  v_response_scope text;
  v_response_destination_id uuid;
  v_feedback_rating integer;
  v_feedback_suggestion text;
  v_rating_text text;
  v_survey_result jsonb;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  if p_campaign_id is null or p_values is null or jsonb_typeof(p_values) is distinct from 'object'
    or public.jsonb_object_size(p_values) > 12 then
    return jsonb_build_object('error', 'INVALID_RESPONSE');
  end if;
  select * into v_campaign from public.promotion_campaigns
  where id = p_campaign_id and status = 'published'
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
  if not found then return jsonb_build_object('error', 'CAMPAIGN_NOT_AVAILABLE'); end if;
  if v_campaign.placement_mode = 'destination_feedback' then
    if p_destination_id is null or not exists (
      select 1 from public.promotion_campaign_destinations target
      where target.campaign_id = p_campaign_id and target.destination_id = p_destination_id
    ) then
      return jsonb_build_object('error', 'DESTINATION_TARGET_REQUIRED');
    end if;
    v_response_scope := 'destination';
    v_response_destination_id := p_destination_id;
  elsif v_campaign.placement_mode = 'website_feedback' then
    v_response_scope := 'website';
  end if;
  if jsonb_typeof(v_campaign.form_schema) <> 'array' or not exists (
    select 1 from jsonb_array_elements(v_campaign.form_schema) block
    where block->>'type' in ('input', 'choice', 'dropdown')
  ) then return jsonb_build_object('error', 'FORM_NOT_CONFIGURED'); end if;
  if exists (
    select 1 from jsonb_object_keys(p_values) supplied(key)
    where not exists (
      select 1 from jsonb_array_elements(v_campaign.form_schema) block
      where block->>'id' = supplied.key and block->>'type' in ('input', 'choice', 'dropdown')
    )
  ) then return jsonb_build_object('error', 'INVALID_RESPONSE_FIELD'); end if;

  for v_block in select value from jsonb_array_elements(v_campaign.form_schema)
    where value->>'type' in ('input', 'choice', 'dropdown') loop
    v_field_id := v_block->>'id';
    v_raw := p_values->v_field_id;
    v_required := coalesce((v_block->>'required')::boolean, false);
    if v_raw is null or jsonb_typeof(v_raw) = 'null' or (jsonb_typeof(v_raw) = 'string' and length(trim(v_raw #>> '{}')) = 0) then
      if v_required then return jsonb_build_object('error', 'REQUIRED_FIELD_MISSING', 'field', v_field_id); end if;
      continue;
    end if;
    if jsonb_typeof(v_raw) <> 'string' then return jsonb_build_object('error', 'INVALID_RESPONSE_FIELD', 'field', v_field_id); end if;
    v_value := trim(v_raw #>> '{}');
    v_max_length := case when v_block->>'type' = 'input'
      then least(240, greatest(1, coalesce((v_block->>'maxLength')::integer, 120))) else 120 end;
    if char_length(v_value) > v_max_length then return jsonb_build_object('error', 'RESPONSE_TOO_LONG', 'field', v_field_id); end if;
    if v_block->>'type' in ('choice', 'dropdown') and not exists (
      select 1 from jsonb_array_elements_text(v_block->'options') option_value where option_value = v_value
    ) then return jsonb_build_object('error', 'INVALID_CHOICE', 'field', v_field_id); end if;
    if v_block->>'type' = 'input' and v_block->>'inputType' = 'email'
      and v_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      return jsonb_build_object('error', 'INVALID_EMAIL', 'field', v_field_id);
    end if;
  end loop;

  if v_response_scope is not null then
    for v_block in select value from jsonb_array_elements(v_campaign.form_schema)
      where value->>'type' in ('choice', 'dropdown')
        and (coalesce(value->>'id', '') ~* '(rating|rate|penilaian|nilai)'
          or coalesce(value->>'label', '') ~* '(rating|rate|penilaian|nilai)') loop
      v_value := trim(coalesce(p_values->>(v_block->>'id'), ''));
      v_rating_text := substring(v_value from '^[[:space:]]*([1-5])');
      if v_rating_text is not null then
        v_feedback_rating := v_rating_text::integer;
        exit;
      end if;
    end loop;
    if v_feedback_rating is null then
      return jsonb_build_object('error', 'FEEDBACK_RATING_REQUIRED');
    end if;
    select nullif(left(trim(coalesce(p_values->>(block->>'id'), '')), 1500), '') into v_feedback_suggestion
    from jsonb_array_elements(v_campaign.form_schema) block
    where block->>'type' = 'input'
      and (coalesce(block->>'id', '') ~* '(suggestion|saran)'
        or coalesce(block->>'label', '') ~* '(suggestion|saran)')
    order by block->>'id' limit 1;
    v_survey_result := public.submit_tourism_survey(
      v_response_scope, v_response_destination_id, v_feedback_rating, v_feedback_suggestion
    );
    if v_survey_result->>'status' = 'already_submitted' then
      return jsonb_build_object('status', 'already_submitted', 'month', v_month);
    end if;
    if v_survey_result ? 'error' then
      return jsonb_build_object('error', 'FEEDBACK_SURVEY_UNAVAILABLE');
    end if;
  end if;

  insert into public.tourism_campaign_responses(campaign_id, visitor_id, response_values, response_month, destination_id, feedback_scope)
  values (p_campaign_id, v_visitor_id, p_values, v_month, v_response_destination_id, v_response_scope)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('status', 'already_submitted', 'month', v_month); end if;
  insert into public.tourism_visitor_events(visitor_id, event_key, event_name, page_key, campaign_id, destination_id)
  values (
    v_visitor_id, gen_random_uuid(), 'campaign_conversion', 'other', p_campaign_id,
    coalesce(
      (select q.destination_id from public.qr_points q where q.id = v_campaign.qr_point_id),
      v_response_destination_id
    )
  );
  return jsonb_build_object('status', 'submitted', 'month', v_month);
end;
$$;

revoke all on function public.submit_public_campaign_response(uuid, jsonb, uuid) from public, anon;
grant execute on function public.submit_public_campaign_response(uuid, jsonb, uuid) to authenticated;

