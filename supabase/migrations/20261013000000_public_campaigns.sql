-- Public pages can read only the display fields of currently published campaigns.
-- Keep partner, QR point, and staff metadata private from the anon role.
revoke select on public.promotion_campaigns from anon;
grant select (
  id,
  title,
  description,
  image_url,
  experience_type,
  cta_label,
  cta_url,
  starts_at,
  ends_at,
  created_at
) on public.promotion_campaigns to anon;

drop policy if exists "Public can read active promotion campaigns" on public.promotion_campaigns;
create policy "Public can read active promotion campaigns"
  on public.promotion_campaigns for select to anon
  using (
    status = 'published'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );
