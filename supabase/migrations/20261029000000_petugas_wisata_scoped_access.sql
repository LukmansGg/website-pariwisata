-- Scope the existing `editor` role to the destinations it created. The UI
-- presents this role as "Petugas Wisata"; stored role values remain stable.

create or replace function public.can_manage_destination(p_destination_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.has_staff_role('admin'))
    or exists (
      select 1 from public.destinations d
      join public.user_roles r on r.user_id = (select auth.uid()) and r.role in ('editor', 'destination_manager')
      where d.id = p_destination_id and d.created_by = (select auth.uid())
    )
    or exists (
      select 1 from public.user_destination_access a
      join public.user_roles r on r.user_id = a.user_id and r.role = 'destination_manager'
      where a.destination_id = p_destination_id and a.user_id = (select auth.uid())
    );
$$;
revoke all on function public.can_manage_destination(uuid) from public, anon;
grant execute on function public.can_manage_destination(uuid) to authenticated;

-- Remove legacy assignments from the editor role; Petugas Wisata now receives
-- scope only through destinations whose created_by matches their user id.
delete from public.user_destination_access access
using public.user_roles role
where role.user_id = access.user_id and role.role = 'editor';

create or replace function public.protect_destination_manager_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.has_staff_role('admin')) and exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('editor', 'destination_manager')
  ) then
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

drop policy if exists "Staff can read all destinations" on public.destinations;
drop policy if exists "Staff and owners can read destinations" on public.destinations;
create policy "Staff and owners can read destinations" on public.destinations
  for select to authenticated using (is_published or (select public.can_manage_destination(id)));
drop policy if exists "Staff can add destinations" on public.destinations;
create policy "Staff can add destinations" on public.destinations
  for insert to authenticated with check (
    (select public.has_staff_role('admin'))
    or (created_by = (select auth.uid()) and not is_published and not is_featured
      and exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('editor', 'destination_manager')))
  );
drop policy if exists "Staff can edit destinations" on public.destinations;
drop policy if exists "Staff and owners can edit destinations" on public.destinations;
create policy "Staff and owners can edit destinations" on public.destinations
  for update to authenticated using ((select public.can_manage_destination(id)))
  with check ((select public.has_staff_role('admin')) or ((select public.can_manage_destination(id)) and not is_published and not is_featured));
drop policy if exists "Only admins can delete destinations" on public.destinations;
create policy "Only admins can delete destinations" on public.destinations
  for delete to authenticated using ((select public.has_staff_role('admin')) or ((select public.can_manage_destination(id)) and created_by = (select auth.uid()) and not is_published));

drop policy if exists "Staff manage QR points" on public.qr_points;
drop policy if exists "Staff and destination owners read QR points" on public.qr_points;
create policy "Staff and destination owners read QR points" on public.qr_points
  for select to authenticated using ((select public.can_manage_destination(destination_id)));
drop policy if exists "Staff and destination owners add QR points" on public.qr_points;
create policy "Staff and destination owners add QR points" on public.qr_points
  for insert to authenticated with check ((select public.can_manage_destination(destination_id)));
drop policy if exists "Staff and destination owners edit QR points" on public.qr_points;
create policy "Staff and destination owners edit QR points" on public.qr_points
  for update to authenticated using ((select public.can_manage_destination(destination_id)))
  with check ((select public.can_manage_destination(destination_id)));
drop policy if exists "Staff delete QR points" on public.qr_points;
create policy "Staff delete QR points" on public.qr_points
  for delete to authenticated using ((select public.can_manage_destination(destination_id)));

-- UMKM remains an admin-managed area. Petugas Wisata cannot read or change it.
drop policy if exists "Staff manage tourism partners" on public.tourism_partners;
create policy "Admins manage tourism partners" on public.tourism_partners
  for all to authenticated using ((select public.has_staff_role('admin')))
  with check ((select public.has_staff_role('admin')));

-- Restrict minigame assignments and nested QR configuration by destination.
drop policy if exists "Staff manage minigame programs" on public.tourism_minigame_programs;
create policy "Admins manage minigame programs" on public.tourism_minigame_programs
  for all to authenticated using ((select public.has_staff_role('admin')))
  with check ((select public.has_staff_role('admin')));
