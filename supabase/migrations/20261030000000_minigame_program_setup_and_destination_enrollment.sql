-- Keep minigame setup on the program and enroll one program per destination.
alter table public.tourism_minigame_destinations
  add column if not exists is_selected boolean not null default false;

-- Preserve one destination-level selection when migrating older multi-assignment data.
do $$
declare
  v_scope_trigger_state "char";
begin
  if to_regclass('public.tourism_minigame_one_selected_per_destination') is null then
    -- This is a one-time, database-wide backfill. The row-level scope trigger
    -- is meant to protect staff edits, but the SQL migration may run without
    -- an authenticated admin JWT, so suspend that trigger only for this update.
    select tgenabled into v_scope_trigger_state
    from pg_trigger
    where tgrelid = 'public.tourism_minigame_destinations'::regclass
      and tgname = 'minigame_destination_scope_assignments'
      and not tgisinternal;

    if v_scope_trigger_state is not null and v_scope_trigger_state <> 'D' then
      execute 'alter table public.tourism_minigame_destinations disable trigger minigame_destination_scope_assignments';
    end if;

    with ranked_assignments as (
      select id, row_number() over (
        partition by destination_id order by is_selected desc, is_enabled desc, updated_at desc, created_at desc, id
      ) as selection_rank
      from public.tourism_minigame_destinations
    )
    update public.tourism_minigame_destinations assignment
      set is_selected = ranked_assignments.selection_rank = 1
      from ranked_assignments
      where ranked_assignments.id = assignment.id;

    execute 'create unique index tourism_minigame_one_selected_per_destination on public.tourism_minigame_destinations(destination_id) where is_selected';

    if v_scope_trigger_state = 'O' then
      execute 'alter table public.tourism_minigame_destinations enable trigger minigame_destination_scope_assignments';
    elsif v_scope_trigger_state = 'R' then
      execute 'alter table public.tourism_minigame_destinations enable replica trigger minigame_destination_scope_assignments';
    elsif v_scope_trigger_state = 'A' then
      execute 'alter table public.tourism_minigame_destinations enable always trigger minigame_destination_scope_assignments';
    end if;
  end if;
end;
$$;

alter table public.tourism_minigame_programs
  add column if not exists photobox_templates jsonb not null default '[]'::jsonb,
  add column if not exists ai_is_mission boolean not null default false,
  add column if not exists photobox_is_mission boolean not null default false,
  add column if not exists completion_effect text not null default 'none';

alter table public.tourism_minigame_programs
  drop constraint if exists tourism_minigame_program_photobox_templates_array,
  drop constraint if exists tourism_minigame_program_completion_effect_allowed;
alter table public.tourism_minigame_programs
  add constraint tourism_minigame_program_photobox_templates_array
    check (case when jsonb_typeof(photobox_templates) = 'array' then jsonb_array_length(photobox_templates) <= 12 else false end),
  add constraint tourism_minigame_program_completion_effect_allowed
    check (completion_effect in ('none', 'confetti', 'sparkles', 'fireworks'));

create or replace function public.save_tourism_minigame_program_v2(
  p_program_id uuid,
  p_name text,
  p_slug text,
  p_is_enabled boolean,
  p_components text[],
  p_required_components text[],
  p_default_photobox_access_mode text,
  p_photobox_templates jsonb,
  p_ai_is_mission boolean,
  p_photobox_is_mission boolean,
  p_completion_effect text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program_id uuid;
  v_manager boolean := exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'destination_manager');
  v_is_admin boolean := (select public.has_staff_role('admin'));
  v_is_enabled boolean;
  v_templates_invalid boolean := false;
  v_has_usable_template boolean := false;
begin
  if auth.uid() is null or not public.has_staff_role('editor') and not v_manager then
    return jsonb_build_object('error', 'STAFF_REQUIRED');
  end if;

  if jsonb_typeof(coalesce(p_photobox_templates, '[]'::jsonb)) <> 'array' then
    v_templates_invalid := true;
  else
    v_templates_invalid := jsonb_array_length(coalesce(p_photobox_templates, '[]'::jsonb)) > 12;
    if not v_templates_invalid then
      select exists (
        select 1 from jsonb_array_elements(coalesce(p_photobox_templates, '[]'::jsonb)) as configured_frame(frame)
        where jsonb_typeof(configured_frame.frame) <> 'object'
          or coalesce(configured_frame.frame->>'id', '') !~ '^[a-zA-Z0-9_-]{1,80}$'
          or length(trim(coalesce(configured_frame.frame->>'name', ''))) not between 1 and 80
          or coalesce(configured_frame.frame->>'layout', '') not in ('single', 'strip2', 'grid6', 'travel_strip', 'memory_triptych')
          or coalesce(configured_frame.frame->>'ratio', '') not in ('portrait', 'story', 'square')
          or coalesce(configured_frame.frame->>'source', '') not in ('preset', 'custom')
          or coalesce(configured_frame.frame->>'enabled', '') not in ('true', 'false')
          or configured_frame.frame->>'enabled' = 'true' and length(coalesce(configured_frame.frame->>'frameUrl', '')) = 0
      ) into v_templates_invalid;

      select exists (
        select 1 from jsonb_array_elements(coalesce(p_photobox_templates, '[]'::jsonb)) as configured_frame(frame)
        where configured_frame.frame->>'enabled' = 'true'
          and length(coalesce(configured_frame.frame->>'frameUrl', '')) > 0
      ) into v_has_usable_template;
    end if;
  end if;

  if length(trim(coalesce(p_name, ''))) not between 2 and 120
    or coalesce(p_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or coalesce(p_components, '{}') = '{}'
    or not (coalesce(p_components, '{}') <@ array['find_friends', 'photobox', 'chat_ai']::text[])
    or not (coalesce(p_required_components, '{}') <@ array['find_friends']::text[])
    or not (coalesce(p_required_components, '{}') <@ coalesce(p_components, '{}'))
    or coalesce(p_ai_is_mission, false) and not ('chat_ai' = any(coalesce(p_components, '{}')))
    or coalesce(p_photobox_is_mission, false) and not ('photobox' = any(coalesce(p_components, '{}')))
    or coalesce(p_default_photobox_access_mode, 'standalone') not in ('standalone', 'mission_reward')
    or (coalesce(p_default_photobox_access_mode, 'standalone') = 'mission_reward'
      and (not ('photobox' = any(coalesce(p_components, '{}')))
        or coalesce(p_photobox_is_mission, false)
        or (cardinality(coalesce(p_required_components, '{}')) = 0 and not coalesce(p_ai_is_mission, false))))
    or v_templates_invalid
    or ('photobox' = any(coalesce(p_components, '{}')) and not v_has_usable_template) then
    return jsonb_build_object('error', 'INVALID_PROGRAM');
  end if;
  if coalesce(p_completion_effect, 'none') not in ('none', 'confetti', 'sparkles', 'fireworks') then
    return jsonb_build_object('error', 'INVALID_PROGRAM');
  end if;

  if not v_is_admin then
    if p_program_id is not null then return jsonb_build_object('error', 'PROGRAM_NOT_FOUND'); end if;
    v_is_enabled := false;
  else
    v_is_enabled := coalesce(p_is_enabled, false);
  end if;

  if p_program_id is null then
    insert into public.tourism_minigame_programs(
      name, slug, is_enabled, components, required_components,
      default_photobox_access_mode, photobox_templates, ai_is_mission,
      photobox_is_mission, completion_effect, created_by, updated_by
    ) values (
      trim(p_name), p_slug, v_is_enabled, p_components, coalesce(p_required_components, '{}'),
      coalesce(p_default_photobox_access_mode, 'standalone'), coalesce(p_photobox_templates, '[]'::jsonb),
      coalesce(p_ai_is_mission, false), coalesce(p_photobox_is_mission, false),
      coalesce(p_completion_effect, 'none'), auth.uid(), auth.uid()
    ) returning id into v_program_id;
  else
    if not v_is_admin then
      return jsonb_build_object('error', 'PROGRAM_NOT_FOUND');
    end if;
    if 'photobox' = any(coalesce(p_components, '{}')) and exists (
      select 1 from public.tourism_minigame_destinations assignment
      where assignment.program_id = p_program_id and assignment.is_selected
        and jsonb_array_length(coalesce(p_photobox_templates, '[]'::jsonb)) + (
          select count(*) from jsonb_array_elements(coalesce(assignment.photobox_templates, '[]'::jsonb)) as campaign_frame(value)
          where campaign_frame.value->>'source' = 'campaign'
        ) > 12
    ) then return jsonb_build_object('error', 'FRAME_LIMIT_REACHED'); end if;

    update public.tourism_minigame_programs set
      name = trim(p_name), slug = p_slug, is_enabled = v_is_enabled,
      components = p_components, required_components = coalesce(p_required_components, '{}'),
      default_photobox_access_mode = coalesce(p_default_photobox_access_mode, 'standalone'),
      photobox_templates = coalesce(p_photobox_templates, '[]'::jsonb),
      ai_is_mission = coalesce(p_ai_is_mission, false),
      photobox_is_mission = coalesce(p_photobox_is_mission, false),
      completion_effect = coalesce(p_completion_effect, 'none'),
      updated_by = auth.uid(), updated_at = now()
    where id = p_program_id and v_is_admin
    returning id into v_program_id;
    if v_program_id is null then return jsonb_build_object('error', 'PROGRAM_NOT_FOUND'); end if;

    -- Program modules and frame choices are shared by its destination enrollments.
    update public.tourism_minigame_destinations assignment set
      is_enabled = assignment.is_selected and v_is_enabled,
      components = p_components,
      required_components = array(
        select required_component
        from unnest(coalesce(assignment.required_components, '{}')) required_component
        where required_component = any(p_components)
      ),
      photobox_access_mode = coalesce(p_default_photobox_access_mode, 'standalone'),
      photobox_templates = coalesce(p_photobox_templates, '[]'::jsonb) || coalesce((
        select jsonb_agg(campaign_frame.value)
        from jsonb_array_elements(coalesce(assignment.photobox_templates, '[]'::jsonb)) as campaign_frame(value)
        where campaign_frame.value->>'source' = 'campaign'
      ), '[]'::jsonb),
      updated_at = now()
    where assignment.program_id = v_program_id and assignment.is_selected;
  end if;
  return jsonb_build_object('programId', v_program_id);
exception
  when unique_violation then return jsonb_build_object('error', 'SLUG_IN_USE');
  when others then
    if sqlstate = '42501' then return jsonb_build_object('error', 'STAFF_REQUIRED'); end if;
    raise;
end;
$$;

revoke all on function public.save_tourism_minigame_program_v2(uuid, text, text, boolean, text[], text[], text, jsonb, boolean, boolean, text) from public, anon;
grant execute on function public.save_tourism_minigame_program_v2(uuid, text, text, boolean, text[], text[], text, jsonb, boolean, boolean, text) to authenticated;

create or replace function public.set_destination_minigame_assignment(
  p_destination_id uuid,
  p_program_id uuid,
  p_find_friends_required boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.tourism_minigame_programs%rowtype;
  v_components text[];
  v_required text[];
  v_photobox_mode text;
  v_campaign_templates jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not (select public.can_manage_destination(p_destination_id)) then
    return jsonb_build_object('error', 'DESTINATION_FORBIDDEN');
  end if;
  perform 1 from public.destinations where id = p_destination_id for update;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;

  if p_program_id is null then
    update public.tourism_minigame_destinations
      set is_enabled = false, is_selected = false, updated_at = now()
      where destination_id = p_destination_id and is_selected;
    return jsonb_build_object('status', 'detached');
  end if;
  select * into v_program from public.tourism_minigame_programs program
    where program.id = p_program_id
      and (program.is_enabled or program.created_by = (select auth.uid()) or (select public.has_staff_role('admin')))
    for share;
  if not found then return jsonb_build_object('error', 'PROGRAM_NOT_AVAILABLE'); end if;

  v_components := v_program.components;
  v_required := coalesce(v_program.required_components, '{}');
  if 'find_friends' = any(v_components) then
    if coalesce(p_find_friends_required, false) then
      if not ('find_friends' = any(v_required)) then v_required := array_append(v_required, 'find_friends'); end if;
    else
      v_required := array_remove(v_required, 'find_friends');
    end if;
  end if;
  v_photobox_mode := case when 'photobox' = any(v_components)
    then coalesce(v_program.default_photobox_access_mode, 'standalone') else 'standalone' end;
  if v_photobox_mode = 'mission_reward'
    and (cardinality(v_required) = 0 and not v_program.ai_is_mission or v_program.photobox_is_mission) then
    return jsonb_build_object('error', 'PHOTOBOX_REWARD_REQUIRES_REQUIRED_MISSION');
  end if;

  select coalesce(jsonb_agg(frame.value), '[]'::jsonb) into v_campaign_templates
  from public.tourism_minigame_destinations existing_assignment
  cross join lateral jsonb_array_elements(coalesce(existing_assignment.photobox_templates, '[]'::jsonb)) as frame(value)
  where existing_assignment.destination_id = p_destination_id and existing_assignment.is_selected
    and frame.value->>'source' = 'campaign';
  if jsonb_array_length(coalesce(v_program.photobox_templates, '[]'::jsonb))
    + jsonb_array_length(v_campaign_templates) > 12 then
    return jsonb_build_object('error', 'FRAME_LIMIT_REACHED');
  end if;

  update public.tourism_minigame_destinations
    set is_enabled = false, is_selected = false, updated_at = now()
    where destination_id = p_destination_id and is_selected;

  insert into public.tourism_minigame_destinations(
    program_id, destination_id, is_enabled, is_selected, components, required_components,
    photobox_access_mode, photobox_templates
  ) values (
    p_program_id, p_destination_id, v_program.is_enabled, true, v_components, v_required,
    v_photobox_mode, coalesce(v_program.photobox_templates, '[]'::jsonb) || v_campaign_templates
  ) on conflict (program_id, destination_id) do update set
    is_enabled = excluded.is_enabled,
    is_selected = true,
    components = excluded.components,
    required_components = excluded.required_components,
    photobox_access_mode = excluded.photobox_access_mode,
    photobox_templates = excluded.photobox_templates,
    updated_at = now();

  return jsonb_build_object('status', 'attached');
end;
$$;

revoke all on function public.set_destination_minigame_assignment(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_destination_minigame_assignment(uuid, uuid, boolean) to authenticated;

-- AI and Photobox can be explicit missions. Preserve old progress hashes when
-- both options are off, and invalidate only when a new mission is enabled.
create or replace function public.tourism_minigame_mission_hash(p_assignment_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5((jsonb_build_object(
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
        'qrPointId', m.qr_point_id, 'required', m.is_required,
        'requires', coalesce((
          select jsonb_agg(d.prerequisite_qr_point_id order by d.prerequisite_qr_point_id)
          from public.tourism_minigame_qr_dependencies d
          where d.assignment_id = a.id and d.qr_point_id = m.qr_point_id
        ), '[]'::jsonb)
      ) order by m.qr_point_id)
      from public.tourism_minigame_qr_points m
      where m.assignment_id = a.id and 'find_friends' = any(a.components)
    ), '[]'::jsonb)
  ) || case when coalesce(p.ai_is_mission, false) or coalesce(p.photobox_is_mission, false)
    then jsonb_build_object('aiIsMission', coalesce(p.ai_is_mission, false), 'photoboxIsMission', coalesce(p.photobox_is_mission, false))
    else '{}'::jsonb end)::text)
  from public.tourism_minigame_destinations a
  left join public.tourism_minigame_programs p on p.id = a.program_id
  where a.id = p_assignment_id;
