-- Loki Music — un doublon de morceau se prouve par une identité forte.
-- Même titre + même artiste n'est PAS suffisant : deux versions peuvent avoir
-- un contenu audio/paroles différent. On conserve l'index texte uniquement
-- pour accélérer la recherche, jamais comme contrainte d'unicité.

drop index if exists public.tracks_no_isrc_identity_uidx;

comment on function public.keep_track_identity(text,text) is
  'Clé de recherche texte uniquement. Ne doit jamais servir seule à fusionner ou refuser deux morceaux.';
