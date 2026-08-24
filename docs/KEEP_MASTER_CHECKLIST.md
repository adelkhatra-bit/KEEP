# KEEP — Checklist maître du projet

Dernière mise à jour : 24/08/2026 (audit régression + fix routing/auth-hook).
Document UNIQUE de suivi (remplace le suivi éparpillé dans
PROJECT_STATUS.md/RESTE_A_FAIRE.md, tous deux partiellement obsolètes — voir
note en tête de ces fichiers). Voir aussi `KEEP_MASTER_SPEC.md` (ce qu'est
KEEP), `KEEP_DECISIONS.md` (règles validées à ne pas changer sans raison),
`KEEP_REGRESSION_TESTS.md` (suite de tests obligatoires) — protocole de
lecture avant toute tâche défini dans `CLAUDE.md` à la racine.

Statuts possibles : `TODO` / `IN PROGRESS` / `PARTIAL` / `PASS E2E` / `BLOCKED EXTERNAL`.

**Règle absolue : `PASS E2E` signifie un test réel exécuté et observé, jamais "le code compile".**

---

## Session 24/08/2026 (soir) — bugs live réels trouvés + corrigés

Test réel en direct par Adel (PC + téléphone comme source audio). Chaîne de
diagnostic : traces serveur réelles (`/api/dev/traces`), test direct API
AudD/Brevo/Supabase (jamais deviné). Root causes réels trouvés cette session,
tous corrigés et type-checkés :
- Login "Une erreur est survenue" -> email déjà pris par SON PROPRE compte
  existant (créé plus tôt) ; `updateUser` tente de LIER au lieu de
  CONNECTER. Fix : repli auto vers connexion normale (`OnboardingScreen.tsx`).
- Photo/pseudo qui ne s'enregistrent jamais -> 413 (avatar base64 > 100kb,
  limite Express par défaut) + échec PATCH avalé en silence. Fix : limite
  8mb (`index.ts`) + tout échec réel maintenant loggé (`profileApi.ts`).
- "Reconnaissance indisponible" après ~10s -> AudD erreur 300 ("empreinte
  impossible", PAS un problème de quota/clé -- clé vérifiée valide et
  active) traité à tort comme panne dure. Fix : 300/500 traités comme
  no_match propre (`AudDRecognitionProvider.ts`).
- Message rouge apparu sans action utilisateur -> écran idle affichait
  l'erreur de capture de la session précédente. Fix : retiré de l'écran
  idle (`HomeScreen.tsx`).
- "Trop de tentatives" apparu sans action -> écran CreateAccount reste monté
  entre deux ouvertures, état (erreur/étape) d'une tentative passée
  réaffiché tel quel. Fix : reset complet au focus (`useFocusEffect`,
  `OnboardingScreen.tsx`).
- Quota invité affiché avant même 1 vrai morceau détecté (bug originel de
  cette session) -> compteur basé sur les TENTATIVES, pas les succès réels.
  Fix : quota MARKETING séparé (`successCount`, `useUserStore.ts`), quota
  ANTI-ABUS backend relevé à 20 (migration 0020). Detail complet dans
  `KEEP_DECISIONS.md`.
- Emails de code confirmés **délivrés** par Brevo (vérifié via leur API de
  logs réels) -- si invisibles côté utilisateur, cause probable = dossier
  spam (domaine expéditeur jeune), pas un bug côté KEEP.