$$;

revoke all on function public.tourism_minigame_mission_hash(uuid) from public, anon, authenticated;

create or replace function public.record_public_minigame_scan(
  p_program_slug text,
  p_destination_slug text,
  p_code text,
  p_source text default 'qr_link'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid := auth.uid();
  v_assignment public.tourism_minigame_destinations%rowtype;
  v_program public.tourism_minigame_programs%rowtype;
  v_destination public.destinations%rowtype;
  v_point_id uuid;
  v_name text;
  v_progress public.tourism_minigame_progress%rowtype;
  v_scanned uuid[];
  v_found uuid[];
  v_missing integer;
  v_completed boolean;
  v_program_completed boolean;
  v_new_scan boolean;
  v_mission_hash text;
  v_required_missions text[];
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  select * into v_destination from public.destinations where slug = p_destination_slug and is_published;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;
  select * into v_program from public.tourism_minigame_programs where slug = p_program_slug and is_enabled;
  if not found then return jsonb_build_object('error', 'MINIGAME_NOT_AVAILABLE'); end if;
  select * into v_assignment from public.tourism_minigame_destinations
    where program_id = v_program.id and destination_id = v_destination.id
      and is_enabled and is_selected and 'find_friends' = any(components);
  if not found then return jsonb_build_object('error', 'MINIGAME_NOT_AVAILABLE'); end if;

  select q.id, q.name into v_point_id, v_name
    from public.qr_points q
    join public.tourism_minigame_qr_points m on m.qr_point_id = q.id and m.assignment_id = v_assignment.id
    where q.code = p_code and q.destination_id = v_destination.id and q.is_active;
  if v_point_id is null then return jsonb_build_object('error', 'QR_NOT_IN_MISSION'); end if;

  insert into public.tourism_minigame_progress(visitor_id, assignment_id)
    values (v_visitor_id, v_assignment.id) on conflict do nothing;
  select * into v_progress from public.tourism_minigame_progress
    where visitor_id = v_visitor_id and assignment_id = v_assignment.id for update;
  v_mission_hash := public.tourism_minigame_mission_hash(v_assignment.id);
  if v_progress.mission_config_hash is distinct from v_mission_hash then
    update public.tourism_minigame_progress set scanned_qr_point_ids = '{}', completed_components = '{}',
      mission_config_hash = v_mission_hash, updated_at = now()
      where visitor_id = v_visitor_id and assignment_id = v_assignment.id returning * into v_progress;
  end if;

  v_new_scan := not (v_point_id = any(v_progress.scanned_qr_point_ids));
  v_scanned := case when v_new_scan then array_append(v_progress.scanned_qr_point_ids, v_point_id) else v_progress.scanned_qr_point_ids end;
  with recursive prereq(start_id, ancestor_id) as (
    select dependency.qr_point_id, dependency.prerequisite_qr_point_id
      from public.tourism_minigame_qr_dependencies dependency where dependency.assignment_id = v_assignment.id
    union
    select chain.start_id, dependency.prerequisite_qr_point_id
      from prereq chain
      join public.tourism_minigame_qr_dependencies dependency
        on dependency.assignment_id = v_assignment.id and dependency.qr_point_id = chain.ancestor_id
  )
  select coalesce(array_agg(point.qr_point_id), '{}') into v_found
    from public.tourism_minigame_qr_points point
    where point.assignment_id = v_assignment.id and point.qr_point_id = any(v_scanned)
      and not exists (select 1 from prereq where prereq.start_id = point.qr_point_id and not (prereq.ancestor_id = any(v_scanned)));

  select count(*) into v_missing from public.tourism_minigame_qr_points point
    where point.assignment_id = v_assignment.id and point.is_required and not (point.qr_point_id = any(v_found));
  v_completed := exists (select 1 from public.tourism_minigame_qr_points point where point.assignment_id = v_assignment.id and point.is_required)
    and v_missing = 0;

  update public.tourism_minigame_progress set
    scanned_qr_point_ids = v_scanned,
    completed_components = case when v_completed and not ('find_friends' = any(completed_components))
      then array_append(completed_components, 'find_friends') else completed_components end,
    xp = xp + case when v_new_scan then 30 else 0 end,
    mission_config_hash = v_mission_hash,
    updated_at = now()
    where visitor_id = v_visitor_id and assignment_id = v_assignment.id returning * into v_progress;

  v_required_missions := coalesce(v_assignment.required_components, '{}')
    || case when coalesce(v_program.ai_is_mission, false) then array['chat_ai']::text[] else '{}'::text[] end
    || case when coalesce(v_program.photobox_is_mission, false) then array['photobox']::text[] else '{}'::text[] end;
  v_program_completed := cardinality(v_required_missions) > 0 and v_required_missions <@ v_progress.completed_components;

  return jsonb_build_object(
    'status', case when v_new_scan then 'scanned' else 'already_scanned' end,
    'pointId', v_point_id, 'name', v_name, 'scannedQrPointIds', v_progress.scanned_qr_point_ids,
    'foundQrPointIds', v_found, 'completedComponents', v_progress.completed_components,
    'requiredCount', (select count(*) from public.tourism_minigame_qr_points point where point.assignment_id = v_assignment.id and point.is_required),
    'foundRequiredCount', (select count(*) from public.tourism_minigame_qr_points point where point.assignment_id = v_assignment.id and point.is_required and point.qr_point_id = any(v_found)),
    'completed', v_completed, 'programCompleted', v_program_completed, 'xp', v_progress.xp
  );
end;
$$;

revoke all on function public.record_public_minigame_scan(text, text, text, text) from public, anon;
grant execute on function public.record_public_minigame_scan(text, text, text, text) to authenticated;

create or replace function public.record_public_qr_visit(p_code text, p_source text default 'qr_link')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid := auth.uid();
  v_destination public.destinations%rowtype;
  v_point_id uuid;
  v_point_name text;
  v_inserted integer;
  v_game record;
  v_game_results jsonb := '[]'::jsonb;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  select destination.* into v_destination
    from public.qr_points point
    join public.destinations destination on destination.id = point.destination_id
    where point.code = p_code and point.is_active and destination.is_published
      and destination.image_url is not null and destination.latitude is not null and destination.longitude is not null;
  if not found then return jsonb_build_object('error', 'QR_NOT_FOUND'); end if;
  select point.id, point.name into v_point_id, v_point_name from public.qr_points point
    where point.code = p_code and point.destination_id = v_destination.id and point.is_active;
  insert into public.tourism_qr_visits(visitor_id, destination_id, qr_point_id, source)
    values (v_visitor_id, v_destination.id, v_point_id, case when p_source = 'camera' then 'camera' else 'qr_link' end)
    on conflict (visitor_id, qr_point_id) do nothing;
  get diagnostics v_inserted = row_count;

  for v_game in
    select program.slug from public.tourism_minigame_destinations assignment
      join public.tourism_minigame_programs program on program.id = assignment.program_id
      join public.tourism_minigame_qr_points mission_point
        on mission_point.assignment_id = assignment.id and mission_point.qr_point_id = v_point_id
      where assignment.destination_id = v_destination.id and assignment.is_selected and assignment.is_enabled
        and program.is_enabled and 'find_friends' = any(assignment.components)
  loop
    v_game_results := v_game_results || jsonb_build_array(
      public.record_public_minigame_scan(v_game.slug, v_destination.slug, p_code, p_source)
    );
  end loop;

  return jsonb_build_object(
    'status', case when v_inserted = 1 then 'visited' else 'already_visited' end,
    'destinationSlug', v_destination.slug, 'destinationName', v_destination.name,
    'pointId', v_point_id, 'pointName', v_point_name, 'minigames', v_game_results
  );
end;
$$;

revoke all on function public.record_public_qr_visit(text, text) from public, anon;
grant execute on function public.record_public_qr_visit(text, text) to authenticated;

-- A Photobox reward must wait for every configured mission, including an AI question.
create or replace function public.record_public_minigame_photo(
  p_program_slug text,
  p_destination_slug text,
  p_template_id text,
  p_caption text,
  p_drive_file_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid := auth.uid();
  v_destination public.destinations%rowtype;
  v_program public.tourism_minigame_programs%rowtype;
  v_assignment public.tourism_minigame_destinations%rowtype;
  v_progress public.tourism_minigame_progress%rowtype;
  v_required_missions text[];
  v_mission_hash text;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  select * into v_destination from public.destinations where slug = p_destination_slug and is_published;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;
  select * into v_program from public.tourism_minigame_programs where slug = p_program_slug and is_enabled;
  if not found then return jsonb_build_object('error', 'MINIGAME_NOT_AVAILABLE'); end if;
  select * into v_assignment from public.tourism_minigame_destinations
  where program_id = v_program.id and destination_id = v_destination.id
    and is_enabled and is_selected and 'photobox' = any(components);
  if not found then return jsonb_build_object('error', 'PHOTOBOX_NOT_AVAILABLE'); end if;
  if length(trim(coalesce(p_caption, ''))) = 0 or char_length(p_caption) > v_assignment.max_caption_length then
    return jsonb_build_object('error', 'CAPTION_REQUIRED_OR_TOO_LONG', 'maxLength', v_assignment.max_caption_length);
  end if;
  if coalesce(p_template_id, '') = '' or not exists (
    select 1 from jsonb_array_elements(coalesce(v_assignment.photobox_templates, '[]'::jsonb)) t
    where t->>'id' = p_template_id and coalesce((t->>'enabled')::boolean, true)
  ) then return jsonb_build_object('error', 'TEMPLATE_OR_PHOTO_REQUIRED'); end if;

  insert into public.tourism_minigame_progress(visitor_id, assignment_id)
  values (v_visitor_id, v_assignment.id) on conflict do nothing;
  select * into v_progress from public.tourism_minigame_progress
  where visitor_id = v_visitor_id and assignment_id = v_assignment.id for update;
  v_mission_hash := public.tourism_minigame_mission_hash(v_assignment.id);
  if v_progress.mission_config_hash is distinct from v_mission_hash then
    update public.tourism_minigame_progress set scanned_qr_point_ids = '{}', completed_components = '{}',
      mission_config_hash = v_mission_hash, updated_at = now()
    where visitor_id = v_visitor_id and assignment_id = v_assignment.id returning * into v_progress;
  end if;

  v_required_missions := array_remove(array_remove(coalesce(v_assignment.required_components, '{}'), 'photobox'), 'chat_ai');
  if coalesce(v_program.ai_is_mission, false) then v_required_missions := array_append(v_required_missions, 'chat_ai'); end if;
  if v_assignment.photobox_access_mode = 'mission_reward'
    and (cardinality(v_required_missions) = 0 or not (v_required_missions <@ v_progress.completed_components)) then
    return jsonb_build_object('error', 'PHOTOBOX_LOCKED');
  end if;

  insert into public.tourism_minigame_photos(visitor_id, assignment_id, template_id, caption, drive_file_id)
  values (v_visitor_id, v_assignment.id, p_template_id, left(trim(p_caption), v_assignment.max_caption_length), p_drive_file_id);
  update public.tourism_minigame_progress set photos_created = photos_created + 1, updated_at = now()
  where visitor_id = v_visitor_id and assignment_id = v_assignment.id returning * into v_progress;
  return jsonb_build_object('status', 'saved', 'photosCreated', v_progress.photos_created,
    'completedComponents', v_progress.completed_components, 'xp', v_progress.xp);
end;
$$;

revoke all on function public.record_public_minigame_photo(text, text, text, text, text) from public, anon;
grant execute on function public.record_public_minigame_photo(text, text, text, text, text) to authenticated;

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
    'components', a.components,
    'requiredComponents', a.required_components
      || case when p.ai_is_mission then array['chat_ai']::text[] else '{}'::text[] end
      || case when p.photobox_is_mission then array['photobox']::text[] else '{}'::text[] end,
    'aiIsMission', p.ai_is_mission, 'photoboxIsMission', p.photobox_is_mission,
    'completionEffect', p.completion_effect,
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
      where m.assignment_id = a.id and q.is_active and 'find_friends' = any(a.components)), '[]'::jsonb),
    'progress', jsonb_build_object(
      'scannedQrPointIds', case when coalesce(progress.mission_config_hash, '') = public.tourism_minigame_mission_hash(a.id)
        then coalesce(progress.scanned_qr_point_ids, '{}') else '{}'::uuid[] end,
      'completedComponents', case when coalesce(progress.mission_config_hash, '') = public.tourism_minigame_mission_hash(a.id)
        then coalesce(progress.completed_components, '{}') else '{}'::text[] end,
      'photosCreated', coalesce(progress.photos_created, 0), 'xp', coalesce(progress.xp, 0),
      'completed', case when coalesce(progress.mission_config_hash, '') = public.tourism_minigame_mission_hash(a.id) then
        cardinality(a.required_components
          || case when p.ai_is_mission then array['chat_ai']::text[] else '{}'::text[] end
          || case when p.photobox_is_mission then array['photobox']::text[] else '{}'::text[] end) > 0
        and (a.required_components || case when p.ai_is_mission then array['chat_ai']::text[] else '{}'::text[] end
          || case when p.photobox_is_mission then array['photobox']::text[] else '{}'::text[] end)
          <@ coalesce(progress.completed_components, '{}')
        else false end
    )
  ) order by p.created_at desc), '[]'::jsonb)
  into v_programs
  from public.tourism_minigame_destinations a
  join public.tourism_minigame_programs p on p.id = a.program_id
  left join public.tourism_minigame_progress progress on progress.assignment_id = a.id and progress.visitor_id = v_visitor_id
  where a.destination_id = v_destination.id and a.is_selected and a.is_enabled and p.is_enabled
    and ('find_friends' <> all(a.components) or exists (
      select 1 from public.tourism_minigame_qr_points m join public.qr_points q on q.id = m.qr_point_id
      where m.assignment_id = a.id and m.is_required and q.is_active
    ))
    and ('photobox' <> all(a.components) or exists (
      select 1 from jsonb_array_elements(coalesce(a.photobox_templates, '[]'::jsonb)) t
      where coalesce((t->>'enabled')::boolean, true) and coalesce(t->>'frameUrl', '') <> ''
    ));

  return jsonb_build_object('engineVersion', 2, 'destinationId', v_destination.id, 'destinationName', v_destination.name,
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
      from public.promotion_campaigns c join public.tourism_partners partner on partner.id = c.partner_id
      join public.qr_points q on q.id = c.qr_point_id
      where q.destination_id = v_destination.id and q.is_active
        and c.experience_type in ('popup', 'photobox') and c.status = 'published'
        and partner.status = 'active' and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
    ), '[]'::jsonb));
