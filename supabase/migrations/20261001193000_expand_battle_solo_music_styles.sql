-- KEEP / Loki Music — expand Solo/Battle theme diversity.
insert into public.keep_battle_themes(code,label,enabled,sort_order)
values
  ('AMAPIANO','Amapiano',true,26),
  ('HOUSE','House',true,27),
  ('REGGAETON','Reggaeton',true,28),
  ('ALTERNATIVE','Alternative / Indie',true,29),
  ('COUNTRY','Country',true,30),
  ('METAL','Metal',true,31),
  ('SOUNDTRACK','Bandes originales',true,32),
  ('BLUES','Blues',true,33)
on conflict(code) do update set label=excluded.label, enabled=true, sort_order=excluded.sort_order, updated_at=now();

with genre_map(theme_code, rx) as (
  values
    ('AMAPIANO'::text, '(amapiano)'),
    ('HOUSE'::text, '(house)'),
    ('REGGAETON'::text, '(reggaeton|urbano latino|urban latin)'),
    ('ALTERNATIVE'::text, '(alternative|indie)'),
    ('COUNTRY'::text, '(country)'),
    ('METAL'::text, '(metal|metalcore)'),
    ('SOUNDTRACK'::text, '(soundtrack|bande originale|bandes originales|film score|original score)'),
    ('BLUES'::text, '(blues)')
)
insert into public.keep_battle_track_themes(track_id,theme_code,source,confidence)
select distinct t.id,gm.theme_code,'genre_backfill_20261001',0.95
from public.tracks t
cross join genre_map gm
where exists (
  select 1 from unnest(coalesce(t.genres,array[]::text[])) g
  where lower(g) ~ gm.rx
)
on conflict(track_id,theme_code) do update
set source=excluded.source, confidence=greatest(public.keep_battle_track_themes.confidence,excluded.confidence);
