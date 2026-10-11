-- Role staf dikelola pemilik melalui Supabase Dashboard/SQL Editor.
-- Jangan pernah menerima role dari metadata yang bisa diubah pengguna.
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

create policy "Staff can read their own role"
  on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.has_staff_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid())
      and (role = required_role or role = 'admin')
  );
$$;

revoke all on function public.has_staff_role(text) from public, anon;
grant execute on function public.has_staff_role(text) to authenticated;

-- Tabel konten dasar yang sejalan dengan model Destination di aplikasi.
create table if not exists public.tourism_destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '',
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tourism_destinations enable row level security;
revoke all on public.tourism_destinations from anon, authenticated;
grant select on public.tourism_destinations to anon, authenticated;
grant insert, update on public.tourism_destinations to authenticated;
grant delete on public.tourism_destinations to authenticated;

create policy "Public can read published destinations"
  on public.tourism_destinations for select to anon
  using (is_published);

create policy "Staff can read all destinations"
  on public.tourism_destinations for select to authenticated
  using (is_published or (select public.has_staff_role('editor')));

create policy "Staff can add destinations"
  on public.tourism_destinations for insert to authenticated
  with check ((select public.has_staff_role('editor')));

create policy "Staff can edit destinations"
  on public.tourism_destinations for update to authenticated
  using ((select public.has_staff_role('editor')))
  with check ((select public.has_staff_role('editor')));

create policy "Only admins can delete destinations"
  on public.tourism_destinations for delete to authenticated
  using ((select public.has_staff_role('admin')));
