-- Multi-select categories and a concise public summary for destinations.
alter table public.destinations
  add column if not exists categories text[] not null default '{}',
  add column if not exists short_description text not null default '';

update public.destinations
set categories = case
  when category is null or btrim(category) = '' then '{}'
  else array[category]
end
where cardinality(categories) = 0;

-- Keep the existing `category` column populated for older clients during rollout.
drop function if exists public.save_destination_with_qr(
  uuid, uuid, text, text, text, text, text, double precision, double precision,
  text, text[], boolean, boolean, text[], text, text, text, double precision, double precision
);

create function public.save_destination_with_qr(
  p_destination_id uuid,
  p_qr_point_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_categories text[],
  p_short_description text,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_image_url text,
  p_tags text[],
  p_is_featured boolean,
  p_is_published boolean,
  p_additional_minigames text[],
  p_qr_name text,
  p_qr_code text,
  p_qr_address text,
  p_qr_latitude double precision,
  p_qr_longitude double precision
)
returns table (destination_id uuid, qr_point_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_destination_id uuid;
  v_qr_point_id uuid;
  v_categories text[] := coalesce(p_categories, '{}');
  v_legacy_category text := nullif(array_to_string(coalesce(p_categories, '{}'), ', '), '');
begin
  if p_destination_id is null then
    insert into public.destinations (
      slug, name, description, category, categories, short_description, address,
      latitude, longitude, image_url, tags, is_featured, is_published,
      additional_minigames, created_by, updated_by
    ) values (
      p_slug, p_name, coalesce(p_description, ''), v_legacy_category, v_categories,
      coalesce(p_short_description, ''), p_address, p_latitude, p_longitude,
      p_image_url, coalesce(p_tags, '{}'), coalesce(p_is_featured, false),
      coalesce(p_is_published, false), coalesce(p_additional_minigames, '{}'),
      (select auth.uid()), (select auth.uid())
    ) returning id into v_destination_id;
  else
    update public.destinations set
      slug = p_slug,
      name = p_name,
      description = coalesce(p_description, ''),
      category = v_legacy_category,
      categories = v_categories,
      short_description = coalesce(p_short_description, ''),
      address = p_address,
      latitude = p_latitude,
      longitude = p_longitude,
      image_url = p_image_url,
      tags = coalesce(p_tags, '{}'),
      is_featured = coalesce(p_is_featured, false),
      is_published = coalesce(p_is_published, false),
      additional_minigames = coalesce(p_additional_minigames, '{}'),
      updated_by = (select auth.uid()),
      updated_at = now()
    where id = p_destination_id
    returning id into v_destination_id;

    if v_destination_id is null then
      raise exception 'DESTINATION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if p_qr_point_id is null then
    insert into public.qr_points (
      destination_id, name, code, address, latitude, longitude, created_by
    ) values (
      v_destination_id, p_qr_name, p_qr_code, p_qr_address,
      p_qr_latitude, p_qr_longitude, (select auth.uid())
    ) returning id into v_qr_point_id;
  else
    update public.qr_points set
      name = p_qr_name,
      address = p_qr_address,
      latitude = p_qr_latitude,
      longitude = p_qr_longitude,
      is_active = true
    where id = p_qr_point_id and public.qr_points.destination_id = v_destination_id
    returning id into v_qr_point_id;

    if v_qr_point_id is null then
      raise exception 'QR_POINT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return query select v_destination_id, v_qr_point_id;
end;
$$;

revoke all on function public.save_destination_with_qr(
  uuid, uuid, text, text, text, text[], text, text, double precision, double precision,
  text, text[], boolean, boolean, text[], text, text, text, double precision, double precision
) from public, anon;
grant execute on function public.save_destination_with_qr(
  uuid, uuid, text, text, text, text[], text, text, double precision, double precision,
  text, text[], boolean, boolean, text[], text, text, text, double precision, double precision
) to authenticated;
