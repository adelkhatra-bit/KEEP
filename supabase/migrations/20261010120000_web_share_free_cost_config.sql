-- Adel (10/10/2026) : « rajoute un bouton Partager sur mon PC, le partage dure 24 heures ...
-- au début tu laisses à zéro, tu mets le popup comme ça le jour où je bascule le tarif est annoncé ».
-- Clé réglable dans le Super Admin > Remote Config. 0 = gratuit. Insertion seule : aucune donnée utilisateur touchée.
insert into public.remote_config(key, value, description)
values ('web_share_free_cost', '0'::jsonb, 'FREE annoncés pour un partage de 24 h sur ordinateur (Partager sur mon PC). 0 = gratuit. Annonce seulement tant que le débit n''est pas activé.')
on conflict (key) do nothing;
