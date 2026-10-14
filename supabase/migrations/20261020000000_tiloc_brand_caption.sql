-- Rebrand default Photobox copy and saved templates for the TiLoc launch.

alter table public.tourism_minigame_destinations
  alter column caption_template set default 'Kenangan seru di {destination}! #TiLoc';

update public.tourism_minigame_destinations
set caption_template = replace(replace(caption_template, 'MadiunTrip', 'TiLoc'), 'MADIUNTRIP', 'TILOC')
where caption_template like '%MadiunTrip%' or caption_template like '%MADIUNTRIP%';

update public.tourism_minigame_photos
set caption = replace(replace(caption, 'MadiunTrip', 'TiLoc'), 'MADIUNTRIP', 'TILOC')
where caption like '%MadiunTrip%' or caption like '%MADIUNTRIP%';
