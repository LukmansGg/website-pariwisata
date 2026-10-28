-- Scoped external destination managers with admin moderation and auditable feedback.

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'editor', 'destination_manager'));

create table if not exists public.user_destination_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, destination_id)
);
create unique index if not exists user_destination_access_single_owner_idx
  on public.user_destination_access(destination_id);

create or replace function public.enforce_destination_manager_access_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.user_roles where user_id = new.user_id and role = 'destination_manager') then
    raise exception 'DESTINATION_MANAGER_ROLE_REQUIRED' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists user_destination_access_require_manager_role on public.user_destination_access;
create trigger user_destination_access_require_manager_role
  before insert or update of user_id on public.user_destination_access
  for each row execute function public.enforce_destination_manager_access_role();

alter table public.user_destination_access enable row level security;
revoke all on public.user_destination_access from anon, authenticated;
grant select, insert, delete on public.user_destination_access to authenticated;

drop policy if exists "Managers read their destination access" on public.user_destination_access;
create policy "Managers read their destination access"
  on public.user_destination_access for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_staff_role('admin')));
drop policy if exists "Admins grant destination access" on public.user_destination_access;
create policy "Admins grant destination access"
  on public.user_destination_access for insert to authenticated
  with check ((select public.has_staff_role('admin')));
drop policy if exists "Admins revoke destination access" on public.user_destination_access;
create policy "Admins revoke destination access"
  on public.user_destination_access for delete to authenticated
  using ((select public.has_staff_role('admin')));

create or replace function public.can_manage_destination(p_destination_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.has_staff_role('editor')) or exists (
    select 1 from public.user_destination_access access
    join public.user_roles role on role.user_id = access.user_id
    where access.destination_id = p_destination_id
      and access.user_id = (select auth.uid())
      and role.role = 'destination_manager'
  );
$$;
revoke all on function public.can_manage_destination(uuid) from public, anon;
grant execute on function public.can_manage_destination(uuid) to authenticated;

create or replace function public.attach_new_destination_manager_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by = (select auth.uid()) and exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'destination_manager'
  ) then
    insert into public.user_destination_access(user_id, destination_id, granted_by)
    values ((select auth.uid()), new.id, (select auth.uid()))
    on conflict (user_id, destination_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists destinations_attach_manager_access on public.destinations;
create trigger destinations_attach_manager_access
  after insert on public.destinations
  for each row execute function public.attach_new_destination_manager_access();

create or replace function public.protect_destination_manager_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'destination_manager'
  ) and not (select public.has_staff_role('editor')) then
    if new.created_by is distinct from old.created_by then
      raise exception 'DESTINATION_OWNER_IMMUTABLE' using errcode = '42501';
    end if;
    if new.is_published or new.is_featured then
      raise exception 'DESTINATION_REQUIRES_ADMIN_REVIEW' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists destinations_protect_manager_fields on public.destinations;
create trigger destinations_protect_manager_fields
  before update on public.destinations
  for each row execute function public.protect_destination_manager_fields();

drop policy if exists "Staff can read all destinations" on public.destinations;
create policy "Staff and owners can read destinations"
  on public.destinations for select to authenticated
  using (is_published or (select public.has_staff_role('editor')) or (select public.can_manage_destination(id)));

drop policy if exists "Staff can add destinations" on public.destinations;
create policy "Staff can add destinations"
  on public.destinations for insert to authenticated
  with check (
    (select public.has_staff_role('editor'))
    or (
      exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'destination_manager')
      and created_by = (select auth.uid()) and not is_published and not is_featured
    )
  );

drop policy if exists "Staff can edit destinations" on public.destinations;
create policy "Staff and owners can edit destinations"
  on public.destinations for update to authenticated
  using ((select public.has_staff_role('editor')) or (select public.can_manage_destination(id)))
  with check (
    (select public.has_staff_role('editor'))
    or ((select public.can_manage_destination(id)) and not is_published and not is_featured)
  );

drop policy if exists "Staff manage QR points" on public.qr_points;
drop policy if exists "Staff and destination owners read QR points" on public.qr_points;
create policy "Staff and destination owners read QR points"
  on public.qr_points for select to authenticated
  using ((select public.has_staff_role('editor')) or (select public.can_manage_destination(destination_id)));
drop policy if exists "Staff and destination owners add QR points" on public.qr_points;
create policy "Staff and destination owners add QR points"
  on public.qr_points for insert to authenticated
  with check ((select public.has_staff_role('editor')) or (select public.can_manage_destination(destination_id)));
