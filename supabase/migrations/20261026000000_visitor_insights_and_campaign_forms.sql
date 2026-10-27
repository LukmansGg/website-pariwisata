-- Anonymous first-party analytics and monthly feedback. Visitor IDs reuse the
-- existing Supabase anonymous-auth identity; no names, IPs, or device fingerprints
-- are added to analytics events.
create table if not exists public.tourism_visitor_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references auth.users(id) on delete cascade,
  event_key uuid not null,
  event_name text not null check (event_name in (
    'page_view', 'destination_view', 'feature_use', 'qr_scan',
    'campaign_impression', 'campaign_click', 'campaign_conversion'
  )),
  page_key text check (page_key is null or page_key in ('home', 'destination', 'minigame', 'photobox', 'scan', 'map', 'other')),
  feature_key text check (feature_key is null or feature_key in (
    'destination_dashboard', 'find_friends', 'photobox', 'chat_ai', 'qr_scan', 'map', 'other'
  )),
  destination_id uuid references public.destinations(id) on delete set null,
  qr_point_id uuid references public.qr_points(id) on delete set null,
  campaign_id uuid references public.promotion_campaigns(id) on delete set null,
  occurred_at timestamptz not null default now(),
  unique (visitor_id, event_key)
);

create index if not exists tourism_visitor_events_time_idx
  on public.tourism_visitor_events (occurred_at desc);
create index if not exists tourism_visitor_events_destination_idx
  on public.tourism_visitor_events (destination_id, event_name, occurred_at desc)
  where destination_id is not null;
create index if not exists tourism_visitor_events_feature_idx
  on public.tourism_visitor_events (feature_key, occurred_at desc)
  where feature_key is not null;
create index if not exists tourism_visitor_events_campaign_idx
  on public.tourism_visitor_events (campaign_id, event_name, occurred_at desc)
  where campaign_id is not null;

alter table public.tourism_visitor_events enable row level security;
revoke all on public.tourism_visitor_events from anon, authenticated;
grant insert, select on public.tourism_visitor_events to authenticated;
drop policy if exists "Visitors can add their own analytics events" on public.tourism_visitor_events;
create policy "Visitors can add their own analytics events"
  on public.tourism_visitor_events for insert to authenticated
  with check ((select auth.uid()) = visitor_id);
drop policy if exists "Staff can read aggregate source events" on public.tourism_visitor_events;
create policy "Staff can read aggregate source events"
  on public.tourism_visitor_events for select to authenticated
  using ((select public.has_staff_role('editor')));

create table if not exists public.tourism_survey_responses (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('website', 'destination')),
  destination_id uuid references public.destinations(id) on delete cascade,
  survey_month date not null,
  rating smallint not null check (rating between 1 and 5),
  suggestion text check (suggestion is null or char_length(suggestion) <= 1500),
  created_at timestamptz not null default now(),
  constraint tourism_survey_target_matches_scope check (
    (scope = 'website' and destination_id is null) or
    (scope = 'destination' and destination_id is not null)
  )
);

create unique index if not exists tourism_survey_website_monthly_unique
  on public.tourism_survey_responses (visitor_id, survey_month)
  where scope = 'website';
create unique index if not exists tourism_survey_destination_monthly_unique
  on public.tourism_survey_responses (visitor_id, destination_id, survey_month)
  where scope = 'destination';
create index if not exists tourism_survey_responses_created_idx
  on public.tourism_survey_responses (created_at desc);

alter table public.tourism_survey_responses enable row level security;
revoke all on public.tourism_survey_responses from anon, authenticated;
grant select on public.tourism_survey_responses to authenticated;
drop policy if exists "Visitors can read their own survey response" on public.tourism_survey_responses;
create policy "Visitors can read their own survey response"
  on public.tourism_survey_responses for select to authenticated
  using ((select auth.uid()) = visitor_id);
drop policy if exists "Staff can read survey feedback" on public.tourism_survey_responses;
create policy "Staff can read survey feedback"
  on public.tourism_survey_responses for select to authenticated
  using ((select public.has_staff_role('editor')));

alter table public.promotion_campaigns
  add column if not exists form_schema jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'promotion_campaign_form_schema_array'
      and conrelid = 'public.promotion_campaigns'::regclass
  ) then
    alter table public.promotion_campaigns
      add constraint promotion_campaign_form_schema_array
      check (jsonb_typeof(form_schema) = 'array' and jsonb_array_length(form_schema) <= 12);
  end if;
end $$;
-- Public API filters status, while the existing RLS policy limits visible rows
-- to campaigns that are currently published and in date range.
grant select (form_schema, status) on public.promotion_campaigns to anon, authenticated;

