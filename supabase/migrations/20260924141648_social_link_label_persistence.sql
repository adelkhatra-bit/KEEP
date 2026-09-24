-- Persistance du libellé du bouton site web du profil.
-- Le champ est nullable pour rester compatible avec tous les liens sociaux existants.

alter table public.social_links
  add column if not exists label text;

update public.social_links
set label = 'Mon site'
where platform = 'website'
  and label is null
  and nullif(trim(url), '') is not null;

comment on column public.social_links.label is
  'Libellé optionnel affiché pour un lien, notamment le bouton site web du profil.';