- Environnement : 1 seul repo (vérifié disque entier), 1 seul backend/1 seul
  Metro (PID uniques confirmés), 2 tunnels cloudflared morts tués (pointaient
  vers un port sans rien dessus). 2 tunnels redondants mais fonctionnels
  laissés en place (risque de casser le lien qu'Adel utilise déjà).

**Trouvé mais PAS corrigé cette session (gaps réels, honnêtes)** :
- `useSessionHistoryStore.ts` (regroupement des sessions passées en
  "albums") reste 100% local (AsyncStorage), aucune synchro serveur --
  survit à un redémarrage d'app mais PAS à un changement d'appareil ni à un
  vidage de stockage navigateur.

**CORRECTIF au point ci-dessus (24/08/2026, plus tard la même session)** :
la phrase "les KEEP individuels, eux, sont bien poussés au serveur" ci-dessus
était **FAUSSE** -- jamais vérifiée par un test réel, juste supposée parce
que la route backend et la LECTURE (`hydrateFromServer`) existaient déjà.
Recherche directe du code (`grep` sur tout `packages/mobile/src` pour un
appelant de `POST /api/social/me/keeps`) : AUCUN appelant n'existait.
GARDER un morceau écrivait UNIQUEMENT en local (AsyncStorage), jamais côté
serveur -- explique plusieurs symptômes réels signalés par Adel (profil
visité n'affichait jamais de vrais morceaux découverts, aucune ligne
serveur à activer pour un toggle partage/masquage). Corrigé :
`pushKeepDecision()` (`profileApi.ts`) appelé depuis
`useSessionStore.keepTrack()`. Preuve : tsc clean + e2e-smoke-test.ts 5/5 PASS
(pas encore un vrai KEEP via micro réel + relecture serveur confirmée --
prochaine vérification recommandée).
- Aucun écran/paramètre "Notifications" n'existe (vérifié par recherche
  complète du code) -- à construire de zéro si demandé.
- Grant Super Admin (Premium/Creator Pro/Venue Pro, durée ou illimité)
  EXISTAIT DÉJÀ (`packages/admin/pages/users.tsx`, trouvé par audit, pas
  reconstruit) -- ajouté seulement l'aperçu du badge/certification obtenu.
  Écriture réelle (`POST /api/admin/grant`) jamais testée en live -- aucun
  compte `admin_users` réel n'existe encore (même blocage que tout le reste
  de la session Super Admin, voir `KEEP_REGRESSION_TESTS.md` ADMIN_GRANT).
- Refonte visuelle complète (inspiration Instagram/Spotify, alignement,
  boutons uniformes) demandée mais PAS commencée cette session -- scope
  trop large pour être fait correctement en plus du reste, à traiter comme
  chantier dédié séparé.

## PHASE 0 — Réconciliation / Audit

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| Reconnaissance iPhone → titre affiché | PASS E2E | Testé en vrai avec April Showers, confirmé par Adel | — |
| Doublons vérifiés (profiles/tracks/resolver/plans/etc.) | PASS E2E | Audit direct du code + schéma, aucun doublon trouvé | — |

