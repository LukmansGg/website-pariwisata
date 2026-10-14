-- Staff-readable projection of the existing anonymous visitor-session RPC.
-- The primary session lifecycle stays owned by create_or_resume_visitor_session.
create table if not exists public.tourism_visitor_sessions (
  id uuid primary key,
  visitor_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  started_at timestamptz not null,
  last_activity_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null check (status in ('active', 'expired', 'ended')),
  updated_at timestamptz not null default now()
);

create index if not exists tourism_visitor_sessions_started_idx
  on public.tourism_visitor_sessions (started_at desc);
create index if not exists tourism_visitor_sessions_active_idx
  on public.tourism_visitor_sessions (expires_at desc)
  where status = 'active';
create index if not exists tourism_visitor_sessions_destination_idx
  on public.tourism_visitor_sessions (destination_id, started_at desc);

alter table public.tourism_visitor_sessions enable row level security;
revoke all on public.tourism_visitor_sessions from anon, authenticated;
grant select, insert, update on public.tourism_visitor_sessions to authenticated;

drop policy if exists "Visitors can read their own session monitor rows" on public.tourism_visitor_sessions;
create policy "Visitors can read their own session monitor rows"
  on public.tourism_visitor_sessions for select to authenticated
  using ((select auth.uid()) = visitor_id);

drop policy if exists "Visitors can record their own session monitor rows" on public.tourism_visitor_sessions;
create policy "Visitors can record their own session monitor rows"
  on public.tourism_visitor_sessions for insert to authenticated
  with check ((select auth.uid()) = visitor_id);

drop policy if exists "Visitors can update their own session monitor rows" on public.tourism_visitor_sessions;
create policy "Visitors can update their own session monitor rows"
  on public.tourism_visitor_sessions for update to authenticated
  using ((select auth.uid()) = visitor_id)
  with check ((select auth.uid()) = visitor_id);

drop policy if exists "Staff can read visitor session monitor rows" on public.tourism_visitor_sessions;
create policy "Staff can read visitor session monitor rows"
  on public.tourism_visitor_sessions for select to authenticated
  using ((select public.has_staff_role('editor')));