drop policy if exists "Staff and destination owners edit QR points" on public.qr_points;
create policy "Staff and destination owners edit QR points"
  on public.qr_points for update to authenticated
  using ((select public.has_staff_role('editor')) or (select public.can_manage_destination(destination_id)))
  with check ((select public.has_staff_role('editor')) or (select public.can_manage_destination(destination_id)));
drop policy if exists "Staff delete QR points" on public.qr_points;
create policy "Staff delete QR points"
  on public.qr_points for delete to authenticated
  using ((select public.has_staff_role('editor')));

create table if not exists public.destination_review_requests (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'taken_down')),
  feedback text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists destination_review_one_pending_per_destination
  on public.destination_review_requests(destination_id) where status = 'pending';
create index if not exists destination_review_manager_recent_idx
  on public.destination_review_requests(manager_user_id, created_at desc);
create index if not exists destination_review_queue_idx
  on public.destination_review_requests(status, submitted_at) where status = 'pending';

create table if not exists public.destination_review_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.destination_review_requests(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('submitted', 'approved', 'changes_requested', 'taken_down')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists destination_review_events_recent_idx
  on public.destination_review_events(destination_id, created_at desc);
alter table public.destination_review_requests enable row level security;
alter table public.destination_review_events enable row level security;
revoke all on public.destination_review_requests, public.destination_review_events from anon, authenticated;
grant select on public.destination_review_requests, public.destination_review_events to authenticated;

drop policy if exists "Managers read their review feedback" on public.destination_review_requests;
create policy "Managers read their review feedback"
  on public.destination_review_requests for select to authenticated
  using (manager_user_id = (select auth.uid()) or (select public.has_staff_role('admin')));
drop policy if exists "Admins read all review events" on public.destination_review_events;
create policy "Admins read all review events"
  on public.destination_review_events for select to authenticated
  using ((select public.has_staff_role('admin')));
drop policy if exists "Managers read their review events" on public.destination_review_events;
create policy "Managers read their review events"
  on public.destination_review_events for select to authenticated
  using (exists (
    select 1 from public.destination_review_requests request
    where request.id = public.destination_review_events.request_id and request.manager_user_id = (select auth.uid())
  ));

create or replace function public.submit_destination_for_review(p_destination_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request_id uuid;
begin
  if v_user_id is null or not exists (
    select 1 from public.user_roles where user_id = v_user_id and role = 'destination_manager'
  ) then return jsonb_build_object('error', 'MANAGER_REQUIRED'); end if;
  if not public.can_manage_destination(p_destination_id) then return jsonb_build_object('error', 'DESTINATION_FORBIDDEN'); end if;
  if not exists (
    select 1 from public.destinations d
    where d.id = p_destination_id and length(trim(d.name)) > 0
      and d.image_url is not null and d.latitude is not null and d.longitude is not null
      and exists (select 1 from public.qr_points q where q.destination_id = d.id and q.is_active)
  ) then return jsonb_build_object('error', 'DESTINATION_INCOMPLETE'); end if;

  insert into public.destination_review_requests(destination_id, manager_user_id, status, feedback, submitted_at, reviewed_by, reviewed_at)
  values (p_destination_id, v_user_id, 'pending', null, now(), null, null)
  on conflict (destination_id) where status = 'pending'
  do update set manager_user_id = excluded.manager_user_id, feedback = null, submitted_at = now(), reviewed_by = null, reviewed_at = null
  returning id into v_request_id;

  insert into public.destination_review_events(request_id, destination_id, actor_id, event_type, message)
  values (v_request_id, p_destination_id, v_user_id, 'submitted', 'Destinasi diajukan untuk ditinjau admin.');
  return jsonb_build_object('requestId', v_request_id);
end;
$$;

create or replace function public.review_destination_submission(p_request_id uuid, p_decision text, p_feedback text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.destination_review_requests%rowtype;
  v_feedback text := nullif(trim(coalesce(p_feedback, '')), '');
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'
  ) then return jsonb_build_object('error', 'ADMIN_REQUIRED'); end if;
  if p_decision not in ('approved', 'changes_requested', 'taken_down')
    or (p_decision in ('changes_requested', 'taken_down') and length(coalesce(v_feedback, '')) < 8)
    or length(coalesce(v_feedback, '')) > 1200 then
    return jsonb_build_object('error', 'INVALID_REVIEW');
  end if;
  select * into v_request from public.destination_review_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then return jsonb_build_object('error', 'REVIEW_NOT_PENDING'); end if;

  if p_decision = 'approved' and not exists (
    select 1 from public.destinations d
    where d.id = v_request.destination_id and d.image_url is not null and d.latitude is not null and d.longitude is not null
      and exists (select 1 from public.qr_points q where q.destination_id = d.id and q.is_active)
  ) then return jsonb_build_object('error', 'DESTINATION_INCOMPLETE'); end if;

  update public.destinations set is_published = (p_decision = 'approved'), is_featured = false, updated_at = now()
  where id = v_request.destination_id;
  update public.destination_review_requests set status = p_decision, feedback = v_feedback,
    reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_request_id;
  insert into public.destination_review_events(request_id, destination_id, actor_id, event_type, message)
  values (p_request_id, v_request.destination_id, (select auth.uid()), p_decision,
    coalesce(v_feedback, 'Destinasi telah disetujui admin.'));
  return jsonb_build_object('status', p_decision);
end;
$$;

create or replace function public.take_down_managed_destination(p_destination_id uuid, p_feedback text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feedback text := nullif(trim(coalesce(p_feedback, '')), '');
  v_manager_id uuid;
  v_request_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'
  ) then return jsonb_build_object('error', 'ADMIN_REQUIRED'); end if;
  if length(coalesce(v_feedback, '')) < 8 or length(coalesce(v_feedback, '')) > 1200 then
    return jsonb_build_object('error', 'INVALID_REVIEW');
  end if;
  select access.user_id into v_manager_id from public.user_destination_access access
  join public.user_roles role on role.user_id = access.user_id and role.role = 'destination_manager'
  where access.destination_id = p_destination_id limit 1;
  if v_manager_id is null then return jsonb_build_object('error', 'DESTINATION_NOT_MANAGED'); end if;

  update public.destinations set is_published = false, is_featured = false, updated_at = now()
  where id = p_destination_id and is_published;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_PUBLISHED'); end if;
  insert into public.destination_review_requests(destination_id, manager_user_id, status, feedback, reviewed_by, reviewed_at)
  values (p_destination_id, v_manager_id, 'taken_down', v_feedback, (select auth.uid()), now())
  returning id into v_request_id;
  insert into public.destination_review_events(request_id, destination_id, actor_id, event_type, message)
  values (v_request_id, p_destination_id, (select auth.uid()), 'taken_down', v_feedback);
  return jsonb_build_object('status', 'taken_down');
end;
$$;

revoke all on function public.submit_destination_for_review(uuid) from public, anon;
revoke all on function public.review_destination_submission(uuid, text, text) from public, anon;
revoke all on function public.take_down_managed_destination(uuid, text) from public, anon;
grant execute on function public.submit_destination_for_review(uuid) to authenticated;
grant execute on function public.review_destination_submission(uuid, text, text) to authenticated;
grant execute on function public.take_down_managed_destination(uuid, text) to authenticated;

drop policy if exists "Staff manage minigame programs" on public.tourism_minigame_programs;
create policy "Staff manage minigame programs" on public.tourism_minigame_programs
  for all to authenticated using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));