end;
$$;

create or replace function public.record_public_minigame_component(p_destination_slug text, p_component text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor uuid := auth.uid(); v_assignment public.tourism_minigame_destinations%rowtype;
  v_program public.tourism_minigame_programs%rowtype; v_destination public.destinations%rowtype;
  v_progress public.tourism_minigame_progress%rowtype; v_hash text; v_completed boolean;
begin
  if v_visitor is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  if p_component <> 'chat_ai' then return jsonb_build_object('error', 'INVALID_COMPONENT'); end if;
  select * into v_destination from public.destinations where slug = p_destination_slug and is_published;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;
  select a.* into v_assignment from public.tourism_minigame_destinations a
    join public.tourism_minigame_programs p on p.id = a.program_id
    where a.destination_id = v_destination.id and a.is_selected and a.is_enabled and p.is_enabled
      and 'chat_ai' = any(a.components) and p.ai_is_mission
    limit 1 for update of a;
  if not found then return jsonb_build_object('status', 'not_required'); end if;
  select * into v_program from public.tourism_minigame_programs where id = v_assignment.program_id;
  insert into public.tourism_minigame_progress(visitor_id, assignment_id) values (v_visitor, v_assignment.id) on conflict do nothing;
  select * into v_progress from public.tourism_minigame_progress where visitor_id = v_visitor and assignment_id = v_assignment.id for update;
  v_hash := public.tourism_minigame_mission_hash(v_assignment.id);
  if v_progress.mission_config_hash is distinct from v_hash then
    update public.tourism_minigame_progress set scanned_qr_point_ids = '{}', completed_components = '{}', mission_config_hash = v_hash, updated_at = now()
      where visitor_id = v_visitor and assignment_id = v_assignment.id returning * into v_progress;
  end if;
  update public.tourism_minigame_progress set
    completed_components = case when 'chat_ai' = any(completed_components) then completed_components else array_append(completed_components, 'chat_ai') end,
    xp = xp + case when 'chat_ai' = any(completed_components) then 0 else 15 end,
    updated_at = now()
  where visitor_id = v_visitor and assignment_id = v_assignment.id returning * into v_progress;
  v_completed := cardinality(v_assignment.required_components
      || case when v_program.ai_is_mission then array['chat_ai']::text[] else '{}'::text[] end
      || case when v_program.photobox_is_mission then array['photobox']::text[] else '{}'::text[] end) > 0
    and (v_assignment.required_components || case when v_program.ai_is_mission then array['chat_ai']::text[] else '{}'::text[] end
      || case when v_program.photobox_is_mission then array['photobox']::text[] else '{}'::text[] end) <@ v_progress.completed_components;
  return jsonb_build_object('status', 'recorded', 'completedComponents', v_progress.completed_components, 'completed', v_completed, 'xp', v_progress.xp);
end;
$$;

revoke all on function public.get_public_minigame_state(text) from public;
revoke all on function public.record_public_minigame_component(text, text) from public, anon;
grant execute on function public.get_public_minigame_state(text) to anon, authenticated;
grant execute on function public.record_public_minigame_component(text, text) to authenticated;

create or replace function public.mark_photobox_mission_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tourism_minigame_progress progress set
    completed_components = case when 'photobox' = any(progress.completed_components) then progress.completed_components else array_append(progress.completed_components, 'photobox') end,
    updated_at = now()
  from public.tourism_minigame_destinations assignment
  join public.tourism_minigame_programs program on program.id = assignment.program_id
  where assignment.id = new.assignment_id and assignment.is_enabled and 'photobox' = any(assignment.components)
    and program.is_enabled and program.photobox_is_mission
    and progress.visitor_id = new.visitor_id and progress.assignment_id = new.assignment_id;
  return new;
end;
$$;

drop trigger if exists tourism_minigame_photobox_mission_progress on public.tourism_minigame_progress;
drop trigger if exists tourism_minigame_photobox_mission_progress on public.tourism_minigame_photos;
create trigger tourism_minigame_photobox_mission_progress
after insert on public.tourism_minigame_photos
for each row execute function public.mark_photobox_mission_progress();

revoke all on function public.mark_photobox_mission_progress() from public, anon, authenticated;
