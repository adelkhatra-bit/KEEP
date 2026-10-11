# Audit — Onglet Playlist de soirée (PartiesScreen)

Date : 23/09/2026 · Statut : **AUDIT SEUL, aucun code écrit. En attente du GO d'Adel.**

## 1. Où est stockée la playlist d'un événement ?

**Bonne nouvelle : le stockage existe déjà, rien à créer côté schéma.**

Chaîne de tables (déjà en place) :

```
events.playlist_id  ──►  playlists.id
                          playlists  ──►  playlist_tracks (playlist_id, track_id)
                                          playlist_tracks ──► tracks.id
```

- `events.playlist_id uuid references playlists(id)` — commentaire d'origine : *« playlist de la soirée »* (migration `0004_events.sql`).
- `playlists` (migration `0002_music.sql`) : `id, owner_id, name, cover_url, is_public, is_smart…`
- `playlist_tracks` (table de liaison) : `(playlist_id, track_id, added_at, added_via)`.
- `tracks` : `id, title, artist, album, artwork_url, genres, duration_sec…`

**→ Aucune nouvelle table ni migration nécessaire pour lire une playlist de soirée.**

## 2. Requête de récupération

### Option A — SQL direct
```sql
select t.id, t.title, t.artist, t.album, t.artwork_url, t.duration_sec
from events e
join playlist_tracks pt on pt.playlist_id = e.playlist_id
join tracks t          on t.id = pt.track_id
where e.id = :event_id
order by pt.added_at asc;
```

### Option B — Supabase JS (client)
```ts
const { data } = await supabase
  .from('playlist_tracks')
  .select('added_at, tracks(id,title,artist,album,artwork_url,duration_sec)')
  .eq('playlist_id', event.playlistId)
  .order('added_at', { ascending: true });
```

### ⚠️ Contrainte RLS (déterminante pour le choix)
Politique `playlist_tracks_via_playlist` (migration `0006_rls.sql`) : une ligne n'est lisible par un **visiteur** que si
`playlists.is_public = true` **ET** le morceau a une décision `keep_decisions` `KEPT` + `PUBLIC` chez le propriétaire.

Conséquence : un `select` direct **ne renverra rien** pour un visiteur si la playlist est privée, et masque déjà partiellement les morceaux non publics. Or tout le reste de l'écran Soirées passe par des RPC `keep_event_*` (SECURITY DEFINER).

**→ Recommandation : créer un RPC `keep_event_playlist(p_event_id)` (SECURITY DEFINER)**, cohérent avec le pattern existant, qui :
- résout `events.playlist_id`,
- renvoie les morceaux triés,
- **exclut/masque les morceaux en vente** (règle marketplace : un titre en vente ne révèle ni titre ni jaquette). À croiser avec `playlist_sale_masking`.

## 3. État actuel du front (déjà partiellement là)

`PartiesScreen.tsx` possède **déjà** le sous-onglet `PLAYLIST` :
- `eventTab: 'LOBBY' | 'CLASSEMENT' | 'PLAYLIST'` (ligne ~224)
- bouton d'onglet (ligne ~1142)
- panneau de rendu « PLAYLIST DE LA SOIRÉE » (ligne ~1244) qui mappe `currentEvent.tracks`.

**Le trou** : `EVENT_COLUMNS` (dans `creatorEventService.ts`) **ne sélectionne pas** `playlist_id`, et `mapEventRow` ne remplit jamais `tracks`. Résultat : l'onglet affiche toujours *« Aucun morceau proposé pour cet événement »*. L'UI est prête, seule la donnée manque.

## 4. Estimation d'effort

| Lot | Détail | Complexité |
|-----|--------|-----------|
| Migration RPC | `keep_event_playlist(p_event_id)` SECURITY DEFINER + exclusion morceaux en vente | Moyenne |
| Service | `loadEventPlaylist(eventId)` dans `creatorEventService.ts` + type `EventTrack` | Faible |
| Écran | Câbler l'appel au `useEffect` d'ouverture de l'onglet PLAYLIST + état loading/erreur (l'UI de liste existe déjà) | Faible |
| Lecture | Brancher le ▶ sur le service audio existant (préécoute/lecture) + éventuel Swipe | Faible → Moyenne |
| Tests | 1 test contrat (onglet affiche les morceaux quand playlist présente) + RLS/masquage vente | Faible |

**Effort global : FAIBLE à MOYEN** (~½ à 1 journée), car le schéma et l'UI existent déjà. Le vrai travail = 1 RPC + câblage donnée.

### Risques / points de vigilance
1. **Masquage marketplace** : ne jamais révéler titre/jaquette d'un morceau en vente dans la playlist de soirée. À traiter dans le RPC.
2. **RLS** : le `select` direct est insuffisant pour les visiteurs → RPC obligatoire.
3. **Rien ne disparaît** : ne pas retirer le bouton ♡ ni ▶ déjà présents dans le panneau.
4. **Auto-refresh** : après ajout/retrait de morceau à la playlist de soirée, mettre à jour l'état local sans refresh manuel (contrat produit Loki).

## 5. Décision demandée
Valider l'approche **RPC `keep_event_playlist` + câblage service/écran** avant d'écrire le code. **En attente du GO.**