drop policy if exists "Managers read programs assigned to their destinations" on public.tourism_minigame_programs;
create policy "Managers read programs assigned to their destinations"
  on public.tourism_minigame_programs for select to authenticated
  using (exists (
    select 1 from public.tourism_minigame_destinations assignment
    where assignment.program_id = id and (select public.can_manage_destination(assignment.destination_id))
  ));
drop policy if exists "Managers read their minigame assignments" on public.tourism_minigame_destinations;
create policy "Managers read their minigame assignments"
  on public.tourism_minigame_destinations for select to authenticated
  using ((select public.can_manage_destination(destination_id)));
drop policy if exists "Managers read their minigame QR groups" on public.tourism_minigame_qr_points;
create policy "Managers read their minigame QR groups"
  on public.tourism_minigame_qr_points for select to authenticated
  using (exists (
    select 1 from public.tourism_minigame_destinations assignment
    where assignment.id = assignment_id and (select public.can_manage_destination(assignment.destination_id))
  ));
drop policy if exists "Managers read their minigame QR dependencies" on public.tourism_minigame_qr_dependencies;
create policy "Managers read their minigame QR dependencies"
  on public.tourism_minigame_qr_dependencies for select to authenticated
  using (exists (
    select 1 from public.tourism_minigame_destinations assignment
    where assignment.id = assignment_id and (select public.can_manage_destination(assignment.destination_id))
  ));

