-- Attach each local partner to the nearby destination used by QR campaigns and
-- minigame proximity rules. Existing partner rows remain valid until linked.
alter table public.tourism_partners
  add column if not exists destination_id uuid
  references public.destinations(id) on delete set null;

alter table public.tourism_partners
  add column if not exists max_distance_meters integer not null default 500;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tourism_partners_max_distance_meters_range'
      and conrelid = 'public.tourism_partners'::regclass
  ) then
    alter table public.tourism_partners
      add constraint tourism_partners_max_distance_meters_range
      check (max_distance_meters between 50 and 2000);
  end if;
end $$;

create index if not exists tourism_partners_destination_idx
  on public.tourism_partners (destination_id);
