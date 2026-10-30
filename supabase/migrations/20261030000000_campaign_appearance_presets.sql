-- Store campaign presentation separately from the array-only form_schema.
-- The form submission RPC continues to read form_schema as a JSON array.
alter table public.promotion_campaigns
  add column if not exists form_appearance jsonb;

-- Initialize only rows that do not already have a style, so rerunning this
-- migration never overwrites a campaign's chosen appearance.
update public.promotion_campaigns
set form_appearance = case
  when placement_mode in ('destination_feedback', 'website_feedback')
    then '{"preset":"rating","buttonStyle":"flat","titleStyle":"bold"}'::jsonb
  else '{"preset":"promo","buttonStyle":"gloss","titleStyle":"bold"}'::jsonb
end
where form_appearance is null;

alter table public.promotion_campaigns
  alter column form_appearance set default '{"preset":"promo","buttonStyle":"gloss","titleStyle":"bold"}'::jsonb,
  alter column form_appearance set not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'promotion_campaign_form_appearance_valid'
      and conrelid = 'public.promotion_campaigns'::regclass
  ) then
    alter table public.promotion_campaigns
      add constraint promotion_campaign_form_appearance_valid
      check (
        jsonb_typeof(form_appearance) = 'object'
        and coalesce(form_appearance ->> 'preset', '') in ('promo', 'event', 'rating')
        and coalesce(form_appearance ->> 'buttonStyle', '') in ('depth', 'flat', 'gloss')
        and coalesce(form_appearance ->> 'titleStyle', '') in ('bold', 'editorial', 'glow')
      );
  end if;
end $$;

grant select (form_appearance) on public.promotion_campaigns to anon, authenticated;
grant insert (form_appearance) on public.promotion_campaigns to authenticated;
