-- Configuration desktop réellement consommée par SellerBoutique, visible dans Super Admin.
-- Appliquée en production le 10 octobre 2026.
insert into public.remote_config (key,value,description)
values
 ('desktop_boutique_columns','3'::jsonb,'Nombre de colonnes de la boutique ordinateur entre 1100 et 1699 pixels (2 à 4).'),
 ('desktop_boutique_columns_wide','4'::jsonb,'Nombre de colonnes de la boutique ordinateur à partir de 1700 pixels (2 à 4).')
on conflict (key) do nothing;