drop policy if exists "Staff manage minigame destination assignments" on public.tourism_minigame_destinations;
drop policy if exists "Managers read their minigame assignments" on public.tourism_minigame_destinations;
create policy "Staff manage scoped minigame assignments" on public.tourism_minigame_destinations
  for all to authenticated using ((select public.can_manage_destination(destination_id)))
  with check ((select public.can_manage_destination(destination_id)));
drop policy if exists "Staff manage minigame QR points" on public.tourism_minigame_qr_points;
drop policy if exists "Managers read their minigame QR groups" on public.tourism_minigame_qr_points;
create policy "Staff manage scoped minigame QR groups" on public.tourism_minigame_qr_points
  for all to authenticated using (exists (select 1 from public.tourism_minigame_destinations a where a.id = assignment_id and (select public.can_manage_destination(a.destination_id))))
  with check (exists (select 1 from public.tourism_minigame_destinations a where a.id = assignment_id and (select public.can_manage_destination(a.destination_id))));
drop policy if exists "Staff manage minigame QR dependencies" on public.tourism_minigame_qr_dependencies;
drop policy if exists "Managers read their minigame QR dependencies" on public.tourism_minigame_qr_dependencies;
create policy "Staff manage scoped minigame QR dependencies" on public.tourism_minigame_qr_dependencies
  for all to authenticated using (exists (select 1 from public.tourism_minigame_destinations a where a.id = assignment_id and (select public.can_manage_destination(a.destination_id))))
  with check (exists (select 1 from public.tourism_minigame_destinations a where a.id = assignment_id and (select public.can_manage_destination(a.destination_id))));

create or replace function public.enforce_minigame_destination_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_destination_id uuid;
begin
  if (select public.has_staff_role('admin')) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name = 'tourism_minigame_destinations' then
    v_destination_id := case when tg_op = 'DELETE' then old.destination_id else new.destination_id end;
  else
    select destination_id into v_destination_id from public.tourism_minigame_destinations
      where id = case when tg_op = 'DELETE' then old.assignment_id else new.assignment_id end;
  end if;
  if v_destination_id is null or not (select public.can_manage_destination(v_destination_id)) then
    raise exception 'MINIGAME_DESTINATION_FORBIDDEN' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists minigame_destination_scope_assignments on public.tourism_minigame_destinations;
create trigger minigame_destination_scope_assignments before insert or update or delete on public.tourism_minigame_destinations for each row execute function public.enforce_minigame_destination_scope();
drop trigger if exists minigame_destination_scope_qr_points on public.tourism_minigame_qr_points;
create trigger minigame_destination_scope_qr_points before insert or update or delete on public.tourism_minigame_qr_points for each row execute function public.enforce_minigame_destination_scope();
drop trigger if exists minigame_destination_scope_dependencies on public.tourism_minigame_qr_dependencies;
create trigger minigame_destination_scope_dependencies before insert or update or delete on public.tourism_minigame_qr_dependencies for each row execute function public.enforce_minigame_destination_scope();

-- The legacy generic save RPC is security-definer and intentionally supports
-- shared-program edits for admins. Prevent non-admin callers from using it to
-- rename a program or reassign a shared library entry.
create or replace function public.protect_minigame_program_library()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select public.has_staff_role('admin')) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op <> 'INSERT' then raise exception 'MINIGAME_PROGRAM_ADMIN_ONLY' using errcode = '42501'; end if;
  if new.created_by is distinct from (select auth.uid())
    or not exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('editor', 'destination_manager')) then
    raise exception 'MINIGAME_PROGRAM_OWNER_REQUIRED' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists minigame_program_library_scope on public.tourism_minigame_programs;
create trigger minigame_program_library_scope before insert or update or delete on public.tourism_minigame_programs for each row execute function public.protect_minigame_program_library();

-- Keep the public RPC name stable while adding an ownership check ahead of the
-- old, fully validated configuration routine.
do $$
begin
  if to_regprocedure('public.configure_tourism_minigame_assignment_legacy(uuid,boolean,text[],text[],text,jsonb,text,integer,integer,jsonb)') is null then
    execute 'alter function public.configure_tourism_minigame_assignment(uuid,boolean,text[],text[],text,jsonb,text,integer,integer,jsonb) rename to configure_tourism_minigame_assignment_legacy';
  end if;
