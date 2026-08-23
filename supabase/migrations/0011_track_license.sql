-- KEEP — 0011: licence explicite par morceau (cf. demande explicite du
-- 23/08/2026 -- "enregistre pour chaque morceau sa licence/provenance,
-- n'indexe que les éléments dont la licence est clairement exploitable").
-- `source`/`source_url` (migration 0010) disent D'OÙ vient le morceau ;
-- `license_url` dit SOUS QUELLE LICENCE PRÉCISE (ex. Creative Commons
-- BY-NC-ND 3.0) -- deux informations distinctes, toutes deux nécessaires
-- pour une vraie traçabilité légale du corpus QA.

alter table tracks add column if not exists license_url text;
comment on column tracks.license_url is 'Licence précise de la source QA (ex. https://creativecommons.org/licenses/by-nc-nd/3.0/) -- vide pour un morceau non-QA (découvert via reconnaissance utilisateur réelle).';
