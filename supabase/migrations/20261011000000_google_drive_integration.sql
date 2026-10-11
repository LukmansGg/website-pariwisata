-- OAuth refresh credentials are encrypted by the Next.js server before insert.
-- Authenticated staff can read only ciphertext; the encryption key stays server-side.
create table if not exists public.google_drive_connections (
  id text primary key check (id = 'primary'),
  encrypted_credentials text not null,
  connected_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.google_drive_connections enable row level security;
revoke all on public.google_drive_connections from anon, authenticated;
grant select, insert, update, delete on public.google_drive_connections to authenticated;

drop policy if exists "Staff can manage encrypted Google Drive connection" on public.google_drive_connections;
create policy "Staff can manage encrypted Google Drive connection"
  on public.google_drive_connections for all to authenticated
  using (
    exists (
      select 1
      from public.user_roles
      where user_id = (select auth.uid())
        and role in ('admin', 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.user_roles
      where user_id = (select auth.uid())
        and role in ('admin', 'editor')
    )
  );