end $$;
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
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_destination_id uuid;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'STAFF_REQUIRED'); end if;
  select destination_id into v_destination_id from public.tourism_minigame_destinations where id = p_assignment_id;
  if v_destination_id is null then return jsonb_build_object('error', 'ASSIGNMENT_NOT_FOUND'); end if;
  if not public.can_manage_destination(v_destination_id) then return jsonb_build_object('error', 'STAFF_REQUIRED'); end if;
  return public.configure_tourism_minigame_assignment_legacy(
    p_assignment_id, p_is_enabled, p_components, p_required_components, p_photobox_access_mode,
    p_photobox_templates, p_caption_template, p_max_caption_length,
    p_max_dependency_distance_meters, p_find_points
  );
end;
$$;
revoke all on function public.configure_tourism_minigame_assignment_legacy(uuid,boolean,text[],text[],text,jsonb,text,integer,integer,jsonb) from public, anon, authenticated;
revoke all on function public.configure_tourism_minigame_assignment(uuid,boolean,text[],text[],text,jsonb,text,integer,integer,jsonb) from public, anon;
grant execute on function public.configure_tourism_minigame_assignment(uuid,boolean,text[],text[],text,jsonb,text,integer,integer,jsonb) to authenticated;

create or replace function public.submit_destination_for_review(p_destination_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := (select auth.uid()); v_request_id uuid;
begin
  if v_user_id is null or not exists (select 1 from public.user_roles where user_id = v_user_id and role in ('editor', 'destination_manager')) then return jsonb_build_object('error', 'MANAGER_REQUIRED'); end if;
  if not public.can_manage_destination(p_destination_id) then return jsonb_build_object('error', 'DESTINATION_FORBIDDEN'); end if;
  if not exists (select 1 from public.destinations d where d.id = p_destination_id and length(trim(d.name)) > 0 and d.image_url is not null and d.latitude is not null and d.longitude is not null and exists (select 1 from public.qr_points q where q.destination_id = d.id and q.is_active)) then return jsonb_build_object('error', 'DESTINATION_INCOMPLETE'); end if;
  insert into public.destination_review_requests(destination_id, manager_user_id, status, feedback, submitted_at, reviewed_by, reviewed_at)
  values (p_destination_id, v_user_id, 'pending', null, now(), null, null)
  on conflict (destination_id) where status = 'pending' do update set manager_user_id = excluded.manager_user_id, feedback = null, submitted_at = now(), reviewed_by = null, reviewed_at = null returning id into v_request_id;
  insert into public.destination_review_events(request_id, destination_id, actor_id, event_type, message) values (v_request_id, p_destination_id, v_user_id, 'submitted', 'Destinasi diajukan untuk ditinjau admin.');
  return jsonb_build_object('requestId', v_request_id);
end;
$$;

create or replace function public.take_down_managed_destination(p_destination_id uuid, p_feedback text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_feedback text := nullif(trim(coalesce(p_feedback, '')), ''); v_manager_id uuid; v_request_id uuid;
begin
  if auth.uid() is null or not (select public.has_staff_role('admin')) then return jsonb_build_object('error', 'ADMIN_REQUIRED'); end if;
  if length(coalesce(v_feedback, '')) < 8 or length(coalesce(v_feedback, '')) > 1200 then return jsonb_build_object('error', 'INVALID_REVIEW'); end if;
  select d.created_by into v_manager_id from public.destinations d join public.user_roles r on r.user_id = d.created_by and r.role = 'editor' where d.id = p_destination_id;
  if v_manager_id is null then select a.user_id into v_manager_id from public.user_destination_access a join public.user_roles r on r.user_id = a.user_id and r.role = 'destination_manager' where a.destination_id = p_destination_id limit 1; end if;
  if v_manager_id is null then return jsonb_build_object('error', 'DESTINATION_NOT_MANAGED'); end if;
  update public.destinations set is_published = false, is_featured = false, updated_at = now() where id = p_destination_id and is_published;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_PUBLISHED'); end if;
  insert into public.destination_review_requests(destination_id, manager_user_id, status, feedback, reviewed_by, reviewed_at) values (p_destination_id, v_manager_id, 'taken_down', v_feedback, (select auth.uid()), now()) returning id into v_request_id;
  insert into public.destination_review_events(request_id, destination_id, actor_id, event_type, message) values (v_request_id, p_destination_id, (select auth.uid()), 'taken_down', v_feedback);
  return jsonb_build_object('status', 'taken_down');
end;
$$;

create or replace function public.create_destination_manager_minigame_program(
  p_name text, p_slug text, p_is_enabled boolean, p_components text[], p_required_components text[], p_destination_ids uuid[], p_default_photobox_access_mode text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_program_id uuid;
  v_photobox_mode text := case when coalesce(p_default_photobox_access_mode, 'standalone') = 'mission_reward' and 'find_friends' = any(coalesce(p_components, '{}')) and 'photobox' = any(coalesce(p_components, '{}')) then 'mission_reward' else 'standalone' end;
  v_count integer;
begin
  if auth.uid() is null or not exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('editor', 'destination_manager')) then return jsonb_build_object('error', 'MANAGER_REQUIRED'); end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120 or coalesce(p_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or coalesce(p_components, '{}') = '{}' or not (coalesce(p_components, '{}') <@ array['find_friends', 'photobox', 'chat_ai']::text[]) or not (coalesce(p_required_components, '{}') <@ array['find_friends', 'photobox']::text[]) or not (coalesce(p_required_components, '{}') <@ coalesce(p_components, '{}')) or 'photobox' = any(coalesce(p_required_components, '{}')) or coalesce(p_default_photobox_access_mode, 'standalone') not in ('standalone', 'mission_reward') or (v_photobox_mode = 'mission_reward' and cardinality(coalesce(p_required_components, '{}')) = 0) or cardinality(coalesce(p_destination_ids, '{}')) = 0 then
    return jsonb_build_object('error', 'INVALID_PROGRAM');
  end if;
  select count(*) into v_count from unnest(p_destination_ids) as selected(destination_id) where public.can_manage_destination(selected.destination_id);
  if v_count <> cardinality(p_destination_ids) then return jsonb_build_object('error', 'DESTINATION_FORBIDDEN'); end if;
  insert into public.tourism_minigame_programs(name, slug, is_enabled, components, required_components, default_photobox_access_mode, created_by, updated_by)
  values (trim(p_name), p_slug, coalesce(p_is_enabled, false), p_components, coalesce(p_required_components, '{}'), v_photobox_mode, auth.uid(), auth.uid()) returning id into v_program_id;
  insert into public.tourism_minigame_destinations(program_id, destination_id, is_enabled, components, required_components, photobox_access_mode)
  select v_program_id, selected.destination_id, coalesce(p_is_enabled, false), p_components, coalesce(p_required_components, '{}'), v_photobox_mode from unnest(p_destination_ids) as selected(destination_id);
  return jsonb_build_object('programId', v_program_id);
exception when unique_violation then return jsonb_build_object('error', 'SLUG_IN_USE');
end;
$$;

alter table public.promotion_campaigns
  add column if not exists approval_status text not null default 'approved',
  add column if not exists approval_feedback text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists submitted_for_review_at timestamptz;
alter table public.promotion_campaigns drop constraint if exists promotion_campaigns_approval_status_check;
alter table public.promotion_campaigns add constraint promotion_campaigns_approval_status_check check (approval_status in ('pending', 'approved', 'changes_requested', 'rejected'));

create or replace function public.protect_petugas_campaign()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.has_staff_role('admin')) and exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('editor', 'destination_manager')) then
    if tg_op = 'INSERT' then
      if new.created_by is distinct from (select auth.uid()) or new.partner_id is not null or new.placement_mode <> 'nearby' or new.status <> 'draft' or new.approval_status <> 'pending' then raise exception 'PETUGAS_CAMPAIGN_REQUIRES_REVIEW' using errcode = '42501'; end if;
    else
      if new.created_by is distinct from old.created_by or new.partner_id is not null or new.placement_mode <> 'nearby' or new.status <> 'draft' or new.approval_status not in ('pending', 'changes_requested') or new.approval_status is distinct from old.approval_status or new.approval_feedback is distinct from old.approval_feedback or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at or new.submitted_for_review_at is distinct from old.submitted_for_review_at then raise exception 'PETUGAS_CAMPAIGN_REQUIRES_REVIEW' using errcode = '42501'; end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists promotion_campaigns_protect_petugas on public.promotion_campaigns;
create trigger promotion_campaigns_protect_petugas before insert or update on public.promotion_campaigns for each row execute function public.protect_petugas_campaign();

drop policy if exists "Staff manage promotion campaigns" on public.promotion_campaigns;
drop policy if exists "Public can read active promotion campaigns" on public.promotion_campaigns;
create policy "Admins manage promotion campaigns" on public.promotion_campaigns for all to authenticated
  using ((select public.has_staff_role('admin'))) with check ((select public.has_staff_role('admin')));
create policy "Petugas read own promotion campaigns" on public.promotion_campaigns for select to authenticated
  using (created_by = (select auth.uid()));
create policy "Petugas create campaign for review" on public.promotion_campaigns for insert to authenticated
  with check (created_by = (select auth.uid()) and partner_id is null and placement_mode = 'nearby' and status = 'draft' and approval_status = 'pending' and exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('editor', 'destination_manager')));
