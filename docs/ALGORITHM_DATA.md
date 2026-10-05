# Algorithme & données — « machine de guerre » (Adel, 05/10/2026, IDEA-112)

> Objectif : chaque geste d'un utilisateur est un signal ; le système apprend son goût et lui propose AUTOMATIQUEMENT des musiques à son style, à installer sur son profil (payées en FREE). Tout est calculé côté serveur, en lecture seule, à partir de données créées UNE seule fois.

## 1. Signaux collectés (où ils vivent)
| Signal | Table / source | Poids dans le goût |
|---|---|---|
| GARDER (public ou privé) | `keep_decisions` (KEPT) | +2 par genre de la musique |
| ❤ aimé | `track_likes` (profile_id, track_id uuid) — déjà lue par les notifications d'affinité | +3 |
| 😐 bof | `track_dislikes.reaction = 'MEH'` | +0,5 |
| 👎 pas aimé | `track_dislikes.reaction = 'DISLIKE'` | −3 |
| Partage en story | `story_pins` | +1 |
| Écoute / vues / chapitres | `profile_swipe_listens`, `story_watch_sessions` | (à brancher : engagement par chapitre) |
| Abonnements | `follows` | +2 pour une musique gardée par un abonnement |
| Parrainages, formules | `keep_referrals`, `subscriptions` | (à brancher : valeur du membre) |

Changer d'avis est possible (un appui sur sa réaction la retire) : le signal est toujours l'état ACTUEL.

## 2. Moteur (lecture seule, SECURITY DEFINER, migration 20261005400000)
- `keep_my_taste_profile()` : poids par genre de l'utilisateur connecté (somme des signaux ci-dessus).
- `keep_recommend_for_me(p_limit)` : candidats = musiques GARDÉES en public par d'autres (90 jours), hors celles que j'ai déjà gardées / aimées / évaluées négativement. Score = poids de goût des genres + 2 (gardée par un abonnement) + 0,7·ln(1+❤) + 0,4·ln(1+gardeurs) + fraîcheur (1 → 0 sur 90 jours). Chaque ligne porte une **raison** lisible (« Ton style : R&B/Soul · gardé par un de tes abonnements »).
- Branchement : `loadLokiPulse` (Loki Pulse) fusionne les recommandations de goût EN TÊTE (`tasteMerge.ts`), sans doublon ; en cas d'erreur le Pulse reste inchangé.
- Contrôle réel (base, 05/10/2026) : pour teyou, goût = R&B/Soul 22 · Hip-hop 8 · Dance 7 · Funk 6 ; 5 recommandations avec raisons.

## 3. Pour celui qui partage
Compteurs « ❤ N · 😐 K · 👎 M » sur sa story (RPC `keep_my_track_reaction_counts`, limitée à ses musiques, sans identité).

## 4. Prochaines briques (ordre conseillé)
1. Pondérer par l'engagement réel (temps passé par chapitre, écoute complète, réécoute).
2. Affinités entre membres (goûts proches → suggestions d'abonnement et de stories).
3. Recommandations d'**achat** : collections en vente proches de mon goût (FREE), avec le raisonnement affiché.
4. Tableau de bord Super Admin : genres montants, taux de ❤/😐/👎, couverture des recommandations, rétention par cohorte.
5. Moteur de sessions « Pour toi » (file dédiée) + notifications intelligentes plafonnées (même cadre que le robot).
