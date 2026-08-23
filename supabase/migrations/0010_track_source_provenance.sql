-- KEEP — 0010: provenance des morceaux du KEEP Local Index (cf. demande
-- explicite du 23/08/2026 -- "stocke : title/artist/album/duration/source/
-- source_url/fingerprint_id"). `fingerprint_id` existe déjà (keep_fingerprints.id,
-- migration 0009) -- ce fichier ajoute UNIQUEMENT ce qui manquait sur `tracks` :
-- d'où vient ce morceau de référence (corpus QA Jamendo, contribution
-- utilisateur réelle via AcoustID, etc.) -- traçabilité, pas une donnée
-- exploitée pour la reconnaissance elle-même.

alter table tracks add column if not exists source text;
alter table tracks add column if not exists source_url text;
comment on column tracks.source is 'Origine du morceau de référence -- ex. ''jamendo_qa'' (corpus QA Creative Commons) | ''acoustid'' (contribution utilisateur réelle) | ''manual''.';
comment on column tracks.source_url is 'Lien vers la source originale (ex. page Jamendo) -- traçabilité/licence, jamais utilisé pour la reconnaissance.';