### Audit régression 24/08/2026 (suite au signalement "auth wall revenu + musiques disparues")

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| Guest recognition (auth wall revenu) | PASS E2E | Cause exacte trouvée par `git diff HEAD -- packages/mobile/src/store/useSessionStore.ts` : le guard AUTH_TOKEN vérifiait `musicEngine.isRealRecognition && !isDemoMode`, alors que la capture réelle quelques lignes plus bas ne vérifie QUE `isRealRecognition` — un flag `isDemoMode` resté bloqué à `true` en storage persisté (Zustand+AsyncStorage, pas un cache navigateur) faisait donc échouer silencieusement l'établissement de session tout en laissant la capture réelle démarrer. Corrigé en retirant la condition redondante. tsc --noEmit propre, bundle web recompilé sans erreur (826 modules) | — |
| Quota guest 3 essais | PASS E2E | curl avec identité anonyme fraîche : essais 1-3 passent le contrôle de quota (échouent sur audio factice, pas sur le quota), essai 4 bloqué `guest_limit_reached` avec message exact référençant la vraie valeur `remote_config` (3) | — |
| Quota total 6 après inscription | PASS E2E (calcul) | `remote_config` réel : guest_recognition_limit=3, signup_bonus_recognitions=3. Code (`recognition.ts:107-131`) : compteur clé UNIQUEMENT par `req.keepUserId` (même uid avant/après conversion Supabase), `keepIsAnonymous` relu en direct depuis le JWT à chaque requête (`is_anonymous`) — donc les 3 déjà consommés en invité restent comptés, seuil passe à 6, jamais 3+6=9 | Pas rejoué en live avec un VRAI cycle email+code (déclencherait un envoi Brevo réel) — preuve par le compteur live + lecture de code, pas par un cycle complet |
| KEEP → Supabase (écriture) | PASS E2E | curl `POST /api/social/me/keeps` avec identité anonyme fraîche → ligne réelle créée (`keep_decisions` + `tracks`) | — |
| KEEP → Profil (lecture fraîche) | PASS E2E | curl `GET /api/social/me/keeps` juste après → même ligne relue immédiatement, visibility PUBLIC par défaut | — |
| Profil albums/playlists "disparus" | PAS UNE RÉGRESSION | `usePlaylistStore.ts` (non modifié aujourd'hui, absent du diff) force volontairement une liste vide tant qu'aucun service musical n'est connecté (garde anti-fausses-données ajoutée AVANT ce segment). "Albums" (`MyMusicScreen.tsx`) sont calculés depuis `useSessionHistoryStore`, persisté en AsyncStorage LOCAL (par navigateur/appareil, pas par compte) — un nouvel onglet privé ou un appareil différent a un historique local vide par construction. `/me/keeps` (le nouveau stockage Supabase) n'est encore consommé par AUCUN écran mobile — confirmé par recherche globale | Pas un bug de code — comportement honnête attendu pour une identité de test fraîche |
| Jaquettes (artwork) | PAS UNE RÉGRESSION | `TrackRow.tsx` affiche `track.artworkUrl` correctement (conditionnel, pas de casse). Absence d'artwork = soit aucun morceau à afficher (même cause que la ligne ci-dessus), soit AcoustID (gratuit) ne renvoie pas toujours de pochette — limitation connue du provider, pas un rendu cassé | — |
| "Reconnaissance momentanément indisponible" (signalé en direct pendant cet audit) | BLOCKED EXTERNAL | Cause réelle capturée en direct via logs backend sur 2 tentatives : AcoustID répond proprement `no_match` (chaîne fonctionne), puis AudD échoue avec erreur 902 "authorization failed: the limit was reached" — quota gratuit AudD (300 requêtes à vie, `docs/MUSIC_RECOGNITION_PROVIDERS.md`) épuisé, compte externe, aucun rapport avec le code. Nouveau token fourni par Adel enregistré dans `packages/mobile/.env` (jamais affiché) + mobile redémarré (bundle propre, 832 modules) — mais ce nouveau token échoue à son tour avec erreur 900 "the provided api_token is incorrect, invalid, or inactive... needs to have either a trial or an active subscription", vérifié indépendamment par un appel direct à api.audd.io (même erreur, donc pas une erreur de saisie côté KEEP) | Compte AudD (nouveau) sans trial/abonnement actif — action requise sur dashboard.audd.io, hors du code |
| "Le lien de création de compte dirige pas au bon endroit" / "je dois me déconnecter pour me connecter" (signalé en direct) | **PASS E2E (corrigé + testé au navigateur)** | Cause réelle trouvée par lecture directe : `App.tsx:60` (`user ? <Navigation/> : <OnboardingScreen/>`) ne distingue jamais invité (session anonyme) de vrai compte -- `isAnonymous` n'était lu NULLE PART côté client. Corrigé : `isAnonymous` tracé de bout en bout (`authService.ts` → `useUserStore.syncFromAuthSession` → `ProfileScreen`), nouvelle route dédiée `CreateAccount` (`Navigation.tsx`, présentation modale) ouvrant `OnboardingScreen` directement à l'étape e-mail -- déclenchée depuis `HomeScreen` (bandeau quota atteint) ET `ProfileScreen` (bannière invité), un seul point d'implémentation. Bouton logout relabellisé "Quitter (invité)". **Testé réellement au navigateur (Browser tool)** : session invité fraîche créée → bannière "Créer mon compte gratuit" visible → tap → titre d'onglet passe à "CreateAccount" → contenu confirmé = étape e-mail directe (✕ / "Créer mon profil KEEP" / champ e-mail), plus aucun passage par l'écran Profil complet | — |
| Guest→Compte utilisait la MAUVAISE méthode Supabase (risque de perte de données, trouvé en auditant le point ci-dessus) | **PASS E2E (corrigé)** | `authService.ts` utilisait `signInWithOtp`+`verifyOtp(type:'email')` même pour un invité déjà connecté -- vérifié contre la doc officielle Supabase ("Converting an anonymous user to a permanent one") : ce flux est prévu pour CRÉER un nouvel utilisateur, risque réel de créer une identité séparée et d'abandonner les KEEP de l'invité. Corrigé : nouvelles méthodes `requestEmailLink`/`verifyEmailLink` (`updateUser({email})` + `verifyOtp(type:'email_change')`, méthode officielle qui préserve `auth.uid()`), déclenchées automatiquement quand `getCurrentSession().isAnonymous` est vrai au moment d'envoyer le code | — |
| Hook d'envoi d'e-mail cassé pour la conversion invité (trouvé EN TESTANT le point ci-dessus) | **PASS E2E (corrigé, preuve par rejeu de payload réel)** | `authEmailHook.ts` lisait `payload.user.email` (vide pour un invité anonyme) au lieu de `payload.user.new_email` pour `email_action_type='email_change'` -- Supabase renvoyait 500 "Invalid payload sent to hook" au client, testé et confirmé par appel direct à `PUT /auth/v1/user`. Payload réel capturé dans les logs (2 occurrences, avant fix) : `{"user":{"email":"","new_email":"keep-audit-verification-test@example.com","is_anonymous":true},"email_data":{"email_action_type":"email_change",...}}`. Corrigé (branche sur `email_action_type`). Preuve : rejeu du payload réel capturé contre la logique corrigée → email+code résolus correctement. Envoi Brevo réel non re-confirmé de bout en bout (rate-limit Supabase atteint pendant les tests répétés de cet audit -- attendre quelques minutes puis retester un vrai cycle) | Confirmer un envoi réel une fois le rate-limit Supabase retombé |
| Prix Super Admin annoncés "configurables" mais ne le sont pas réellement | **FAIL, trouvé en auditant sur demande d'Adel** | `packages/admin/pages/plans.tsx` : page 100% Mode Démo, `handleSave()` ne fait qu'un `setState` local, AUCUNE écriture backend (le commentaire du fichier l'admettait déjà : "MODE DÉMO — modification en mémoire uniquement"). Valeurs par défaut affichées étaient en plus périmées (4,99/9,99/29 € au lieu de 2,99/9,99/29,99 €) -- corrigées. La vraie route backend (`PATCH /admin/plans` → `plan_prices`) reste à construire -- pas fait dans cette passe (hors périmètre des 2 problèmes signalés, noté pour la suite) | Construire la route backend réelle + brancher ce formulaire dessus |
| Copie "Crée ton profil gratuit... (c'est gratuit)... répète trop" (signalé en direct) | PASS | Texte simplifié (FR+EN) -- retrait de la redondance "gratuit...gratuit" et de la phrase à rallonge, puis remplacé par le slogan final choisi par Adel (voir ligne ci-dessous) | — |
| `isDemoMode` resté bloqué à `true` chez Adel malgré le fix précédent -- bannière "Créer mon compte" invisible pour LUI spécifiquement | **PASS E2E (corrigé, prouvé en direct)** | Trouvé en lisant le diagnostic client réel envoyé par son appareil : `"guestUserId":"demo-user-1","isDemoMode":true` alors que le backend traite déjà une vraie session anonyme (`GUEST=2d05734c-...`) -- `useUserStore.syncFromAuthSession` avait `if (s.isDemoMode) return s;` AVANT MÊME de vérifier si une vraie session existe, donc un flag `isDemoMode` périmé (test antérieur) bloquait indéfiniment toute synchronisation avec la vraie session, y compris `isAnonymous` (jamais mis à jour, restait à sa valeur par défaut `false`) -- la bannière ne pouvait donc jamais s'afficher pour lui. Corrigé : la garde ne protège plus que contre un `session=null` transitoire (`if (s.isDemoMode && !session) return s;`), une vraie session active gagne toujours. **Prouvé en direct au navigateur** : `isDemoMode:true`+`DEMO_USER` forcés dans le storage (reproduit exactement son état), page rechargée, la vraie session Supabase existante s'est resynchronisée automatiquement -- `isDemoMode` repassé à `false`, vrai uid invité repris, `isAnonymous:true` correct, bannière "Créer mon compte gratuit" confirmée visible sur Profil avec la vraie identité (`invité-5de940`), bouton relabellisé "Quitter (invité)" | — |
| Message d'incitation incohérent : "Ça marche !" affiché EN MÊME TEMPS que "0 morceaux détectés / KEEP écoute" | **PASS E2E (corrigé)** | Les deux blocs étaient rendus indépendamment (bannière quota + texte d'attente), corrects individuellement mais contradictoires ensemble une fois la limite atteinte (KEEP n'écoute plus vraiment à ce stade). Corrigé : le texte d'attente ne s'affiche plus quand `guestLimitReached`/`freeLimitReached` est vrai. Nouveau slogan appliqué (FR+EN) : "Ta musique mérite son profil." / "Rassemble tes découvertes, partage tes goûts et crée ta communauté musicale." Nouveau cas distinct ajouté : `freeLimitReached` (compte déjà inscrit, quota Free épuisé) -- message Premium séparé, jamais "Créer mon profil" à un compte déjà inscrit (confirmé par lecture de code : `free_tier_limit_reached` ne déclenche jamais `guestLimitReached`, regex stricte) | — |
| AudD toujours bloqué (reconnaissance = 0 morceaux) -- revérifié à la demande d'Adel | **BLOCKED EXTERNAL (confirmé, inchangé)** | Retest complet avec un vrai fichier audio capturé sur son appareil (pas factice) : appel DIRECT à api.audd.io → HTTP 200, `error_code:900` (compte sans trial/abonnement actif) -- identique aux tests précédents, reproductible. AcoustID (même fichier, direct + via route KEEP) → `status:"ok"`, aucun match, API saine. Confirmé par code (`RecognitionRouter.recognize()`) qu'un provider en erreur (y compris quota épuisé) n'empêche JAMAIS le suivant d'être tenté -- AudD est bien appelé indépendamment du quota KEEP/AcoustID, aucune interception par les changements récents Free/Premium/quotas/auth | Compte AudD toujours sans trial/abonnement actif -- action sur dashboard.audd.io |

## PHASE 1 — Quota 3 → compte → 3 → paywall

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| Guest 3 essais puis blocage | PASS E2E | curl : 3 passent, 4e bloque avec message | — |
| Seuil unifié 6 (3 guest + 3 compte) | PASS E2E | curl : compteur unique par user id, seuil change selon anonyme/inscrit | — |
| **Guest→Compte : KEEP écrit réellement dans Supabase dès le 1er tap (pas de transfert nécessaire)** | PASS E2E | curl : 2 tracks KEPT en invité, relus fraîchement avec le même id -- même auth.uid() traverse invité→compte par design Supabase Auth, rien à migrer | — |
| Refresh ne réinitialise rien | PASS E2E | Prouvé par le test ci-dessus (2e appel = nouvelle requête HTTP, données identiques) | — |
| Logout/login ne réinitialise rien | TODO | Nécessite un vrai cycle démarrage app → email → code → vérif des mêmes KEEP | — |
| Nouvelle session Guest ne contourne pas trivialement le quota | PARTIAL | Compteur serveur (pas contournable en rechargeant), mais un VRAI nouvel onglet privé = nouvel `auth.uid()` = nouveau quota (limite connue, voir note ci-dessous) | Limitation structurelle Supabase Auth anonyme, pas un bug |
| 3/6 configurables depuis Super Admin (pas hardcodé) | PASS E2E | `remote_config` (migrations 0012/0013) lu en vrai par `recognition.ts` via `getNumericConfig()`, valeurs vérifiées lisibles en direct par curl | — |

## PHASE 2 — Brevo / Email KEEP réel

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| Diagnostic "pourquoi Supabase Auth apparaît encore" | PASS E2E | Cause identifiée avec certitude : Supabase envoie ses emails directement (SMTP par défaut), rien ne redirigeait l'envoi vers Brevo | — |
| Architecture Send Email Hook (Supabase Auth → webhook KEEP → Brevo) | PASS E2E | Hook configuré via Management API (`hook_send_email_enabled=true`), vérifié actif | — |
| Vérification de signature webhook (Standard Webhooks/Svix) | PASS E2E | Test réel : Supabase a appelé le hook, signature acceptée, payload lu correctement (email + code extraits) | — |
| Template email KEEP brandé (code, pas de lien) | PASS E2E | `confirmationCodeEmail()`, code en évidence, aucune mention Supabase dans le contenu | — |
| Envoi réel via Brevo | PASS E2E | IP autorisée par Adel -- pipeline complet retesté : Supabase → hook → signature → Brevo → `email envoyé via Brevo` en log, `messageId` réel reçu | — |
| Expéditeur affiché "KEEP" | PASS E2E | `sender.name` fixé à "KEEP" dans le code, adresse sous-jacente = seul expéditeur vérifié sur ce compte Brevo | Provisoire -- migrer vers un vrai domaine KEEP dédié plus tard |
| Email réellement reçu ET validé par Adel | PARTIAL | Envoi confirmé côté serveur (2 fois) ; 2e tentative de renvoi bloquée par le rate-limit propre de Supabase (429, pas un bug) avant d absolument confirmer la version corrigée par Adel | En attente : Adel confirme réception + code fonctionnel |
| Onboarding : refonte UX complète 3 écrans (entrée/email/code) | PASS E2E | Écran d'entrée vérifié par inspection directe du DOM rendu (texte exact conforme), écrans email/code type-checkés mais pas cliqués interactivement par l'outil (friction technique) | Vérification visuelle finale par Adel demandée |
| Bug réel corrigé : session invité auto-silencieuse empêchait l'écran d'entrée de s'afficher | PASS E2E | Suppression de l'appel automatique dans App.tsx, testé : écran d'entrée reste affiché | — |
| Bug réel corrigé : "Essayer sans compte" appelait Mode Démo au lieu d'une vraie session invité | PASS E2E | Corrigé, appelle maintenant `ensureGuestSession()` réel | — |
| Aucune erreur technique brute affichée | PASS E2E | `translateAuthError()` ajouté, traduit rate-limit/code invalide en français, ne montre plus jamais le texte anglais Supabase | — |

## PHASE 2 — Brevo

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| Clé API sauvegardée | PASS E2E | Présente dans .env, jamais affichée | — |
| Templates email brandés (invite/magic-link/notification) | PASS E2E | Rendu réel envoyé à Adel en aperçu | — |
| Appel réel Brevo | BLOCKED EXTERNAL | Testé : `unauthorized`, IP non whitelistée | Action Adel : voir section dédiée du rapport |
| Signup → email → validation → profil créé | TODO | — | dépend de l'IP whitelist |

## PHASE 3 — Super Admin Monétisation

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| Schéma plans/prix/entitlements/quotas | PASS E2E | Tables réelles vérifiées en base (`plans`,`plan_prices`,`plan_entitlements`,`usage_limits`) | — |
| Prix réels en base (revision 2,99/9,99/29,99€) | **PASS E2E (24/08/2026)** | Migration 0018 appliquée -- ancienne grille (4,99/29€) était encore stockée malgré la doc déjà corrigée, trouvé en auditant sur demande explicite avant de construire le vrai système d'abonnement | — |
| Backend `admin.ts` (plans/prix/quotas/entitlements/users) | **PASS E2E (corrigé 24/08/2026)** | Routes déjà écrites mais 100% gated par `service_role` (même placeholder cassé, cause déjà trouvée pour la page Utilisateurs). Réécrites en RLS+`is_admin()` (migration 0019, même pattern que `subscriptions_admin_write` de 0014) -- vérifié par lecture réelle (`GET /api/billing/plans`) | Écriture (PATCH) non testée en live -- aucun admin réel n'existe (voir ligne ADMIN_GRANT ci-dessous) |
| `POST /api/admin/grant` (offrir un plan sans paiement) | **PASS E2E (backend), BLOCKED EXTERNAL (E2E complet)** | Nouvelle route, réutilise `subscriptions`/`source=admin_grant` tel quel (migration 0014), jamais une deuxième logique parallèle | `admin_users` est VIDE (0 ligne, vérifié par requête directe) -- personne ne peut être admin tant qu'aucun compte réel n'existe et n'est promu manuellement. Bloqué par le même rate-limit Supabase empêchant tout nouveau compte réel depuis le début de cet audit |
| Page Super Admin Plans (frontend `plans.tsx`) branchée sur ces tables | **PASS (données), PARTIAL (bannière)** | `plans.tsx` réécrit avec `useLiveOrDemo`/`adminApi` (même pattern que `users.tsx`), édition prix+essai réelle (`PATCH /plan-prices/:id`, `PATCH /plans/:id`). **Vérifié en direct** : valeurs réelles (`2.99`/`9.99`/`29.99`) confirmées dans le DOM (`input.value`, pas juste le texte de page). Bug cosmétique PRÉ-EXISTANT trouvé en testant (affecte aussi `/costs`, non touché par cette passe) : la bannière `DataModeBanner` reste bloquée sur "⏳ Connexion…" au lieu de basculer proprement vers 🟢/🎭 -- les données/le repli honnête fonctionnent correctement malgré ça (confirmé), donc pas bloquant pour l'usage réel, mais visuellement trompeur | Root-cause précis non terminé (piste : Fast Refresh sur un fichier lib partagé + navigation testée peut ne pas re-déclencher l'effet comme un vrai rechargement) -- affecte `useLiveOrDemo.ts`, partagé par plusieurs pages |
| Offrir un plan gratuitement à un utilisateur depuis Utilisateurs (ex. "un ami DJ pendant 1 an") | **PASS (code), BLOCKED EXTERNAL (E2E)** | `users.tsx` étendu avec un bouton "🎁 Offrir un plan" par ligne (plan PREMIUM/CREATOR_PRO/VENUE_PRO + durée 1/3/6/12/24 mois/illimité + raison), appelle `POST /api/admin/grant` déjà construit et vérifié par lecture. Non testable en live tant qu'aucun `admin_users` réel n'existe (même blocage que ADMIN_GRANT) | Nécessite un premier compte admin réel |
| Écran mobile "Choisir mon offre" (`OffersScreen.tsx`) | **PASS (partiel, voir KEEP_REGRESSION_TESTS.md SUBSCRIPTION_UI)** | Données 100% réelles (prix/avantages/quotas depuis `/api/billing/plans`), Profil affiche le vrai plan actif + comparaison + CTA sandbox honnête ("Paiement bientôt disponible"). Tap-to-navigate non vérifié par clic automatisé (friction outillage déjà documentée), même mécanisme que CreateAccount déjà prouvé | À confirmer par un vrai tap humain |
| Section Monétisation complète (Payment Providers/Transactions) | TODO | — | — |
| Auth réelle du Super Admin lui-même | TODO | — | décision à prendre : email/mdp simple ou rôle Supabase |

## PHASE 4 — Profil musical persistant

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| Profil (bio/pseudo/ville/pays/visibilité) → Supabase | PASS E2E | curl round-trip réel (écrit puis relu) | — |
| Réseaux sociaux → Supabase (écriture + lecture propriétaire) | PASS E2E | curl round-trip réel | — |
| Réseaux sociaux → visibles par un AUTRE utilisateur sur un profil PUBLIC | **PASS E2E (bug réel trouvé + corrigé 24/08/2026)** | Le round-trip ci-dessus ne testait QUE le propriétaire -- jamais un 2e utilisateur. Bug réel trouvé (audit Nemotron, vérifié indépendamment par Claude sur la vraie migration SQL, jamais agi sans preuve -- voir `feedback` mémoire session) : policy `social_links_owner` (0006_rls.sql, `for all using (profile_id = auth.uid())`) bloquait TOUTE lecture pour un non-propriétaire, y compris `visibility='PUBLIC'` -- un visiteur d'un profil 100% public ne voyait jamais ses réseaux sociaux. Fix minimal : migration `0021_social_links_public_read.sql`, nouvelle policy SELECT-only (`visibility='PUBLIC'` ET profil parent `is_public`), appliquée en direct via l'API Management Supabase (`SUPABASE_MANAGEMENT_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF`, déjà en `.env`). Prouvé avec 2 vraies identités anonymes AVANT (5/7, échecs = exactement ce bug) et APRÈS (11/11, y compris rejet explicite INSERT/UPDATE/DELETE non-propriétaire) -- `packages/backend/scripts/rls-social-links-test.ts`, gardé comme test de régression permanent | — |
| Date de naissance/genre (privé) → Supabase | PASS E2E | curl round-trip réel | — |
| Vérification visuelle par Adel sur l'app réelle | TODO | — | — |
| Boutons redirection réseaux sociaux (profil visiteur) | PARTIAL | Codé + compile, pas vérifié visuellement | — |
| Géolocalisation auto ville/pays | PARTIAL | Codé + compile, pas vérifié visuellement | — |
| Sections Playlists/Albums/Artistes/Récemment écoutés/Top titres | PARTIAL | UI existe (ProfileScreen/MyMusicScreen), source de données mixte (locale + Spotify live) | — |
| Visibilité PUBLIC/FOLLOWERS/PRIVATE par élément + bouton Masquer | TODO | Schéma actuel : is_public au niveau profil entier, pas par élément | — |

## PHASE 5 — Connexions/import providers

| Provider | AUTH | IMPORT PLAYLISTS | IMPORT TRACKS | RECENTLY PLAYED | TOP TRACKS | OPEN EXTERNAL | SYNC | MISSING |
|---|---|---|---|---|---|---|---|---|
| Spotify | Codé, jamais exécuté E2E | Codé, jamais exécuté | Codé, jamais exécuté | Codé (store dédié), jamais vérifié en vrai | Codé, jamais exécuté | PASS (lien réel) | Codé, jamais exécuté | `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` placeholder |
| Apple Music | Codé (JWT signé, prouvé crypto), jamais testé avec vrai compte | Codé, jamais exécuté | Codé, jamais exécuté | Codé si dispo, jamais vérifié | — | PASS (lien réel) | Codé, jamais exécuté | Compte Apple Developer payant |
| YouTube | Recherche seule | NOT IMPLEMENTED | NOT IMPLEMENTED | — | — | PASS (lien réel) | NOT IMPLEMENTED | Clé API Google absente |

## PHASE 6 — KEEP THIS TRACK + provenance

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| Bouton ♡ KEEP sur profil d'un autre utilisateur | TODO | — | — |
| Table provenance (source_user_id/recipient_user_id/track_id/timestamp) | TODO | Confirmé absent du schéma actuel (`keep_decisions` n'a pas ces colonnes) | — |
| Affichage "Découvert via @adel" | TODO | — | dépend de la ligne au-dessus |
| Résolution destination pour le destinataire (UniversalTrackResolver) | PASS E2E (le moteur), PARTIAL (branché à ce flux) | Resolver testé (12 tests jest), pas encore appelé depuis KEEP THIS TRACK | — |

## PHASE 7 — Follow + notifications

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| Follow/Unfollow | PASS E2E | Testé avec vraies sessions invité plus tôt cette session | — |
| Table/système notifications | TODO | Confirmé absent (aucune table, aucun code) | — |
| Préférences ON/OFF par catégorie/canal | TODO | — | — |
| Écran Profil → Notifications | TODO | — | — |

## PHASE 8 — Deux utilisateurs distants

| Fonction | Statut | Preuve E2E | Blocage |
|---|---|---|---|
| URL stable partageable hors-WiFi | PASS E2E | Tunnel ngrok stable vérifié fonctionnel | Dépend d'un hébergement réel (Render) à terme |
| Test complet A/B deux téléphones | TODO | — | dépend des phases 1, 4, 6, 7 |

## PHASE 9 — Paiement sandbox
Tout `TODO` — explicitement en dernier, dépend de BillingProvider (Phase 3) et du reste du funnel.

## PHASE 10 — Animation premium
`TODO` — actuel = `SessionPulse`, simple, pas la version 3D "voix/ondes" demandée. Explicitement après tout le reste.

## PHASE 11 — Creator/DJ/Artist/Event
`TODO` en grande partie, mais `ArtistClaim.ts` et `ReleaseRequestEngine.ts` (`packages/music/src`) existent déjà comme fondations réutilisables (interfaces conçues, non branchées). Tables `events`/`event_rsvps` existent déjà en base (migration 0004), inutilisées par aucune route.

---

## Roadmap — idées non priorisées (capturées, pas développées avant leur tour)

- **Paywall de visibilité sur le profil** (24/08/2026) : quand un utilisateur importe sa musique YouTube/Spotify/etc., masquer/limiter ce qu'un visiteur gratuit peut voir de sa bibliothèque -- payer pour la visibilité complète (import) ou pour consulter (visiteur) reste à trancher. Micro-paiements visés, pas de gros montants -- "on est une plateforme de tri, pas un service de streaming". Confirme explicitement : PAS de commentaires, PAS de réseau social généraliste -- KEEP reste spécialiste musique (profil = sons partagés + like + follow + amis d'amis), jamais un concurrent d'Instagram.

## Notes permanentes

- **Ne jamais** marquer PASS E2E sur la seule base d'un typecheck.
- **Ne jamais** dupliquer profiles/follows/tracks/UniversalTrackResolver/plans/subscriptions — vérifiés existants, à réutiliser.
- Moteur de reconnaissance (audfprint + AcoustID + AudD fallback) : NE PAS TOUCHER sauf bug démontré.
- Nouvelles idées reçues en cours de route → ajoutées ici, jamais développées hors de l'ordre de priorité en cours sauf demande explicite contraire.
