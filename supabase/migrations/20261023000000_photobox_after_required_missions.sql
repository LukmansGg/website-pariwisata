-- Photobox is a feature/reward, never a required mission. A locked Photobox
-- opens when every required mission in the destination assignment is complete.

update public.tourism_minigame_destinations a
set photobox_templates = coalesce((
  select jsonb_agg(frame.value - 'isGift' order by frame.ordinality)
  from jsonb_array_elements(coalesce(a.photobox_templates, '[]'::jsonb)) with ordinality as frame(value, ordinality)
), '[]'::jsonb)
where exists (
  select 1 from jsonb_array_elements(coalesce(a.photobox_templates, '[]'::jsonb)) frame(value)
  where frame.value ? 'isGift'
);

update public.tourism_minigame_programs
set required_components = array_remove(array_remove(coalesce(required_components, '{}'), 'photobox'), 'chat_ai'),
    default_photobox_access_mode = case
      when default_photobox_access_mode = 'mission_reward'
        and 'photobox' = any(components)
        and cardinality(array_remove(array_remove(coalesce(required_components, '{}'), 'photobox'), 'chat_ai')) > 0
      then 'mission_reward' else 'standalone' end;

update public.tourism_minigame_destinations
set required_components = array_remove(array_remove(coalesce(required_components, '{}'), 'photobox'), 'chat_ai'),
    photobox_access_mode = case
      when photobox_access_mode = 'mission_reward'
        and 'photobox' = any(components)
        and cardinality(array_remove(array_remove(coalesce(required_components, '{}'), 'photobox'), 'chat_ai')) > 0
      then 'mission_reward' else 'standalone' end;

update public.tourism_minigame_progress
set completed_components = array_remove(completed_components, 'photobox')
where 'photobox' = any(completed_components);

alter table public.tourism_minigame_programs
  drop constraint if exists tourism_minigame_program_required_are_missions,
  drop constraint if exists tourism_minigame_program_reward_has_required_missions;
alter table public.tourism_minigame_programs
  add constraint tourism_minigame_program_required_are_missions
    check (not ('photobox' = any(required_components) or 'chat_ai' = any(required_components))),
  add constraint tourism_minigame_program_reward_has_required_missions
    check (default_photobox_access_mode <> 'mission_reward'
      or ('photobox' = any(components) and cardinality(required_components) > 0));

alter table public.tourism_minigame_destinations
  drop constraint if exists tourism_minigame_assignment_required_are_missions,
  drop constraint if exists tourism_minigame_assignment_reward_has_required_missions;
alter table public.tourism_minigame_destinations
  add constraint tourism_minigame_assignment_required_are_missions
    check (not ('photobox' = any(required_components) or 'chat_ai' = any(required_components))),
  add constraint tourism_minigame_assignment_reward_has_required_missions
    check (photobox_access_mode <> 'mission_reward'
      or ('photobox' = any(components) and cardinality(required_components) > 0));

create or replace function public.save_tourism_minigame_program(
  p_program_id uuid,
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
  v_photobox_mode text := coalesce(p_default_photobox_access_mode, 'standalone');
begin
  if auth.uid() is null or not public.has_staff_role('editor') then
    return jsonb_build_object('error', 'STAFF_REQUIRED');
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120
    or coalesce(p_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or coalesce(p_components, '{}') = '{}'
    or not (coalesce(p_components, '{}') <@ array['find_friends', 'photobox', 'chat_ai']::text[])
    or not (coalesce(p_required_components, '{}') <@ coalesce(p_components, '{}'))
    or 'photobox' = any(coalesce(p_required_components, '{}'))
    or 'chat_ai' = any(coalesce(p_required_components, '{}'))
    or v_photobox_mode not in ('standalone', 'mission_reward') then
    return jsonb_build_object('error', 'INVALID_PROGRAM');
  end if;
  if v_photobox_mode = 'mission_reward'
    and (not ('photobox' = any(p_components)) or cardinality(coalesce(p_required_components, '{}')) = 0) then
    return jsonb_build_object('error', 'PHOTOBOX_REWARD_REQUIRES_REQUIRED_MISSION');
  end if;

  if p_program_id is null then
    insert into public.tourism_minigame_programs(
      name, slug, is_enabled, components, required_components,
      default_photobox_access_mode, created_by, updated_by
    ) values (
      trim(p_name), p_slug, coalesce(p_is_enabled, false), p_components,
      coalesce(p_required_components, '{}'), v_photobox_mode, auth.uid(), auth.uid()
    ) returning id into v_program_id;
  else
    update public.tourism_minigame_programs set
      name = trim(p_name), slug = p_slug,
      is_enabled = coalesce(p_is_enabled, false),
      components = p_components,
      required_components = coalesce(p_required_components, '{}'),
      default_photobox_access_mode = v_photobox_mode,
      updated_by = auth.uid(), updated_at = now()
    where id = p_program_id returning id into v_program_id;
    if v_program_id is null then return jsonb_build_object('error', 'PROGRAM_NOT_FOUND'); end if;
  end if;

  insert into public.tourism_minigame_destinations(
    program_id, destination_id, components, required_components, photobox_access_mode
  )
  select v_program_id, d.id, p_components, coalesce(p_required_components, '{}'), v_photobox_mode
  from public.destinations d
  where d.id = any(coalesce(p_destination_ids, '{}'))
  on conflict (program_id, destination_id) do update set
    is_enabled = true,
    components = excluded.components,
    required_components = excluded.required_components,
    photobox_access_mode = case
      when 'photobox' = any(excluded.components) and cardinality(excluded.required_components) > 0
        then tourism_minigame_destinations.photobox_access_mode
      else 'standalone'
    end,
    updated_at = now();

  update public.tourism_minigame_destinations a
  set is_enabled = false, updated_at = now()
  where a.program_id = v_program_id
    and not (a.destination_id = any(coalesce(p_destination_ids, '{}')));

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
    or not (coalesce(p_required_components, '{}') <@ coalesce(p_components, '{}'))
    or 'photobox' = any(coalesce(p_required_components, '{}'))
    or 'chat_ai' = any(coalesce(p_required_components, '{}'))
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
    and (not ('photobox' = any(p_components)) or cardinality(coalesce(p_required_components, '{}')) = 0) then
    return jsonb_build_object('error', 'PHOTOBOX_REWARD_REQUIRES_REQUIRED_MISSION');
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
    select 1 from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) item
    cross join lateral jsonb_array_elements_text(coalesce(item->'requires', '[]'::jsonb)) dep(value)
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) other
      where other->>'qrPointId' = dep.value
    )
  ) then return jsonb_build_object('error', 'DEPENDENCY_NOT_IN_GROUP'); end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) item
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

