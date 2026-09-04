-- Adel (04/09/2026) : "je suis pas sûre que ce soit de la funk, je sais pas
-- il les trouve où" -- CONFIRMÉ : la fonction keep-battle-catalog-seed
-- cherchait sur iTunes le terme "funk" et taguait TOUT résultat FUNK à 96%
-- de confiance sans jamais vérifier le vrai genre renvoyé par iTunes. Sur
-- 83 morceaux tagués FUNK, 32 (39%) avaient un genre Apple Music qui n'a
-- rien à voir (Electronic, Dance, Hip-Hop/Rap, Rock, Hard Rock, Latin,
-- Pop, Children's Music, Worldwide) -- le mot "funk" apparaissait
-- seulement dans le TITRE (funk brésilien "FUNK DO BOUNCE"/"SARAVIA FUNK",
-- l'EDM "Funk" de Martin Garrix, "Funk" de Meghan Trainor, etc.). Apple
-- Music n'a pas de genre "Funk" dédié : le vrai funk est classé
-- "R&B/Soul" -- supprime uniquement les liaisons theme_code=FUNK dont le
-- genre stocké ne correspond pas, sans toucher aux morceaux eux-mêmes ni
-- à aucun autre thème.
delete from public.keep_battle_track_themes m
using public.tracks t
where m.track_id=t.id
  and m.theme_code='FUNK'
  and not exists (
    select 1 from unnest(coalesce(t.genres, array[]::text[])) g
    where g ~* 'funk|r&b|soul'
  );