create policy "Petugas edit own pending campaigns" on public.promotion_campaigns for update to authenticated
  using (created_by = (select auth.uid()) and approval_status in ('pending', 'changes_requested') and exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('editor', 'destination_manager')))
  with check (created_by = (select auth.uid()) and partner_id is null and placement_mode = 'nearby' and status = 'draft' and approval_status in ('pending', 'changes_requested'));
create policy "Petugas delete own pending campaigns" on public.promotion_campaigns for delete to authenticated
  using (created_by = (select auth.uid()) and approval_status in ('pending', 'changes_requested') and exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('editor', 'destination_manager')));
create policy "Public can read active promotion campaigns" on public.promotion_campaigns for select to anon, authenticated
  using (status = 'published' and approval_status = 'approved' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

drop policy if exists "Staff manage campaign destinations" on public.promotion_campaign_destinations;
drop policy if exists "Public read active campaign destinations" on public.promotion_campaign_destinations;
create policy "Admins manage campaign destinations" on public.promotion_campaign_destinations for all to authenticated
  using ((select public.has_staff_role('admin'))) with check ((select public.has_staff_role('admin')));
create policy "Petugas manage own campaign destinations" on public.promotion_campaign_destinations for all to authenticated
  using (exists (select 1 from public.promotion_campaigns c where c.id = campaign_id and c.created_by = (select auth.uid()) and c.placement_mode = 'nearby' and c.status = 'draft' and c.approval_status in ('pending', 'changes_requested')))
  with check (exists (select 1 from public.promotion_campaigns c where c.id = campaign_id and c.created_by = (select auth.uid()) and c.placement_mode = 'nearby' and c.status = 'draft' and c.approval_status in ('pending', 'changes_requested')) and (select public.can_manage_destination(destination_id)));
create policy "Public read active campaign destinations" on public.promotion_campaign_destinations for select to anon, authenticated
  using (exists (select 1 from public.promotion_campaigns c where c.id = campaign_id and c.status = 'published' and c.approval_status = 'approved' and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())));