create or replace function public.record_public_minigame_photo(
  p_program_slug text, p_destination_slug text, p_template_id text, p_caption text, p_drive_file_id text
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
  v_award integer := 0;
begin
  if v_visitor_id is null then return jsonb_build_object('error', 'VISITOR_SESSION_REQUIRED'); end if;
  select * into v_destination from public.destinations where slug = p_destination_slug and is_published;
  if not found then return jsonb_build_object('error', 'DESTINATION_NOT_FOUND'); end if;
  select * into v_program from public.tourism_minigame_programs where slug = p_program_slug and is_enabled;
  if not found then return jsonb_build_object('error', 'MINIGAME_NOT_AVAILABLE'); end if;
  select * into v_assignment from public.tourism_minigame_destinations
  where program_id = v_program.id and destination_id = v_destination.id
    and is_enabled and 'photobox' = any(components);
  if not found then return jsonb_build_object('error', 'PHOTOBOX_NOT_AVAILABLE'); end if;
  if length(trim(coalesce(p_caption, ''))) = 0 or char_length(p_caption) > v_assignment.max_caption_length then
    return jsonb_build_object('error', 'CAPTION_REQUIRED_OR_TOO_LONG', 'maxLength', v_assignment.max_caption_length);
  end if;
  if coalesce(p_template_id, '') = '' or not exists (
    select 1 from jsonb_array_elements(v_assignment.photobox_templates) t
    where t->>'id' = p_template_id and coalesce((t->>'enabled')::boolean, true)
  ) then
    return jsonb_build_object('error', 'TEMPLATE_OR_PHOTO_REQUIRED');
  end if;

  insert into public.tourism_minigame_progress(visitor_id, assignment_id)
  values (v_visitor_id, v_assignment.id) on conflict do nothing;
  select * into v_progress from public.tourism_minigame_progress
  where visitor_id = v_visitor_id and assignment_id = v_assignment.id for update;
  v_required_missions := array_remove(array_remove(coalesce(v_assignment.required_components, '{}'), 'photobox'), 'chat_ai');
  if v_assignment.photobox_access_mode = 'mission_reward'
    and (cardinality(v_required_missions) = 0 or not (v_required_missions <@ v_progress.completed_components)) then
    return jsonb_build_object('error', 'PHOTOBOX_LOCKED');
  end if;

  v_award := case when v_progress.photos_created = 0 then 30 else 0 end;
  insert into public.tourism_minigame_photos(visitor_id, assignment_id, template_id, caption, drive_file_id)
  values (v_visitor_id, v_assignment.id, p_template_id, left(trim(p_caption), v_assignment.max_caption_length), p_drive_file_id);
  update public.tourism_minigame_progress set photos_created = photos_created + 1,
    xp = xp + v_award,
    updated_at = now()
  where visitor_id = v_visitor_id and assignment_id = v_assignment.id returning * into v_progress;
  return jsonb_build_object('status', 'saved', 'photosCreated', v_progress.photos_created,
    'completedComponents', v_progress.completed_components, 'xp', v_progress.xp);
end;
$$;

revoke all on function public.save_tourism_minigame_program(uuid, text, text, boolean, text[], text[], uuid[], text) from public, anon;
grant execute on function public.save_tourism_minigame_program(uuid, text, text, boolean, text[], text[], uuid[], text) to authenticated;
revoke all on function public.configure_tourism_minigame_assignment(uuid, boolean, text[], text[], text, jsonb, text, integer, integer, jsonb) from public, anon;
grant execute on function public.configure_tourism_minigame_assignment(uuid, boolean, text[], text[], text, jsonb, text, integer, integer, jsonb) to authenticated;
revoke all on function public.record_public_minigame_photo(text, text, text, text, text) from public, anon;
grant execute on function public.record_public_minigame_photo(text, text, text, text, text) to authenticated;
