# TEST MODE RÉEL — Audit Super Admin page par page (06/10/2026)

## Issue #57 — rapport de validation du 08/10/2026

### Relecture PR #58 — commentaire 6058058365
- Validateurs Brevo/YouTube/ACRCloud : phrases françaises contrôlées dans `message`, diagnostic technique dans `code` ; décisions `valid`/`status` et `providerCode` conservés. Aucun corps fournisseur recopié dans les messages.
- `node --test scripts/system-health.test.cjs` : **12/12 réussis**, dont matrice succès/refus/quota/API désactivée/hôte invalide et typecheck Edge strict. PostgreSQL local démarré après le premier essai qui échouait faute de socket ; aucun accès production. `node scripts/verify-product-contract.cjs` réussi ; revue ciblée sans bug certain.
- CI distante : [CodeQL PR 37723029001](https://github.com/adelkhatra-bit/KEEP/actions/runs/37723029001) et les autres contrôles de la revue sont `action_required`, sans jobs ni logs d’échec. Une autorisation GitHub est nécessaire ; aucun PASS CI revendiqué. Échec tchat mobile canonique préexistant : run 37711629482, hors correctif.
- `verify-source-of-truth` refuse maintenant la revue périmée : base distante récupérée `639f499db992d6d01fcaff1282d56eee04760e20` non ancêtre du HEAD de revue. Garde inchangé ; synchronisation de la revue à effectuer avant fusion, pas de fusion supplémentaire dans ce correctif ciblé.

**TEST MODE RÉEL production : NON EXÉCUTÉ dans cette session.** Aucun connecteur/accès Supabase authentifié disponible dans ce clone. Les nombres ci-dessous sont les valeurs de production fournies dans l’issue, pas une nouvelle mesure. Aucune écriture, migration ni fonction déployée en production ; aucune réception d’e-mail admin revendiquée.

| Source : issue #57, 08/10 vers 05 h | Valeur fournie |
|---|---|
| provider_health | vide |
| app_problem_reports | 90 NEW, 74 Profil, 14 en 24 h |
| email_queue, 7 j | 6 failed / 2 sent |
| push_delivery_attempts, 7 j | 370 NO_DEVICE / 12 FAILED / 34 DELIVERED ; 1 push token |
| web_pairings | 243 WAITING / 0 validé |
| cron, 24 h | 0 échec ; 2 observations « job startup timeout » fanout |

**Preuves locales, transport fournisseur simulé et PostgreSQL réel isolé :**
- `KEEP_PROBLEM_REPORT_LOCAL_SQL=1 node --test scripts/problem-report-evidence.test.cjs` : 7/7, sans skipped. Trois messages identiques ou normalisés → un groupe de 3 ; écrans/codes HTTP distincts séparés ; NEW → SEEN → FIXED atomique, SHA/test obligatoires, réouverture sans perte de preuves ; refus anon/non-admin.
- `node --test scripts/admin-system-health.test.cjs scripts/admin-release-evidence.test.cjs` : 13/13. Vert limité à un contrôle réussi récent ; erreur persistante, réponse inaccessible jamais transformée en zéro ; brouillon GitHub sans message, pseudo, appareil ni contexte privé ; anciens statuts « configuré » non présentés comme santé réelle.
- Serveur : `scripts/system-health.test.cjs` exercé par l’agent serveur, 11/11, probes simulées, signature ES256 réellement vérifiée, PostgreSQL16 isolé : panne → ligne ERROR + notification/e-mail uniques, rétablissement puis nouvelle panne → nouvel incident ; authentification worker refusée sans clé valide, atomicité/concurrence, files sans récursion, Brevo simulé et métriques UTC. Un succès antérieur à la dernière panne ne ferme pas l’incident ; un ticket Expo SENT n’est pas une livraison, seul DELIVERED avec horodatage confirmé peut prouver le rétablissement.
- `npx tsc --noEmit -p packages/admin` et `npm run build --workspace=packages/admin` : réussis, 22 pages exportées avec `/KEEP/admin-preview`. Vérifications robot et contraste intégrées au build.
- `scripts/admin-release-evidence-browser.cjs` sur cet export, Chromium **390×844 et 1440×900** : Santé, détails Brevo, cloche, résumé visible, pays/devise uniques, groupe de 3, brouillon d’issue, formulaire SHA/test, navigation/reload HTTP200, aucun débordement horizontal, aucun `pageerror` ni erreur HTTP des pages/assets. Panne de RPC simulée : Santé et cloche indisponibles, aucun faux vert.
- Captures **fixtures, jamais preuves de production** : [Santé 390](audit/evidence/issue57/sante-390.png), [Santé 1440](audit/evidence/issue57/sante-1440.png), [groupes 390](audit/evidence/issue57/signalements-390.png), [groupes 1440](audit/evidence/issue57/signalements-1440.png). Les compteurs représentés sont simulés et ne constituent pas le résumé réel du jour.
- Revue indépendante : deux faux rétablissements des files identifiés puis corrigés avec tests SQL ciblés ; seconde relecture sans nouveau bug significatif. L’exécutable de revue intégrée est indisponible ; la revue indépendante le remplace. Première analyse CodeQL : comparaison partielle d’hôte dans le mock Apple, remplacée par une comparaison exacte de `URL.hostname`. Relance après commit : analyse JavaScript ignorée (« aucun changement depuis la dernière exécution »), donc aucune nouvelle analyse complète du dernier SHA revendiquée.

**Activation contrôlée à faire après revue :** appliquer uniquement les deux migrations additives `20261008031000_system_health_monitor.sql` et `20261008031500_problem_report_groups.sql` avec l’accord d’Adel ; publier la fonction `keep-system-health` et l’admin via la chaîne canonique. Le worker utilise une clé interne Vault hachée, jamais une clé dans le navigateur. Vérifier ensuite les six probes, l’historique cron, les files, une alerte réellement reçue par Brevo et les groupes sur les vraies données. Les probes synthétiques ACR/Translate/YouTube peuvent consommer quota/coût (288 passages/jour) ; elles ne certifient pas une livraison e-mail/APNs. Les fonctions Edge restent UNKNOWN si leurs logs ne sont pas accessibles, jamais un taux d’erreur inventé. iPhone/TestFlight et CI distante de cette revue non vérifiés.

CI canonique examinée séparément : [run 37711629482](https://github.com/adelkhatra-bit/KEEP/actions/runs/37711629482), échec du bouton « Ouvrir la conversation avec profil-test » du smoke **tchat mobile** au SHA `fa193cc537d47132053163cc842a98756b2a1fff` ; fichiers mobile/workflow inchangés par #57. Aucun PASS global ni relance de ce workflow revendiqués.

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
8. **Règle 23 mots (tranchée par Adel le 06/10) + alignements** : composant commun « En savoir plus » (`ClampedText` existant), grille commune, garde CI d'abord en avertissement puis bloquante.
9. **Traduction** gratuite + textes relus.

## Ce qu'Adel doit faire (rien d'autre)
- Dire « OK plan » (ou changer l'ordre).
- Trancher : écran Offres 23 mots ou 5 mots.
- Plus tard, au moment de chaque clé : copier la clé (Deezer, Google/YouTube) ; envoyer la demande de quota Spotify (pré-remplie).
