-- Adel (04/09/2026) : "il met du reggae, il mélange tout" -- CONFIRMÉ, même
-- bug que FUNK (20260904211855) : 28 des 76 morceaux tagués REGGAE (37%)
-- avaient un genre Apple Music sans rapport avec le reggae -- le mot
-- apparaissait seulement dans le titre/l'artiste des résultats iTunes pour
-- le terme "reggae"/"reggae roots", jamais vérifié contre le vrai genre.
-- Supprime uniquement les liaisons theme_code=REGGAE dont le genre stocké
-- ne correspond pas, sans toucher aux morceaux eux-mêmes ni à aucun autre
-- thème.
delete from public.keep_battle_track_themes m
using public.tracks t
where m.track_id=t.id
  and m.theme_code='REGGAE'
  and not exists (
    select 1 from unnest(coalesce(t.genres, array[]::text[])) g
    where g ~* 'reggae|dancehall|ska|dub'
  );
