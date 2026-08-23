-- KEEP — 0009: KEEP Local Index (cf. demande explicite du 23/08/2026 --
-- "chaque morceau identifié avec confiance enrichit notre propre moteur,
-- la prochaine fois : micro -> KEEP database -> résultat, sans payer une API").
--
-- Réutilise `tracks` (0002_music.sql) comme couche métadonnées -- pas de
-- table dupliquée avec titre/artiste/isrc en double (cf. règle anti-doublon
-- déjà appliquée à ReleaseRequestEngine/PlatformAvailabilityResolver côté
-- code). Ce fichier ajoute UNIQUEMENT ce qui manquait : (a) le droit
-- d'écrire un nouveau `tracks` sans service_role (aucune policy INSERT
-- n'existait), et (b) la table de correspondance entre la base
-- d'empreintes locale audfprint (fichier .pklz, hors Supabase -- voir
-- packages/backend/src/lib/localFingerprintIndex.ts) et un `tracks.id`.

-- `tracks` était en lecture seule publique (0006_rls.sql) -- aucune policy
-- n'autorisait l'écriture sans service_role. Un nouveau morceau confirmé
-- par AcoustID (donnée publique de référence, pas une donnée privée d'un
-- utilisateur) doit pouvoir être écrit par n'importe quelle session KEEP
-- authentifiée, y compris invité anonyme -- même niveau de confiance que la
-- lecture déjà publique de cette table.
drop policy if exists tracks_insert_authenticated on tracks;
create policy tracks_insert_authenticated on tracks for insert to authenticated with check (true);

create table if not exists keep_fingerprints (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references tracks(id) on delete cascade,
  -- Clé utilisée dans la base audfprint locale (nom de fichier interne au
  -- .pklz, voir localFingerprintIndex.ts) -- c'est CETTE clé que renvoie un
  -- match audfprint, à résoudre ici vers le vrai TrackIdentity KEEP.
  audfprint_key text not null unique,
  -- Provider qui a confirmé ce morceau la toute première fois (jamais
  -- 'keep_local' ici -- ce serait circulaire) : 'acoustid' | 'audd' | 'manual'.
  source_provider text not null,
  confidence numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_keep_fingerprints_track on keep_fingerprints(track_id);

alter table keep_fingerprints enable row level security;
-- Public en lecture (comme `tracks`) : savoir qu'un morceau est déjà
-- indexé n'est pas une donnée privée. Écriture réservée aux sessions
-- authentifiées (y compris invité) -- même raisonnement que tracks_insert_authenticated.
drop policy if exists keep_fingerprints_select_all on keep_fingerprints;
create policy keep_fingerprints_select_all on keep_fingerprints for select using (true);
drop policy if exists keep_fingerprints_insert_authenticated on keep_fingerprints;
create policy keep_fingerprints_insert_authenticated on keep_fingerprints for insert to authenticated with check (true);
