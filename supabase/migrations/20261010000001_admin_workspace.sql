-- Workspace content model. `destinations` is the canonical table used by
-- the public site, scanner, and guest-session route.
create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  category text,
  address text,
  latitude double precision,
  longitude double precision,
  image_url text,
  tags text[] not null default '{}',
  is_featured boolean not null default false,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep existing destinations and their publication state intact. Existing
-- rows become published only when the old table had no publication column.
alter table public.destinations add column if not exists description text not null default '';
alter table public.destinations add column if not exists category text;
alter table public.destinations add column if not exists address text;
alter table public.destinations add column if not exists latitude double precision;
alter table public.destinations add column if not exists longitude double precision;
alter table public.destinations add column if not exists image_url text;
alter table public.destinations add column if not exists tags text[] not null default '{}';
alter table public.destinations add column if not exists is_featured boolean not null default false;
alter table public.destinations add column if not exists is_published boolean not null default true;
alter table public.destinations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.destinations add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.destinations add column if not exists created_at timestamptz not null default now();
alter table public.destinations add column if not exists updated_at timestamptz not null default now();

create unique index if not exists destinations_slug_unique on public.destinations (slug);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'destinations_coordinates_pair' and conrelid = 'public.destinations'::regclass) then
    alter table public.destinations add constraint destinations_coordinates_pair check ((latitude is null) = (longitude is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'destinations_latitude_range' and conrelid = 'public.destinations'::regclass) then
    alter table public.destinations add constraint destinations_latitude_range check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'destinations_longitude_range' and conrelid = 'public.destinations'::regclass) then
    alter table public.destinations add constraint destinations_longitude_range check (longitude is null or longitude between -180 and 180);
  end if;
end $$;

create table if not exists public.qr_points (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  code text not null unique check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  address text,
  latitude double precision,
  longitude double precision,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint qr_points_coordinates_pair check ((latitude is null) = (longitude is null)),
  constraint qr_points_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint qr_points_longitude_range check (longitude is null or longitude between -180 and 180)
);

create table if not exists public.tourism_partners (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(trim(business_name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  business_type text not null,
  description text not null default '',
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  website_url text,
  logo_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.tourism_partners(id) on delete restrict,
  qr_point_id uuid not null references public.qr_points(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null default '',
  image_url text,
  experience_type text not null check (experience_type in ('popup', 'minigame', 'photobox')),
  cta_label text,
  cta_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'ended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_campaign_dates check (starts_at is null or ends_at is null or ends_at > starts_at)
);

-- Keep this migration safe if the workspace tables were created earlier.
alter table public.tourism_partners add column if not exists logo_url text;
alter table public.promotion_campaigns add column if not exists image_url text;

create index if not exists destinations_published_created_idx on public.destinations (is_published, created_at desc);
create index if not exists qr_points_destination_idx on public.qr_points (destination_id);
create index if not exists tourism_partners_status_idx on public.tourism_partners (status, created_at desc);
create index if not exists promotion_campaigns_status_idx on public.promotion_campaigns (status, starts_at, ends_at);

alter table public.destinations enable row level security;
alter table public.qr_points enable row level security;
alter table public.tourism_partners enable row level security;
alter table public.promotion_campaigns enable row level security;

grant select on public.destinations to anon, authenticated;
grant insert, update, delete on public.destinations to authenticated;
grant select, insert, update, delete on public.qr_points to authenticated;
grant select, insert, update, delete on public.tourism_partners to authenticated;
grant select, insert, update, delete on public.promotion_campaigns to authenticated;

drop policy if exists "Public can read published destinations" on public.destinations;
create policy "Public can read published destinations"
  on public.destinations for select to anon
  using (is_published);

drop policy if exists "Staff can read all destinations" on public.destinations;
create policy "Staff can read all destinations"
  on public.destinations for select to authenticated
  using (is_published or (select public.has_staff_role('editor')));

drop policy if exists "Staff can add destinations" on public.destinations;
create policy "Staff can add destinations"
  on public.destinations for insert to authenticated
  with check ((select public.has_staff_role('editor')));

drop policy if exists "Staff can edit destinations" on public.destinations;
create policy "Staff can edit destinations"
  on public.destinations for update to authenticated
  using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));

drop policy if exists "Only admins can delete destinations" on public.destinations;
create policy "Only admins can delete destinations"
  on public.destinations for delete to authenticated
  using ((select public.has_staff_role('admin')));

drop policy if exists "Staff manage QR points" on public.qr_points;
create policy "Staff manage QR points" on public.qr_points for all to authenticated
  using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));

drop policy if exists "Staff manage tourism partners" on public.tourism_partners;
create policy "Staff manage tourism partners" on public.tourism_partners for all to authenticated
  using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));

drop policy if exists "Staff manage promotion campaigns" on public.promotion_campaigns;
create policy "Staff manage promotion campaigns" on public.promotion_campaigns for all to authenticated
  using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));