-- PostgreSQL exposes object keys as a set; count them with this immutable helper.
create or replace function public.jsonb_object_size(p_value jsonb)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select count(*)::integer
  from pg_catalog.jsonb_object_keys(coalesce(p_value, '{}'::jsonb));
$function$;

create table if not exists public.tourism_campaign_responses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  visitor_id uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (campaign_id, visitor_id)
);

-- Keep this migration safe to rerun if an earlier SQL Editor attempt created
-- the table before failing later in the script.
alter table public.tourism_campaign_responses
  add column if not exists response_values jsonb;
update public.tourism_campaign_responses
  set response_values = '{}'::jsonb
  where response_values is null;
alter table public.tourism_campaign_responses
  alter column response_values set not null;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tourism_campaign_response_values_object'
      and conrelid = 'public.tourism_campaign_responses'::regclass
  ) then
    alter table public.tourism_campaign_responses
      add constraint tourism_campaign_response_values_object
      check (jsonb_typeof(response_values) = 'object' and public.jsonb_object_size(response_values) <= 12);
  end if;
end $$;

alter table public.tourism_campaign_responses enable row level security;
revoke all on public.tourism_campaign_responses from anon, authenticated;
grant select on public.tourism_campaign_responses to authenticated;
drop policy if exists "Visitors can read their own campaign response" on public.tourism_campaign_responses;
create policy "Visitors can read their own campaign response"
  on public.tourism_campaign_responses for select to authenticated
  using ((select auth.uid()) = visitor_id);
drop policy if exists "Staff can read campaign responses" on public.tourism_campaign_responses;
create policy "Staff can read campaign responses"
  on public.tourism_campaign_responses for select to authenticated
  using ((select public.has_staff_role('editor')));

