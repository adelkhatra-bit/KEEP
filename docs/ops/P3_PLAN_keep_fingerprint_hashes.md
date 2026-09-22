# P3 — Plan de sauvegarde / optimisation de `keep_fingerprint_hashes`

_Auteur : Abacus Agent — 2026-09-22. **Règle : rien n'est supprimé.** Ce document est un plan chiffré ; aucune commande n'a été exécutée sur la base._

## 0. Rappel : rôle de la table

Mémoire musicale collective (empreintes façon Shazam) alimentée par chaque reconnaissance réussie
(auto-seed en arrière-plan). C'est la **plus grosse table de la base**. Lecture/écriture réservées
au `service_role` (edge functions). Requête chaude unique : `service_lookup_fingerprint_hashes(p_hashes bigint[])`
→ `where hash = any(p_hashes)`.

## 1. Structure actuelle

```
public.keep_fingerprint_hashes (
  hash          bigint  not null,
  track_id      uuid    not null references keep_fingerprint_tracks(id) on delete cascade,
  time_offset_ms integer not null
)
```

- **~510 852 lignes** (mesuré le 07/09/2026, en croissance continue).
- **Pas de colonne temporelle** (`created_at` absent) → pas de partitionnement/archivage par date possible **en l'état**.
- Largeur ligne ≈ 8 (bigint) + 16 (uuid) + 4 (int) = **28 octets de données** + ~24 octets d'en-tête tuple ≈ **~52 o/ligne** → **heap ≈ 26–30 Mo** (estimation).

## 2. Analyse des 3 index

| Index | Colonnes | Rôle réel | Verdict |
|---|---|---|---|
| `keep_fingerprint_hashes_pkey` | (hash, track_id, time_offset_ms) | Unicité (anti-doublon) **+ sert la requête chaude** `where hash = any(...)` car `hash` est en tête | **ESSENTIEL — garder** |
| `keep_fingerprint_hashes_hash_idx` | (hash) | Créé avant la PK. **Redondant** : la PK commence déjà par `hash`, donc couvre tout filtre sur `hash` seul | **🎯 REDONDANT — candidat n°1 à supprimer** |
| `idx_keep_fingerprint_hashes_track_id` | (track_id) | Sert le `ON DELETE CASCADE` (suppression d'un track → purge de ses hashes) + maintenance/dédoublonnage par `track_id` | **UTILE — garder** |

### Gain principal = supprimer l'index redondant `keep_fingerprint_hashes_hash_idx`

- B-tree sur un `bigint` ≈ ~16 o/entrée (clé + en-tête) + ~30 % de surcharge fanout →
  **≈ 10–15 Mo** récupérés sur ~510 k lignes (**estimation**).
- **Zéro perte de performance** : la requête chaude bascule sur l'index PK (même colonne de tête).
- **Zéro perte fonctionnelle** : c'est un doublon d'index, pas une donnée.
- Opération quasi-instantanée et non bloquante en lecture : `DROP INDEX CONCURRENTLY`.

## 3. Compactage (VACUUM) — à conditionner à une mesure

La table est **append-mostly** (surtout des INSERT via auto-seed ; DELETE seulement en cascade
quand un track est retiré). Le bloat est donc probablement faible.

- **Ne PAS lancer `VACUUM FULL` à l'aveugle** : il prend un `ACCESS EXCLUSIVE LOCK` → **bloque la
  reconnaissance** pendant toute la réécriture.
- Décider d'après la mesure de bloat (requête §5). Si bloat significatif :
  - Préférer **`pg_repack`** (réécrit sans lock long) — nécessite l'extension.
  - Sinon `VACUUM FULL` **en fenêtre creuse** uniquement.
- `VACUUM (ANALYZE)` simple (non bloquant) : sûr, à planifier régulièrement pour rafraîchir les stats.

## 4. Archivage — options (aucune sans schéma additif)

Contrainte : pas de timestamp sur les hashes → impossible d'archiver « les vieux » directement.

1. **Option A (recommandée si archivage voulu) — ajout non destructif d'une colonne date**
   `ALTER TABLE ... ADD COLUMN created_at timestamptz DEFAULT now();` (additif, ne casse rien ;
   les lignes existantes prennent `now()` — dates réelles perdues pour l'historique mais horodatage
   correct à partir de maintenant). Ouvre ensuite le partitionnement par plage de dates.
2. **Option B — archivage par froideur de track** : déplacer vers `keep_fingerprint_hashes_archive`
   les hashes des tracks jamais re-matchés depuis N mois. Nécessite de tracer `last_matched_at` sur
   `keep_fingerprint_tracks` (colonne additive) — sinon non mesurable.
3. **⚠️ Impact rappel** : tout archivage de lignes = morceaux moins bien reconnus. La table EST la
   mémoire de reconnaissance. **Recommandation : ne PAS archiver de lignes pour l'instant** ; le gain
   d'espace réel et sans risque vient de l'index redondant (§2), pas de la purge de données.

## 5. Requêtes de MESURE à lancer par Adel (chiffres réels)

> Je n'ai pas d'accès SQL direct à la base ; les Mo ci-dessus sont des **estimations**. Ces requêtes
> donnent les vrais chiffres (à coller dans le SQL editor Supabase, service_role) :

```sql
-- Tailles table + index
select
  pg_size_pretty(pg_total_relation_size('public.keep_fingerprint_hashes')) as total,
  pg_size_pretty(pg_relation_size('public.keep_fingerprint_hashes'))       as heap,
  pg_size_pretty(pg_indexes_size('public.keep_fingerprint_hashes'))        as indexes;

-- Taille de chaque index
select indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) as size,
       idx_scan as fois_utilise
from pg_stat_user_indexes
where relname = 'keep_fingerprint_hashes'
order by pg_relation_size(indexrelid) desc;

-- Bloat / lignes mortes (décide du VACUUM)
select n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
from pg_stat_user_tables where relname = 'keep_fingerprint_hashes';
```

`idx_scan` de `keep_fingerprint_hashes_hash_idx` devrait être ~0 ou très bas → confirme la redondance.

## 6. Plan d'action recommandé (ordre)

1. **Mesurer** (§5) → chiffres réels de taille + `idx_scan` + bloat.
2. **Gain immédiat, sans risque** (après GO) :
   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS public.keep_fingerprint_hashes_hash_idx;
   ```
   → ~10–15 Mo (estimation), aucune perte fonctionnelle ni de perf.
3. **VACUUM** seulement si `n_dead_tup` élevé, via `pg_repack` ou fenêtre creuse.
4. **Archivage** : reporté, sauf besoin explicite ; passerait par l'ajout additif d'un `created_at`
   (Option A) — décision d'Adel.

> **Aucune action appliquée.** Livrable = plan + requêtes de mesure. En attente d'arbitrage/GO.
