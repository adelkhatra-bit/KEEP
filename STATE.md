# STATE — Loki Music (ce qui est FAIT)

> **Point d'entrée court pour toute IA / tout développeur.** Il n'y a **pas de deuxième mémoire** : ce fichier renvoie aux fichiers existants et tient le **journal daté des actions** (une ligne par action : date · branche · commit · fonction · preuve). Règle : à la fin de chaque action, ajouter une ligne ici (jamais d'effacement).

## Où lire (ordre)
1. `CLAUDE.md` + `AGENTS.md` (règles absolues) → 2. **`STATE.md`** (fait) → 3. **`MASTER_PLAN.md`** (reste à faire) → 4. `PROJECT_STATE.md` (tableau de bord technique) → 5. `.context/activeContext.md` (reprise détaillée) → 6. `docs/IDEAS_INBOX.md` (idées d'Adel) → 7. `docs/ERROR_LEDGER.md` (erreurs, causes, preuves) → 8. `docs/CODE_GPS.md` (qui possède quelle fonction).
Rapport d'audit externe : `docs/AUDIT_EXTERNE_2026-10-06.md`. Notifications : `docs/NOTIFICATIONS_AUDIT.md`. Agent réparateur : `docs/REPAIR_AGENT.md`. Prix : `docs/PRICING_PROPOSAL_SIMULATION.md`.

## Branches (vérifiées le 06/10/2026)
- **Branche de travail unique : `reconcile/claude-main-20260825`** (toute IA travaille ici, jamais sur `main`).
- `main` : figée (métadonnées GitHub seulement), 203 commits derrière, 2 074 devant par historique divergent — ne rien y pousser.
- `claude/music-stories-20261005` : 136 commits derrière reconcile, 0 devant → archive, rien à récupérer.
- `copilot/*`, `dependabot/*` : références d'audit et mises à jour automatiques, non sources produit.

## Journal (récent d'abord)
| Date | Branche | Commit | Fonction | Preuve |
|---|---|---|---|---|
| 06/10/2026 | reconcile | voir git log | Gouvernance : STATE.md, MASTER_PLAN.md, audit externe rangé, idées 130-138 notées | fichiers relus ; aucun code modifié |
| 06/10/2026 | reconcile | 362b25f | Menu ☰ pleine largeur + retour direct à la même position ; boucle secousse → signalement localisé → robot ; invitation du visiteur ; pochette carrée ; `keep_event_playlist` créée ; défi « Réagir » corrigé ; source Apple corrigée (non déployée) | jest 1317, 7 gardes, navigateur 390/1440 (retour menu 120→120) ; **non vérifié iPhone** |
| 06/10/2026 | base | — | `app_problem_reports` enrichie, RPC `keep_my_report_updates`/`keep_report_ack`, routine `trig_01CHASzNZx7Yx35UZMmErk8e` (sans connecteur Supabase) | lectures SQL ; routine à compléter dans claude.ai |
| 05/10/2026 | reconcile | 3ea86e5 | Compteurs de réactions alignés (vert/ambre/violet), sections de profil repliables (boutique, ventes privées) | navigateur 320/390/1440 |
| 05/10/2026 | reconcile | e703734 | « Mon oreille » (niveaux, défis, rapport de communauté), fenêtre « Vues de ta story » agrandie | jest, navigateur, RPC testée en transaction annulée |
| 05/10/2026 | reconcile | 2b7e63a et avant | Réactions 3D, merci par le nom, des-aimer, moteur de goût + recommandations dans Loki Pulse, stories (vues, chapitres, classement, badge), robot | voir `PROJECT_STATE.md` et `docs/ERROR_LEDGER.md` |
