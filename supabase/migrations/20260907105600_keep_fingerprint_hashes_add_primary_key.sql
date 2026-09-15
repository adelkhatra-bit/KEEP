-- Audit multi-agent 07/09/2026 (juge charge/scalabilite) : la plus grosse table
-- de la base (510 852 lignes, alimentee par chaque reconnaissance audio reussie
-- via l'auto-seed en arriere-plan) n'a aucune cle primaire -- rien n'empeche un
-- futur chemin d'insertion (correctif, retry manuel) de dupliquer des dizaines
-- de milliers de lignes pour un meme morceau, et complique replication/vacuum.
-- Verifie en direct : 0 doublon sur (hash, track_id, time_offset_ms) parmi les
-- 510 852 lignes actuelles -- la PK composite peut donc s'appliquer sans purge.

ALTER TABLE public.keep_fingerprint_hashes
  ADD CONSTRAINT keep_fingerprint_hashes_pkey PRIMARY KEY (hash, track_id, time_offset_ms);

-- La PK composite est indexee sur (hash, ...) en tete -- ne sert pas les
-- operations de maintenance/dedoublonnage filtrees par track_id seul.
CREATE INDEX IF NOT EXISTS idx_keep_fingerprint_hashes_track_id ON public.keep_fingerprint_hashes (track_id);