create or replace function public.create_destination_manager_minigame_program(
  p_name text,
  p_slug text,
  p_is_enabled boolean,
  p_components text[],
  p_required_components text[],
  p_destination_ids uuid[],
  p_default_photobox_access_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program_id uuid;
  v_photobox_mode text := case
    when coalesce(p_default_photobox_access_mode, 'standalone') = 'mission_reward'
      and 'find_friends' = any(coalesce(p_components, '{}'))
      and 'photobox' = any(coalesce(p_components, '{}')) then 'mission_reward'
    else 'standalone' end;
  v_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'destination_manager'
  ) then return jsonb_build_object('error', 'MANAGER_REQUIRED'); end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120
    or coalesce(p_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or coalesce(p_components, '{}') = '{}'
    or not (coalesce(p_components, '{}') <@ array['find_friends', 'photobox', 'chat_ai']::text[])
    or not (coalesce(p_required_components, '{}') <@ array['find_friends', 'photobox']::text[])
    or not (coalesce(p_required_components, '{}') <@ coalesce(p_components, '{}'))
    or 'photobox' = any(coalesce(p_required_components, '{}'))
    or coalesce(p_default_photobox_access_mode, 'standalone') not in ('standalone', 'mission_reward')
    or (v_photobox_mode = 'mission_reward' and cardinality(coalesce(p_required_components, '{}')) = 0)
    or cardinality(coalesce(p_destination_ids, '{}')) = 0 then
    return jsonb_build_object('error', 'INVALID_PROGRAM');
  end if;
  select count(*) into v_count from unnest(p_destination_ids) as selected(destination_id)
    where public.can_manage_destination(selected.destination_id);
  if v_count <> cardinality(p_destination_ids) then return jsonb_build_object('error', 'DESTINATION_FORBIDDEN'); end if;

  insert into public.tourism_minigame_programs(name, slug, is_enabled, components, required_components, default_photobox_access_mode, created_by, updated_by)
  values (trim(p_name), p_slug, coalesce(p_is_enabled, false), p_components, coalesce(p_required_components, '{}'), v_photobox_mode, auth.uid(), auth.uid())
  returning id into v_program_id;
  insert into public.tourism_minigame_destinations(program_id, destination_id, is_enabled, components, required_components, photobox_access_mode)
  select v_program_id, selected.destination_id, coalesce(p_is_enabled, false), p_components, coalesce(p_required_components, '{}'), v_photobox_mode
  from unnest(p_destination_ids) as selected(destination_id);
  return jsonb_build_object('programId', v_program_id);
exception when unique_violation then
  return jsonb_build_object('error', 'SLUG_IN_USE');
end;
$$;

revoke all on function public.create_destination_manager_minigame_program(text, text, boolean, text[], text[], uuid[], text) from public, anon;
grant execute on function public.create_destination_manager_minigame_program(text, text, boolean, text[], text[], uuid[], text) to authenticated;

-- Keep all existing minigame validation; permit the assignment owner through the same scoped helper.
do $$
declare
  v_signature regprocedure := 'public.configure_tourism_minigame_assignment(uuid,boolean,text[],text[],text,jsonb,text,integer,integer,jsonb)'::regprocedure;
  v_definition text;
  v_old text := 'if auth.uid() is null or not public.has_staff_role(''editor'') then return jsonb_build_object(''error'', ''STAFF_REQUIRED''); end if;';
  v_new text := 'if auth.uid() is null then return jsonb_build_object(''error'', ''STAFF_REQUIRED''); end if;';
begin
  v_definition := pg_get_functiondef(v_signature);
  if position(v_old in v_definition) = 0 then
    raise exception 'Could not safely extend minigame assignment authorization';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := 'if not found then return jsonb_build_object(''error'', ''ASSIGNMENT_NOT_FOUND''); end if;';
  v_new := 'if not found then return jsonb_build_object(''error'', ''ASSIGNMENT_NOT_FOUND''); end if; if not public.has_staff_role(''editor'') and not public.can_manage_destination(v_assignment.destination_id) then return jsonb_build_object(''error'', ''STAFF_REQUIRED''); end if;';
  if position(v_old in v_definition) = 0 then
    raise exception 'Could not safely add minigame ownership check';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;
