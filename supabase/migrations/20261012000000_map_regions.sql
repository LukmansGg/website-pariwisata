-- Map areas are separate from tourist destinations. The public app may fill
-- the single seeded row once from OSM, then reads the cached geometry from DB.
create table if not exists public.map_regions (
  id text primary key,
  name text not null,
  search_terms text[] not null default '{}',
  county_geojson jsonb,
  city_geojson jsonb,
  source text not null default 'OpenStreetMap',
  updated_at timestamptz not null default now(),
  constraint map_regions_known_area check (id = 'madiun')
);

insert into public.map_regions (id, name, search_terms)
values ('madiun', 'Madiun', array['kota madiun', 'kabupaten madiun', 'kab madiun'])
on conflict (id) do nothing;

alter table public.map_regions enable row level security;
grant select on public.map_regions to anon, authenticated;
grant update (county_geojson, city_geojson, source, updated_at) on public.map_regions to anon;

drop policy if exists "Public can read map regions" on public.map_regions;
create policy "Public can read map regions" on public.map_regions
  for select to anon, authenticated using (true);

drop policy if exists "Public can cache initial Madiun boundaries" on public.map_regions;
create policy "Public can cache initial Madiun boundaries" on public.map_regions
  for update to anon
  using (id = 'madiun' and county_geojson is null and city_geojson is null)
  with check (id = 'madiun' and county_geojson is not null and city_geojson is not null);
