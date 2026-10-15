-- A Photobox reward can expose only the frames that staff marked as gifts.
-- Missing isGift values remain enabled as gifts for existing assignments.

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
    where t->>'id' = p_template_id
      and coalesce((t->>'enabled')::boolean, true)
      and (v_assignment.photobox_access_mode <> 'mission_reward' or coalesce((t->>'isGift')::boolean, true))
  ) then
    return jsonb_build_object('error', 'TEMPLATE_OR_PHOTO_REQUIRED');
  end if;
  insert into public.tourism_minigame_progress(visitor_id, assignment_id)
  values (v_visitor_id, v_assignment.id) on conflict do nothing;
  select * into v_progress from public.tourism_minigame_progress
  where visitor_id = v_visitor_id and assignment_id = v_assignment.id for update;
  if v_assignment.photobox_access_mode = 'mission_reward'
    and not ('find_friends' = any(v_progress.completed_components)) then
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

revoke all on function public.record_public_minigame_photo(text, text, text, text, text) from public, anon;
grant execute on function public.record_public_minigame_photo(text, text, text, text, text) to authenticated;
