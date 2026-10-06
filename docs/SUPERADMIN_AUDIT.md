# TEST MODE RÉEL — Audit Super Admin page par page (06/10/2026)

Méthode : lecture du code `packages/admin` (branche `reconcile/claude-main-20260825`, tête `07d328d`) + requêtes en lecture seule sur la base réelle Supabase. Aucune modification. Pas de capture 390/1440 : la page exige la connexion SUPER_ADMIN (mot de passe d'Adel).

Légende : ✅ marche · ⚠️ à corriger · ❌ cassé/manquant. « Textes > 5 mots » = textes visibles comptés automatiquement (règle n°1). « Clavier » = champs à taper (règle n°2).

## Constats transverses
| Sujet | Mesure réelle | Verdict |
|---|---|---|
| Menu ☰ | 18 entrées à plat + bouton « Mot de passe » en doublon dans l'en-tête | ⚠️ → 8 rubriques |
| Textes > 5 mots | **≈ 130** sur 19 fichiers (users 20, integrations 15, operations 14, plans 10) | ❌ règle 1 |
| Champs clavier | **≈ 37** (plans 10, users 6, costs 6) | ❌ règle 2 |
| Signalements « secousse » | **59 NEW** dans `app_problem_reports`, aucune page ne les lit | ❌ invisibles |
| Comptes non vérifiés | **4 / 19** (`email_confirmed_at` vide) | ⚠️ règle 5 |
| Suivi reconnaissance | `music_recognition_attempts` = **0 ligne / 14 j**. Cause racine : la table et la stat existent, **aucun code n'écrit dedans** | ❌ |
| Clés | ACRCloud, Brevo, Pipedream, sans-clé = ACTIVE ; **AudD = ERROR** (token refusé) ; Stripe = non configuré (reporté, normal) | ⚠️ |
| Connexions plateformes | `music_provider_connections` = 0 ; `music_service_connections` = 10 | ⚠️ Spotify/Deezer jamais connectés |

## Page par page
| # | Page (menu actuel) | Rôle | Données réelles | Textes>5 | Clavier | Verdict / action |
|---|---|---|---|---|---|---|
| 1 | Dashboard `/` | Stats période/pays | `admin_dashboard_stats` | 4 | 2 | ✅ données ; ⚠️ « 9 nouveaux vs 0/jour », « E-mail » en double (déjà signalé) |
| 2 | Utilisateurs `/users` | Fiches, FREE, certif, abonnés | `admin_user_directory` | 20 | 6 | ⚠️ ajouter : vérif e-mail + trace, mot de passe testeur 30 j, « Relancer les non vérifiés » |
| 3 | Approuver `/moderation` | Évènements photo/texte | 0 en attente (1 seul, déjà approuvé) | 2 | 1 | ✅ normal ; ⚠️ état vide « Rien à approuver » + historique |
| 4 | Communauté `/community` | Mots interdits, signalements tchat | RPC agora/user_report | 5 | 1 | ✅ ; ⚠️ texte d'aide 40 mots |
| 5 | Support utilisateurs `/support-center` | Tickets | 0 ouvert | 2 | 0 (+1 zone réponse, normale) | ✅ |
| 6 | Messages `/messages` | Push à tous / sélection | `admin_user_directory` | 3 | 2 | ✅ ; ⚠️ titres proposés en liste |
| 7 | Accès notifications `/notification-access` | Cadenas par type | 40 règles | 3 | 1 | ✅ ; à ranger sous Support & messages |
| 8 | Music Brain `/music-brain` | Vibes / styles | stats réelles | 6 | 2 | ✅ ; ⚠️ réglages → listes |
| 9 | Abonnements & Prix `/plans` | Prix, quotas, FREE | `admin_get_quota_settings` | 10 | **10** | ❌ règle 2 : 10 champs chiffres → listes expliquées |
| 10 | API payantes `/operations` | Santé services, push | runtime + push | 14 | 0 | ⚠️ textes ; ajouter plafond ACRCloud jour/mois |
| 11 | Lancer Loki `/launch-center` | Check-list lancement | remote config | 8 | 0 | ✅ |
| 12 | Comptabilité `/costs` | CA, coûts, pays/devise séparés | `admin_finance_report` | 4 | 6 | ✅ séparation devise ; ⚠️ montants → listes + « Autre » |
| 13 | Place de marché `/marketplace` | Ventes playlists/billets | 3 RPC | 6 | 0 | ✅ (lecture seule ; aucun bouton = normal) |
| 14 | Feature Flags `/feature-flags` | Interrupteurs | 8 flags | 2 | 0 | ✅ |
| 15 | Textes & Quotas `/remote-config` | Textes distants | remote config | 3 | 2 | ⚠️ valeurs chiffrées → listes |
| 16 | Clés & intégrations `/integrations` | Coller les clés | `admin_integration_runtime_status` | 15 | 2 | ⚠️ une carte par service, « Où la trouver » + « Coller », AudD en erreur |
| 17 | Test e-mail `/email-test` | Brevo | Brevo ACTIVE | 6 | 1 | ✅ (test reçu 06/10) ; → déplacer dans la carte Brevo (aucune suppression : même composant) |
| 18 | Sécurité & mot de passe `/team` | Rôles, mot de passe | — | 8 | 3 | ✅ ; ❌ doublon « 🔐 Mot de passe » dans l'en-tête |
| — | Connexion `_app` | Login | — | 5 | 2 (normal) | ⚠️ texte d'aide long |

## Clés manquantes (à lister dans « Clés & intégrations »)
| Service | État | Gratuit ? |
|---|---|---|
| AudD | token refusé | → retirer (ACRCloud couvre) |
| Deezer (APP_ID/SECRET) | absent | oui |
| YouTube OAuth (client Google) | absent (seule une clé API existe) | oui |
| SoundCloud | via Pipedream (ACTIVE) | à tester |
| Traduction | aucune | solution gratuite à choisir (textes relus, pas d'API payante) |
| Spotify | clés OK, 0 connexion | demande d'extension de quota à envoyer (Adel) |
| Apple Music catalogue | provider codé (`AppleMusicProvider.ts`), clé MusicKit existante | à brancher dans la recherche |
| ShazamKit Android | non présent (iOS seul : `KeepShazamModule.swift`) | oui, avec MusicKit |

## Plan ordonné (une étape = une preuve 390/1440, rien supprimé, aucun doublon)
1. **Bugs avant Apple** (bloquent la soumission) : son iPhone (`ensurePlaying` 90 ms), STORY_PIN `trk_`, stories vues synchronisées en base, écran Offres plus court, déploiement des 2 fonctions Apple, pop-up « disponible sur l'App Store ».
2. **Menu 8 rubriques** : regroupement des 18 entrées (mêmes écrans), suppression du seul doublon d'en-tête, Test e-mail rangé dans la carte Brevo, état vide « Rien à approuver ».
3. **Modération** : page « Signalements secousse » branchée sur `app_problem_reports` (59 NEW).
4. **Utilisateurs** : vérif e-mail pour tous (pop-up app + « Relancer les non vérifiés ») ; mots de passe testeurs chiffrés 30 j, SUPER_ADMIN seul, « Effacer », trace datée.
5. **Reconnaissance** : écrire chaque essai dans `music_recognition_attempts` (cause racine) ; plafond ACRCloud jour/mois ; retirer AudD ; ShazamKit Android.
6. **Musique** : Apple Music catalogue dans la recherche ; Deezer, YouTube OAuth, SoundCloud ; retour dans Loki après connexion ; rangement auto des likes/playlists ; rappel « synchronise ta plateforme ».
7. **Zéro clavier** : listes déroulantes expliquées (Abonnements, Comptabilité, Textes & quotas, Music Brain), Copier/Coller, cartes de clés « Où la trouver ».
8. **Règle 5 mots + alignements** : composant commun « En savoir plus », grille commune, garde CI d'abord en avertissement puis bloquante. ⚠️ Conflit à trancher : écran Offres validé à 23 mots.
9. **Traduction** gratuite + textes relus.

## Ce qu'Adel doit faire (rien d'autre)
- Dire « OK plan » (ou changer l'ordre).
- Trancher : écran Offres 23 mots ou 5 mots.
- Plus tard, au moment de chaque clé : copier la clé (Deezer, Google/YouTube) ; envoyer la demande de quota Spotify (pré-remplie).
