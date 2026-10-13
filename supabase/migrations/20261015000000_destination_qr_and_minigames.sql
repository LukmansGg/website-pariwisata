-- Save one destination and its primary QR point in a single database transaction.
alter table public.destinations
  add column if not exists additional_minigames text[] not null default '{}';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'destinations_additional_minigames_allowed'
      and conrelid = 'public.destinations'::regclass
  ) then
    alter table public.destinations
      add constraint destinations_additional_minigames_allowed
      check (additional_minigames <@ array['find_friends', 'photobox']::text[]);
  end if;
end $$;

create or replace function public.save_destination_with_qr(
  p_destination_id uuid,
  p_qr_point_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_category text,
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
begin
  if p_destination_id is null then
    insert into public.destinations (
      slug, name, description, category, address, latitude, longitude,
      image_url, tags, is_featured, is_published, additional_minigames,
      created_by, updated_by
    ) values (
      p_slug, p_name, coalesce(p_description, ''), p_category, p_address,
      p_latitude, p_longitude, p_image_url, coalesce(p_tags, '{}'),
      coalesce(p_is_featured, false), coalesce(p_is_published, false),
      coalesce(p_additional_minigames, '{}'), (select auth.uid()), (select auth.uid())
    ) returning id into v_destination_id;
  else
    update public.destinations set
      slug = p_slug,
      name = p_name,
      description = coalesce(p_description, ''),
      category = p_category,
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
  uuid, uuid, text, text, text, text, text, double precision, double precision,
  text, text[], boolean, boolean, text[], text, text, text, double precision, double precision
) from public, anon;
grant execute on function public.save_destination_with_qr(
  uuid, uuid, text, text, text, text, text, double precision, double precision,
  text, text[], boolean, boolean, text[], text, text, text, double precision, double precision
) to authenticated;

create or replace function public.resolve_public_qr(p_code text)
returns table (slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.slug
  from public.qr_points q
  join public.destinations d on d.id = q.destination_id
  where q.code = p_code
    and q.is_active
    and d.is_published
    and d.image_url is not null
    and length(trim(d.image_url)) > 0
    and d.latitude is not null
    and d.longitude is not null
  limit 1;
$$;

revoke all on function public.resolve_public_qr(text) from public;
grant execute on function public.resolve_public_qr(text) to anon, authenticated;