create or replace function public.get_tourism_survey_status(p_scope text, p_destination_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid := auth.uid();
  v_month date := date_trunc('month', now() at time zone 'Asia/Jakarta')::date;
  v_answered boolean;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  if p_scope is null or p_scope not in ('website', 'destination')
    or (p_scope = 'website' and p_destination_id is not null)
    or (p_scope = 'destination' and p_destination_id is null) then
    return jsonb_build_object('error', 'INVALID_SURVEY_TARGET');
  end if;
  if p_scope = 'destination' and not exists (
    select 1 from public.destinations where id = p_destination_id and is_published
  ) then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;
  select exists (
    select 1 from public.tourism_survey_responses response
    where response.visitor_id = v_visitor_id and response.scope = p_scope
      and response.survey_month = v_month
      and ((p_scope = 'website' and response.destination_id is null)
        or (p_scope = 'destination' and response.destination_id = p_destination_id))
  ) into v_answered;
  return jsonb_build_object('canRespond', not v_answered, 'answered', v_answered, 'month', v_month);
end;
$$;

create or replace function public.submit_tourism_survey(
  p_scope text, p_destination_id uuid, p_rating integer, p_suggestion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid := auth.uid();
  v_month date := date_trunc('month', now() at time zone 'Asia/Jakarta')::date;
  v_inserted integer;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  if p_scope is null or p_scope not in ('website', 'destination')
    or (p_scope = 'website' and p_destination_id is not null)
    or (p_scope = 'destination' and p_destination_id is null)
    or p_rating is null or p_rating not between 1 and 5
    or char_length(trim(coalesce(p_suggestion, ''))) > 1500 then
    return jsonb_build_object('error', 'INVALID_SURVEY_RESPONSE');
  end if;
  if p_scope = 'destination' and not exists (
    select 1 from public.destinations where id = p_destination_id and is_published
  ) then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;
  insert into public.tourism_survey_responses(visitor_id, scope, destination_id, survey_month, rating, suggestion)
  values (v_visitor_id, p_scope, p_destination_id, v_month, p_rating,
    nullif(trim(coalesce(p_suggestion, '')), ''))
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('status', 'already_submitted', 'month', v_month); end if;
  return jsonb_build_object('status', 'submitted', 'month', v_month);
end;
$$;

create or replace function public.submit_public_campaign_response(p_campaign_id uuid, p_values jsonb)
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

  insert into public.tourism_campaign_responses(campaign_id, visitor_id, response_values)
  values (p_campaign_id, v_visitor_id, p_values)
  on conflict (campaign_id, visitor_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('status', 'already_submitted'); end if;
  insert into public.tourism_visitor_events(visitor_id, event_key, event_name, page_key, campaign_id, destination_id)
  select v_visitor_id, gen_random_uuid(), 'campaign_conversion', 'other', p_campaign_id, q.destination_id
  from public.qr_points q where q.id = v_campaign.qr_point_id;
  return jsonb_build_object('status', 'submitted');
end;
$$;

create or replace function public.get_staff_tourism_analytics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_staff_role('editor') then
    raise exception 'STAFF_REQUIRED' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'periodDays', v_days,
    'updatedAt', now(),
    'summary', jsonb_build_object(
      'destinationViews', count(*) filter (where event_name = 'destination_view'),
      'uniqueVisitors', count(distinct visitor_id),
      'qrScans', count(*) filter (where event_name = 'qr_scan'),
      'featureUses', count(*) filter (where event_name = 'feature_use'),
      'campaignImpressions', count(*) filter (where event_name = 'campaign_impression'),
      'campaignClicks', count(*) filter (where event_name = 'campaign_click'),
      'campaignResponses', count(*) filter (where event_name = 'campaign_conversion')
    ),
    'destinations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', destination.id, 'slug', destination.slug, 'name', destination.name,
        'views', stats.views, 'visitors', stats.visitors, 'qrScans', stats.qr_scans,
        'averageRating', feedback.average_rating, 'ratings', feedback.ratings
      ) order by stats.visitors desc, stats.views desc)
      from (
        select destination_id,
          count(*) filter (where event_name = 'destination_view') as views,
          count(distinct visitor_id) filter (where event_name = 'destination_view') as visitors,
          count(*) filter (where event_name = 'qr_scan') as qr_scans
        from public.tourism_visitor_events
        where occurred_at >= v_since and destination_id is not null
        group by destination_id
      ) stats
      join public.destinations destination on destination.id = stats.destination_id
      left join lateral (
        select round(avg(rating)::numeric, 1) as average_rating, count(*) as ratings
        from public.tourism_survey_responses response
        where response.scope = 'destination' and response.destination_id = destination.id
          and response.created_at >= v_since
      ) feedback on true
      order by stats.visitors desc, stats.views desc limit 8
    ), '[]'::jsonb),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('key', feature_key, 'uses', usage_count) order by usage_count desc)
      from (
        select feature_key, count(*) as usage_count from public.tourism_visitor_events
        where occurred_at >= v_since and event_name = 'feature_use' and feature_key is not null
        group by feature_key order by usage_count desc limit 8
      ) feature_stats
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', campaign.id, 'title', campaign.title, 'status', campaign.status,
        'experienceType', campaign.experience_type, 'impressions', stats.impressions,
        'clicks', stats.clicks, 'responses', stats.responses,
        'clickRate', case when stats.impressions = 0 then 0 else round(stats.clicks::numeric * 100 / stats.impressions, 1) end
      ) order by stats.impressions desc, stats.clicks desc)
      from (
        select campaign_id,
          count(*) filter (where event_name = 'campaign_impression') as impressions,
          count(*) filter (where event_name = 'campaign_click') as clicks,
          count(*) filter (where event_name = 'campaign_conversion') as responses
        from public.tourism_visitor_events
        where occurred_at >= v_since and campaign_id is not null
        group by campaign_id
      ) stats
      join public.promotion_campaigns campaign on campaign.id = stats.campaign_id
      order by stats.impressions desc, stats.clicks desc limit 8
    ), '[]'::jsonb),
    'surveys', jsonb_build_object(
      'website', (select jsonb_build_object('averageRating', round(avg(rating)::numeric, 1), 'responses', count(*))
        from public.tourism_survey_responses where scope = 'website' and created_at >= v_since),
      'destinations', (select jsonb_build_object('averageRating', round(avg(rating)::numeric, 1), 'responses', count(*))
        from public.tourism_survey_responses where scope = 'destination' and created_at >= v_since)
    ),
    'recentSuggestions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'scope', response.scope,
        'destinationName', destination.name,
        'rating', response.rating,
        'suggestion', left(response.suggestion, 500),
        'submittedAt', response.created_at
      ) order by response.created_at desc)
      from (
        select * from public.tourism_survey_responses
        where created_at >= v_since and suggestion is not null
        order by created_at desc limit 12
      ) response
      left join public.destinations destination on destination.id = response.destination_id
    ), '[]'::jsonb)
  ) into v_result
  from public.tourism_visitor_events where occurred_at >= v_since;
  return v_result;
end;
$$;

revoke all on function public.get_tourism_survey_status(text, uuid) from public, anon;
revoke all on function public.submit_tourism_survey(text, uuid, integer, text) from public, anon;
revoke all on function public.submit_public_campaign_response(uuid, jsonb) from public, anon;
revoke all on function public.get_staff_tourism_analytics(integer) from public, anon;
grant execute on function public.get_tourism_survey_status(text, uuid) to authenticated;
grant execute on function public.submit_tourism_survey(text, uuid, integer, text) to authenticated;
grant execute on function public.submit_public_campaign_response(uuid, jsonb) to authenticated;
grant execute on function public.get_staff_tourism_analytics(integer) to authenticated;
