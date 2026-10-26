-- Keep visitor mission progress tied to the rules they actually played.
-- Cosmetic Photobox edits do not invalidate QR mission progress.
alter table public.tourism_minigame_progress
  add column if not exists mission_config_hash text not null default '';

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
    ), '[]'::jsonb)
  )::text)
  from public.tourism_minigame_destinations a
  where a.id = p_assignment_id;
$$;

revoke all on function public.tourism_minigame_mission_hash(uuid) from public, anon, authenticated;

-- Preserve current progress when this migration is first applied.
update public.tourism_minigame_progress progress
set mission_config_hash = public.tourism_minigame_mission_hash(progress.assignment_id)
where progress.mission_config_hash = '';

-- Turning a game off hides its setup but keeps it available if staff re-enable it later.
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
  if 'find_friends' = any(p_components) and exists (
    select 1 from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) item
    where not exists (
      select 1 from public.qr_points q where q.id = (item->>'qrPointId')::uuid
        and q.destination_id = v_assignment.destination_id and q.is_active
    )
  ) then return jsonb_build_object('error', 'QR_POINT_NOT_IN_DESTINATION'); end if;
  if 'find_friends' = any(p_components) and exists (
    select 1 from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) item
    cross join lateral jsonb_array_elements_text(coalesce(item->'requires', '[]'::jsonb)) dep(value)
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_find_points, '[]'::jsonb)) other
      where other->>'qrPointId' = dep.value
    )
  ) then return jsonb_build_object('error', 'DEPENDENCY_NOT_IN_GROUP'); end if;
  if 'find_friends' = any(p_components) and exists (
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
      where m.assignment_id = a.id and q.is_active and 'find_friends' = any(a.components)), '[]'::jsonb),
    'progress', jsonb_build_object(
      'scannedQrPointIds', case when coalesce(progress.mission_config_hash, '') = public.tourism_minigame_mission_hash(a.id)
        then coalesce(progress.scanned_qr_point_ids, '{}') else '{}'::uuid[] end,
      'completedComponents', case when coalesce(progress.mission_config_hash, '') = public.tourism_minigame_mission_hash(a.id)
        then coalesce(progress.completed_components, '{}') else '{}'::text[] end,
      'photosCreated', coalesce(progress.photos_created, 0), 'xp', coalesce(progress.xp, 0),
      'completed', coalesce(progress.mission_config_hash, '') = public.tourism_minigame_mission_hash(a.id)
        and cardinality(a.required_components) > 0
        and a.required_components <@ coalesce(progress.completed_components, '{}')
    )
  ) order by p.created_at desc), '[]'::jsonb)
  into v_programs
  from public.tourism_minigame_destinations a
  join public.tourism_minigame_programs p on p.id = a.program_id
  left join public.tourism_minigame_progress progress on progress.assignment_id = a.id and progress.visitor_id = v_visitor_id
  where a.destination_id = v_destination.id and a.is_enabled and p.is_enabled
    and ('find_friends' <> all(a.components) or exists (
      select 1 from public.tourism_minigame_qr_points m
      join public.qr_points q on q.id = m.qr_point_id
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
  v_mission_hash text;
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
  where m.assignment_id = v_assignment.id and m.is_required and not (m.qr_point_id = any(v_found));
  v_completed := exists(select 1 from public.tourism_minigame_qr_points m where m.assignment_id = v_assignment.id and m.is_required)
    and v_missing = 0;

  update public.tourism_minigame_progress set scanned_qr_point_ids = v_scanned,
    completed_components = case when v_completed and not ('find_friends' = any(completed_components))
      then array_append(completed_components, 'find_friends') else completed_components end,
    xp = xp + case when v_new_scan then 30 else 0 end,
    mission_config_hash = v_mission_hash,
    updated_at = now()
  where visitor_id = v_visitor_id and assignment_id = v_assignment.id returning * into v_progress;

  return jsonb_build_object('status', case when v_new_scan then 'scanned' else 'already_scanned' end,
    'pointId', v_point_id, 'name', v_name, 'scannedQrPointIds', v_progress.scanned_qr_point_ids,
    'foundQrPointIds', v_found, 'completedComponents', v_progress.completed_components,
    'requiredCount', (select count(*) from public.tourism_minigame_qr_points m where m.assignment_id = v_assignment.id and m.is_required),
    'foundRequiredCount', (select count(*) from public.tourism_minigame_qr_points m where m.assignment_id = v_assignment.id and m.is_required and m.qr_point_id = any(v_found)),
    'completed', v_completed,
    'programCompleted', cardinality(v_assignment.required_components) > 0
      and v_assignment.required_components <@ v_progress.completed_components,
    'xp', v_progress.xp);
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
  v_mission_hash text;
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

revoke all on function public.get_public_minigame_state(text) from public;
revoke all on function public.record_public_minigame_scan(text, text, text, text) from public, anon;
revoke all on function public.record_public_minigame_photo(text, text, text, text, text) from public, anon;
grant execute on function public.get_public_minigame_state(text) to anon, authenticated;
grant execute on function public.record_public_minigame_scan(text, text, text, text) to authenticated;
grant execute on function public.record_public_minigame_photo(text, text, text, text, text) to authenticated;
