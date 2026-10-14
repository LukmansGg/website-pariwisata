-- Program-level Photobox access is the default for newly linked destinations.
-- Existing per-destination choices remain independently configurable.

alter table public.tourism_minigame_programs
  add column if not exists default_photobox_access_mode text not null default 'standalone';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tourism_minigame_program_photobox_mode_allowed'
      and conrelid = 'public.tourism_minigame_programs'::regclass
  ) then
    alter table public.tourism_minigame_programs
      add constraint tourism_minigame_program_photobox_mode_allowed
      check (default_photobox_access_mode in ('standalone', 'mission_reward'));
  end if;
end $$;

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
  v_photobox_mode text := case
    when coalesce(p_default_photobox_access_mode, 'standalone') = 'mission_reward'
      and 'find_friends' = any(coalesce(p_components, '{}'))
      and 'photobox' = any(coalesce(p_components, '{}'))
    then 'mission_reward'
    else 'standalone'
  end;
begin
  if auth.uid() is null or not public.has_staff_role('editor') then
    return jsonb_build_object('error', 'STAFF_REQUIRED');
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120
    or coalesce(p_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or coalesce(p_components, '{}') = '{}'
    or not (coalesce(p_components, '{}') <@ array['find_friends', 'photobox', 'chat_ai']::text[])
    or not (coalesce(p_required_components, '{}') <@ array['find_friends', 'photobox']::text[])
    or not (coalesce(p_required_components, '{}') <@ coalesce(p_components, '{}'))
    or coalesce(p_default_photobox_access_mode, 'standalone') not in ('standalone', 'mission_reward') then
    return jsonb_build_object('error', 'INVALID_PROGRAM');
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
    if v_program_id is null then
      return jsonb_build_object('error', 'PROGRAM_NOT_FOUND');
    end if;
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
      when 'find_friends' = any(excluded.components) and 'photobox' = any(excluded.components)
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

revoke all on function public.save_tourism_minigame_program(uuid, text, text, boolean, text[], text[], uuid[], text) from public, anon;
grant execute on function public.save_tourism_minigame_program(uuid, text, text, boolean, text[], text[], uuid[], text) to authenticated;
