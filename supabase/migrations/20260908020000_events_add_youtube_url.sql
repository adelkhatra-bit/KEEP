-- Adel 08/09/2026 : "il faut trouver une solution pour que l'utilisateur
-- puisse mettre un lien YouTube pour montrer les evenements, la decoration,
-- etc." -- lien de promotion optionnel sur un evenement.
alter table public.events add column if not exists youtube_url text;