drop policy if exists "Staff manage campaign minigames" on public.promotion_campaign_minigames;
drop policy if exists "Public read active campaign minigames" on public.promotion_campaign_minigames;
create policy "Admins manage campaign minigames" on public.promotion_campaign_minigames for all to authenticated
  using ((select public.has_staff_role('admin'))) with check ((select public.has_staff_role('admin')));
create policy "Public read active campaign minigames" on public.promotion_campaign_minigames for select to anon, authenticated
  using (exists (select 1 from public.promotion_campaigns c where c.id = campaign_id and c.status = 'published' and c.approval_status = 'approved' and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())));

create or replace function public.review_petugas_campaign(p_campaign_id uuid, p_decision text, p_feedback text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_campaign public.promotion_campaigns%rowtype; v_feedback text := nullif(trim(coalesce(p_feedback, '')), '');
begin
  if auth.uid() is null or not (select public.has_staff_role('admin')) then return jsonb_build_object('error', 'ADMIN_REQUIRED'); end if;
  if p_decision not in ('approved', 'changes_requested', 'rejected') or (p_decision in ('changes_requested', 'rejected') and length(coalesce(v_feedback, '')) < 8) or length(coalesce(v_feedback, '')) > 1200 then return jsonb_build_object('error', 'INVALID_REVIEW'); end if;
  select * into v_campaign from public.promotion_campaigns where id = p_campaign_id for update;
  if not found or v_campaign.approval_status not in ('pending', 'changes_requested') then return jsonb_build_object('error', 'CAMPAIGN_NOT_PENDING'); end if;
  if p_decision = 'approved' and not exists (select 1 from public.promotion_campaign_destinations cd join public.destinations d on d.id = cd.destination_id where cd.campaign_id = p_campaign_id) then return jsonb_build_object('error', 'DESTINATION_REQUIRED'); end if;
  update public.promotion_campaigns set approval_status = p_decision, approval_feedback = v_feedback, reviewed_by = (select auth.uid()), reviewed_at = now(), status = case when p_decision = 'approved' then 'published' else 'draft' end where id = p_campaign_id;
  return jsonb_build_object('status', p_decision);
end;
$$;
revoke all on function public.review_petugas_campaign(uuid, text, text) from public, anon;
grant execute on function public.review_petugas_campaign(uuid, text, text) to authenticated;

create or replace function public.revoke_destination_manager_access(p_manager_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (select public.has_staff_role('admin')) then return jsonb_build_object('error', 'ADMIN_REQUIRED'); end if;
  if not exists (select 1 from public.user_roles where user_id = p_manager_user_id and role in ('destination_manager', 'editor')) then return jsonb_build_object('error', 'MANAGER_NOT_FOUND'); end if;
  delete from public.user_destination_access where user_id = p_manager_user_id;
  delete from public.user_roles where user_id = p_manager_user_id and role in ('destination_manager', 'editor');
  return jsonb_build_object('status', 'revoked');
end;
$$;
revoke all on function public.revoke_destination_manager_access(uuid) from public, anon;
grant execute on function public.revoke_destination_manager_access(uuid) to authenticated;

-- Petugas Wisata (the editor role) can only manage destinations created by
-- their account. Aggregate visitor data and individual session rows stay admin-only.
drop policy if exists "Staff can read aggregate source events" on public.tourism_visitor_events;
drop policy if exists "Admins can read aggregate source events" on public.tourism_visitor_events;
create policy "Admins can read aggregate source events" on public.tourism_visitor_events
  for select to authenticated using ((select public.has_staff_role('admin')));

drop policy if exists "Staff can read survey feedback" on public.tourism_survey_responses;
drop policy if exists "Admins can read survey feedback" on public.tourism_survey_responses;
create policy "Admins can read survey feedback" on public.tourism_survey_responses
  for select to authenticated using ((select public.has_staff_role('admin')));

drop policy if exists "Staff can read campaign responses" on public.tourism_campaign_responses;
drop policy if exists "Admins can read campaign responses" on public.tourism_campaign_responses;
create policy "Admins can read campaign responses" on public.tourism_campaign_responses
  for select to authenticated using ((select public.has_staff_role('admin')));

drop policy if exists "Staff can read visitor session monitor rows" on public.tourism_visitor_sessions;
drop policy if exists "Admins can read visitor session monitor rows" on public.tourism_visitor_sessions;
create policy "Admins can read visitor session monitor rows" on public.tourism_visitor_sessions
  for select to authenticated using ((select public.has_staff_role('admin')));

-- Keep the established aggregate response shape while narrowing its SECURITY
-- DEFINER gate from all editors to administrators only. Safe to re-run.
do $$
declare v_definition text;
begin
  v_definition := pg_get_functiondef('public.get_staff_tourism_analytics(integer)'::regprocedure);
  if position('not public.has_staff_role(''editor'')' in v_definition) > 0 then
    v_definition := replace(v_definition, 'not public.has_staff_role(''editor'')', 'not public.has_staff_role(''admin'')');
    execute v_definition;
  elsif position('not public.has_staff_role(''admin'')' in v_definition) = 0 then
    raise exception 'Could not safely narrow tourism analytics authorization';
  end if;
end;
$$;
