# MASTER PLAN — Loki Music (ce qui RESTE à faire)

> Complète `STATE.md` (ce qui est fait). **Règle de travail : plan écrit → validation d'Adel → code.** Une étape à la fois. Aucune IA ne touche `main`, ni au design validé sans accord. Chaque étape finit par : tests + 7 gardes + preuve mobile 390 / ordinateur 1440 + ligne dans `STATE.md`. Audit **ciblé** (seulement le module touché).
> Statuts : ✅ fait · 🟡 partiel · ⛔ pas fait · ❓ cause non établie. Tout ce qui n'est pas vérifié sur iPhone est marqué « non vérifié iPhone ».

## Les 5 missions de gouvernance — état réel au 06/10/2026

### Plan validé par Adel — IDEA-189 (06/10/2026)
1. Conserver et vérifier les gardes Stories/Navigation déjà corrigés sur la revue basée sur `0138b4e5`.
2. Étendre `/home/runner/work/KEEP/KEEP/packages/admin/pages/operations.tsx` : version.json canonique, dernière app signalée (pas parc installé), compteurs explicitement bornés ou RPC exact, rapport de preuves lecture seule.
3. Réutiliser `fixed_in_sha` et `/home/runner/work/KEEP/KEEP/docs/ERROR_LEDGER.md` ; distinguer statut corrigé, correctif documenté et livraison prouvée. Migration additive seulement si nécessaire, non appliquée.
4. Agent spécialisé CI : actionlint épinglé avec intégrité, synthèse GitHub par SHA/date/liens et success/skipped/failure distincts ; aucun contrôle global masqué.
5. Tests locaux réels admin, navigateur 390/1440 avec fixtures si nécessaire, contrats existants, actionlint et scan secrets ; journal et mémoire existants, libération du verrou. Tout reste LOCAL_ONLY sans déploiement.

État au 07/10/2026 : implémentation locale réalisée, tests admin/mobile/SQL/Chromium fixtures réussis, règle documentée dans contrat/spec existants. Reste volontairement hors autorisation : commit/push, CI distante des nouveaux fichiers, application de migration et livraison. Actionlint global hérité non vert, version publique inaccessible DNS. Les anciens correctifs sans SHA/test restent à documenter ; aucune attribution automatique ni effacement.

### Mission 1 — Secousse → signalement → réparation → robot
| Élément | Statut | Détail |
|---|---|---|
| Écran exact, appareil, version, build | ✅ | `problemReportService.ts` (non vérifié iPhone) |
| Logs récents | 🟡 | fil des 25 dernières actions/écrans (`reportLoop.ts`) ; pas de logs système |
| **Capture d'écran automatique** | ⛔ | demande `react-native-view-shot` = module natif = **build iOS** |
| Champ de description | ✅ | `ProblemReportHost.tsx` |
| Robot « Reçu, localisé » puis « réparé / mets à jour » | ✅ | `robotSay('REPORT_UPDATE')`, RPC `keep_my_report_updates` ; non vérifié iPhone |
| Agent qui consulte et répare | 🟡 | routine `trig_01CHASzNZx7Yx35UZMmErk8e` (toutes les 6 h) **sans connecteur Supabase ni dépôt** → Adel doit les ajouter dans claude.ai > Routines |
| Délai de réparation borné | ⛔ | à définir : proposition = accusé < 1 min, tri < 6 h, correctif JS < 24 h |
**Plan (à valider)** : (a) Adel ajoute connecteur + dépôt à la routine ; (b) test à blanc avec un faux signalement ; (c) build iOS unique qui regroupe view-shot + sons de notification (évite 2 builds).

### Mission 2 — Modération et sécurité
| Élément | Statut | Détail |
|---|---|---|
| Insultes bloquées (signalements) | ✅ | `isAbusiveReport` ; message non stocké, ligne « signalé » |
| Insultes dans le **chat / commentaires** | ⛔ | à vérifier module par module (audit ciblé) |
| Blocage d'un utilisateur signalé | 🟡 | `user_blocks` (utilisateur→utilisateur) existe ; **aucun bannissement de compte** |
| **Bannissement par adresse IP** | ⛔ | l'IP n'est pas visible côté application : il faut une fonction serveur qui la lit, une table de bannissement, un contrôle à la connexion |
| Blocage dans le Super Admin | ⛔ | liste des signalements + bouton bloquer / lever |
**Réserve à trancher avec Adel avant de coder** : une IP peut être partagée (wifi, 4G, famille) → risque de bloquer des innocents ; proposition : bannissement **compte + appareil** d'abord, **IP temporaire (24 h – 7 j)** ensuite, toujours levable depuis le Super Admin, jamais automatique.

### Mission 3 — Visiteur non inscrit (lien partagé)
| Élément | Statut | Détail |
|---|---|---|
| Robot d'invitation avec le nom de l'invitant | ✅ | `VisitorInviteRobot` (non vérifié iPhone) |
| Voir la story, swiper, écouter sans compte | ❓ | à auditer en conditions réelles de visiteur : les stories sont limitées aux « comptes réels avec e-mail vérifié » côté lecture ; vérifier ce qu'un visiteur voit vraiment |
| « Je trie ta musique dans tes plateformes » | ⛔ | message prêt, fonction de rangement par plateforme non liée |
**Plan** : audit ciblé du parcours visiteur (RLS + écrans) → liste de ce qui est ouvert/fermé → proposition d'« avant-goût » (X morceaux écoutables puis invitation).

### Mission 4 — Profil musical et recommandations
| Élément | Statut | Détail |
|---|---|---|
| Profil de goût (GARDER, ❤, 😐, 👎, partages) | ✅ | `keep_my_taste_profile` |
| Recommandations de musiques en tête de Loki Pulse | ✅ | `keep_recommend_for_me` |
| Compléter le style (questionnaire + signaux) | ✅ | questionnaire obligatoire à l'inscription (`TasteOnboardingGate`, 06/10) : genre + styles pré-cochés ; langue/pays détectés |
| **Utilisateurs au même style** | ⛔ | RPC de proximité de goût + affichage |
| Partage payant dans Loki Pulse (IDEA-130) | ⛔ | règles à valider (voir ci-dessous) |

### Mission 5 — Bugs critiques de l'audit du 06/10
| Bug | Statut | Reste |
|---|---|---|
| Son iPhone `PREVIEW_PLAY_FAILED` | ❓ | cause non reproduite ; diagnostic enrichi (`err=`) en place → attendre le prochain échec, corriger sur preuve. Investiguer aussi « son tardif dans la story » (IDEA-133) |
| Achats Apple (`appAppleId`) | 🟡 | source corrigée dans `keep-iap-verify` et `keep-apple-notifications` ; **non déployée** (accord d'Adel). RIB Apple pas encore saisi → on reste en TestFlight |
| `keep_event_playlist` | ✅ | créée en base, appel testé |
| QR ordinateur | ⛔ | 185 demandes / 0 approbation : tracer scan → approbation → connexion sur un vrai iPhone |
| Push APNs / sans appareil | 🟡 | audit fait. Causes : permission iOS refusée (20 refus), 1 seul token, Android sans FCM, FREE_CREDITED en « in-app seulement », sons = build natif |
| Super Admin « payants actifs » | ⛔ | exclure formules offertes et transactions Sandbox |
| E-mails | ❓ | test du 06/10 00:48 non reçu ; vérifier clés Brevo, file `email_queue`, webhook ; journaux d'envoi illisibles depuis cette session → à demander à Adel (capture du tableau Brevo) ou accès aux logs |
| Défi « Réagir à 20 » | ✅ | corrigé |

## Nouveaux points du 06/10/2026 (soir)
- **PASSER dans une session** : retire désormais la musique de la liste (récupérable dans « RETIRÉS ») — ✅ code, non vérifié iPhone. *Révise la règle du 02/10 : à confirmer par Adel.*
- **Étape B2 — mise en story d'une musique en vente / achetée (décision requise)** : aujourd'hui refusée (protection du vendeur). Proposition : l'autoriser **masquée** (carte « Musique en vente · de @vendeur », titre caché, lien vers la boutique) = publicité gratuite pour le vendeur, sans fuite du titre. Demande une règle serveur (`keep_pin_shared_story_track`) + l'affichage « de @vendeur » dans les stories d'autrui. Anti-doublon : annoncer « elle est déjà en story » aussi pour les musiques d'une collection achetée.
- ✅ **Mise en story gratuite sans GARDER (musique sans propriétaire)** : livrée le 06/10 (RPC `keep_pin_free_story_track`). Reste B2 (musique EN VENTE en story masquée).
- **Performance du profil** : 111 → 94 requêtes ; reste à unifier `keep_decisions` ×7, `playlists` ×4, `follows` ×5, `notifications` ×3.
- **IDEA-144 — musique libre sans propriétaire** (partie « prends-la vite » : badge fait ; message de l'agent à écrire) : marquer « Gratuit · non certifié » et faire dire à l'agent « prends-la vite, identifie-la sur ton profil, tu seras le premier » ; règle à cadrer (qui est « propriétaire » ? comment prouver la découverte ?).

## Nouveaux chantiers du 06/10/2026 (nuit) — à valider avant code
- **Catalogue « toujours trouver » + plateformes** : voir `docs/CATALOGUE_ET_PLATEFORMES.md` (faisabilité, plateforme par plateforme). Étape F proposée : recherche en cascade + catalogue qui grandit seul + « Ajouter par lien » + « Demander ce titre » ; likes YouTube / Spotify / Deezer / Apple remontés ; TikTok / Instagram = Partager → Loki seulement.
- **Latence du Swipe** : instrumentée (`SWIPE_SLOW` envoyé au journal si le son met > 2,5 s) ; correction sur preuve réelle ; pistes : préchargement de 2 titres d'avance, extraits résolus et gardés côté serveur par ISRC.
- **Super Admin budget / frais / jalon 15 000 abonnés** : `costs.tsx` + `operating_costs` existent mais vides ; plan en 4 points dans le doc ci-dessus.

## Règles de design à intégrer (accord d'Adel déjà donné — implémentation après validation du plan)
- IDEA-131 : pastilles ❤ 😐 👎 de ma story **alignées à droite sur le bord (comme ☰ / ✕)**, même taille, mêmes espaces.
- IDEA-132 : boutons fréquents toujours au-dessus ; « ÉCOUTER SUR APPLE MUSIC » descend sous PASSER / ARRÊTER / GARDER.
- IDEA-128/135 : menu ☰ sans redirection inutile ; QR PayPal : recadrer la photo **existante**.
- Parité : le design ordinateur est jugé parfait ; l'écart vient de TestFlight (version 407 / SHA `dcc4899` : attendre le build du SHA courant).

## Chantier produit à cadrer (IDEA-130 — Partage dans Loki Pulse)
Questions à valider avant toute ligne de code : prix en FREE par partage ; quota par jour pour non-certifié / certifié ; « 5-10 % de visibilité » = part maximale d'un même utilisateur dans le fil ; reversement « 3 FREE » = à qui, quand, pour quel achat ; statistiques affichées (gemmes) ; écriture dans les offres et `docs/PRICING_STRATEGY.md`.

## Cahier de tests (système anti-oubli) — à produire après validation
Une checklist unique `docs/TEST_PLAN.md` : parcours utilisateur (inscription → écoute → GARDER → story → réaction → partage), parcours visiteur, parcours Super Admin (signalements, blocage, prix, statistiques), parcours AQUA du paiement, notifications app fermée (iPhone, Samsung), QR ordinateur. Chaque ligne : mobile 390 / ordinateur 1440 / TestFlight, preuve, date. Jamais « validé » sans preuve.

## Ordre proposé (une étape = une validation)
1. **Étape A — sans risque** : Adel ajoute connecteur + dépôt à la routine ; je déploie les 2 fonctions Apple (si « OK ») ; correction du Super Admin (payants actifs).
2. **Étape B — design validé** : alignement des pastilles + hiérarchie des boutons dans la story.
3. **Étape C — diagnostic** : parcours visiteur ; son tardif de la story ; QR ordinateur (trace réelle) ; e-mails.
4. **Étape D — build iOS unique** : capture d'écran de secousse + sons de notification (pièces, débit) + permission notifications guidée (« Ouvrir les réglages »).
5. **Étape E — sécurité** : bannissement compte/appareil/IP temporaire + écran Super Admin.
6. **Étape F — produit** : partage payant dans Loki Pulse, utilisateurs au même style, offres DJ + accès ordinateur.

## Plan ordonné du 06/10/2026 (relais navigateur) — à valider par Adel avant code (sauf P1, faite)
1. **P1 Écran Offres compact** — FAIT (ERR-OFFERS-COMPACT-198).
2. **Bugs prouvés avant soumission Apple** : (a) son iPhone `audioPreviewService.ensurePlaying()` n'attend que 90 ms puis exige `isPlaying` alors que le flux est en `isBuffering` → attendre le buffering (borné) ; (b) `STORY_PIN_FAILED` uuid `trk_…` (`MusicSwipeDeckModal.tsx`) → ne pas envoyer d'id non-UUID ; (c) « déjà vu » des stories côté serveur (`story_views`/`story_watch_sessions`) + audit des autres états locaux ; (d) e-mails : expéditeur Brevo à valider (Adel) ; (e) `music_recognition_attempts` vide depuis 14 jours ; (f) Super Admin : exclure `admin_grant` des « payants ».
3. **IDEA-168 Règle abonnement** (expiration → FREE, trace datée, relance, délai de grâce) + déploiement des 2 fonctions Apple.
4. **IDEA-167 Annonce « disponible »** (jamais avant approbation, activable Super Admin).
5. IDEA-161 (trouver le morceau), 162 (plateformes), 163 (traduction gratuite), 164 (robot d'aide), 165 (13+), 166 (retour profil).

### Ajout du 06/10/2026 (relais) — à valider par Adel avant code
- **J (IDEA-169)** vérification d'e-mail pour tous : réutiliser `AccountEmailPanel` / `keep-account-email` ; pop-up au démarrage (mobile + PC), envoi auto du code, « Plus tard » ; Super Admin « Relancer les non vérifiés ».
- **K (IDEA-170)** Super Admin Clés & intégrations : une carte par service.
- **L (IDEA-171)** clés manquantes + pistes gratuites. **M (IDEA-172)** SPF/DKIM/DMARC.
- **Constat règle I (IDEA-168)** : `keep-apple-notifications` écrit déjà `EXPIRED`/`CANCELLED` et `loadCurrentPlanCode` ignore les abonnements non ACTIVE/TRIALING → retour FREE automatique côté lecture ; MANQUE : trace datée `subscription_history`, délai de grâce (`GRACE_PERIOD`), relance « reviens », et distinction annulation (reste actif jusqu'à la fin) vs expiration.

## Plan Super Admin « niveau Apple » (06/10/2026) — À VALIDER PAR ADEL AVANT CODE
Ordre proposé, une étape = une preuve 390/1440, rien supprimé, aucun doublon :
1. **Audit lecture seule** (R) : rapport page par page du Super Admin (marche / vide / doublons / textes > 5 mots) → `docs/SUPERADMIN_AUDIT.md`.
2. **Menu 8 rubriques** (N, IDEA-173) : regroupement des 18 entrées existantes (mêmes écrans, aucune réécriture), une seule entrée Sécurité, état vide « Rien à approuver » + historique.
3. **Fiche utilisateur** : vérification e-mail + « Relancer les non vérifiés » (lié à IDEA-169), signalements « secousse » dans Modération.
4. **Mots de passe testeurs** (P, IDEA-175) : migration chiffrée (pgcrypto, clé hors base), lecture SUPER_ADMIN via RPC auditée, expiration 30 j, « Effacer » = effacement de la copie seulement. ⚠ Décision d'Adel notée : un mot de passe réversible est un risque ; garde-fous proposés : comptes TESTEURS uniquement (jamais les vrais utilisateurs), journal de chaque lecture, purge automatique à 30 j.
5. **Zéro clavier + cartes** (O, Q) : Clés & intégrations en une carte par service, Copier/Coller.
6. **Règle > 5 mots** (S, IDEA-178) : composant commun de repli + garde CI en mode *avertissement* d'abord (liste des écrans), puis blocage écran par écran ; ne jamais casser le design validé. Conflit à trancher : l'écran Offres est à ~23 mots (IDEA-160) ; la règle 5 mots le remplacerait.

## Plan « Interface ordinateur 16:9 » (10/10/2026) — À VALIDER PAR ADEL AVANT CODE

> Demande d'Adel : une fois connecté en mode PC, le design doit être pensé pour un écran 16:9, avec les règles d'un PC (≠ application). `App.tsx`, `Navigation.tsx` et la barre des 5 onglets sont **verrouillés** : aucun changement de mise en page sans ton accord écrit.

**Preuves (Chromium, export web réel, session « appareil approuvé » simulée comme `web-visible-surface-gate.cjs`, Supabase simulé, 1920×1080) — captures dans le dossier de travail :**
| Écran | Constat à 1920×1080 |
|---|---|
| Accueil (Écouter) | colonne de ≈ 700 px centrée ; bandeau défilant sur 1890 px ; barre du haut limitée à la colonne ; **la carte du tutoriel (« Étape 1/5 ») recouvre la moitié basse du bouton « TROUVER LE MORCEAU »** |
| Découvertes | contenu étiré sur **1890 px** : champ de recherche et bouton « RECHERCHER » de 1850 px, moitié basse vide |
| Soirées | colonne de ≈ 1130 px |
| Profil | étiré sur **1890 px** : avatar en haut à gauche, ☰ à l'extrême droite, bouton « ACTIVER LE MICRO » de 1850 px |
| Barre des 5 onglets | répartie sur 1920 px (« Loki Music » à x ≈ 190, « Profil » à x ≈ 1720) |
Résumé : trois largeurs différentes selon l'onglet (700 / 1130 / 1890 px) ; le téléphone est simplement étiré. Aucun débordement horizontal mesuré. Le robot flottant à droite masque du contenu (ex. 3e bouton du Profil).

**Corrigé tout de suite, sans toucher aux fichiers verrouillés :** le plein écran d'inscription (`TasteOnboardingGate.tsx`) : titre et boutons « Tu es… » collés à gauche pendant que la carte était centrée → colonne unique centrée (≤ 680 px). Capture après correctif jointe.

**Proposition (option A, recommandée) — une coque ordinateur unique, en CSS, sans toucher à `App.tsx` ni `Navigation.tsx` :** au-delà de 1024 px de large, centrer `#root` dans une colonne de 1280 px maximum (fond identique), y compris la barre des 5 onglets ; la hauteur reste épinglée à la fenêtre (règle du 29/09 : jamais `height:auto`). Même largeur sur les 5 onglets. Réglage dans `index.js` (`keep-mobile-viewport-lock`) / `scripts/fix-web-export.cjs` (`keep-desktop-shell`).
- **Risque :** `web-visible-surface-gate.cjs` et le gardien `dual-viewport` exigent que `#root` remplisse la fenêtre → à adapter dans le même commit (jamais l'affaiblir).
- **Option B (plus ambitieuse, à planifier ensuite) :** vraie mise en page à deux colonnes sur grand écran (liste à gauche, détail à droite) pour Découvertes, Profil et Playlists ; nécessite de toucher des écrans entiers → validation écran par écran.
- **Tests d'acceptation :** captures 1920×1080, 1440×900, 1366×768 et 390×844 sur les 5 onglets avec la session simulée ; largeur du contenu identique sur les 5 onglets ; aucun débordement ; le tutoriel ne recouvre jamais le bouton principal ; le téléphone 390×844 reste inchangé pixel pour pixel.
- **Question à trancher :** largeur maximale souhaitée (1280 px ? 1440 px ?) et barre des 5 onglets : conservée en bas, centrée dans la colonne (recommandé), ou déplacée sur le côté.


## Plan Boutique musicale — clarté + envie d'acheter (10/10/2026) — À VALIDER PAR ADEL
**Audit (lecture seule, base réelle, compte adel4A) :** la RPC `keep_playlist_sale_my_offers` filtre bien `seller_id = auth.uid()` : aucune offre d'un autre vendeur n'est affichée. 3 offres actives : (1) « Pépite Tchat · @adel4A » 1 € (offre de conversation privée, `keep-chat:`), (2) « Ma collection · 5 titres » 2 €, (3) « Ma collection · 8 titres » FREE 3 (la base compte 10 titres : le nom est figé à la création). 5 autres offres sont désactivées. **Causes de la confusion :** noms génériques identiques « Ma collection », nombre de titres dans le nom qui devient faux, bandeau mélangeant pastille « 1 € » (offre tchat) et collections, trois niveaux d'en-têtes superposés (profil → « Ma boutique musicale » → « Mes pépites »), filtres répartis sur deux lignes.
**Proposition de design (inspirée des vitrines Spotify/Bandcamp/Apple Music) :**
1. Un seul en-tête : « Ma boutique · 2 collections ».
2. UNE rangée de filtres alignée : `Tout 2` · `FREE 1` · `Boutique € 1` · `Nouveautés`.
3. Cartes uniformes (pochette carrée, nom, « 5 titres », prix en gros, bouton unique ACHETER / DÉBLOQUER avec FREE) ; grille 2 colonnes mobile, 3-4 colonnes PC.
4. Nom d'offre éditable à la création (défaut = nom de la playlist, jamais « Ma collection ») ; nombre de titres calculé en direct, jamais écrit dans le nom.
5. L'offre tchat sort de la boutique (section « Messagerie privée » séparée).
6. Propriétaire : badge « ACTIVE / DÉSACTIVÉE » + bouton Modifier sur chaque carte.
**Fichiers :** `SellerBoutique.tsx` (propriétaire du design), `ProfilePublicScreen.tsx` (en-tête). **Garde-fous :** `SellerBoutique.contract.test.ts`, règle Apple 3.1.1 (€ masqué sur iPhone), parité 390×844 / 1440×900. Rien n'est codé tant qu'Adel n'a pas validé.

## Plan ☰ de l'écoute en demi-écran (10/10/2026) — À VALIDER PAR ADEL
**Constat :** le ☰ (et la pastille « N prêts à trier ») de `TopBar` appelle `navigation.navigate('SessionHistory')` : écran complet, l'écoute passe derrière, l'utilisateur ne sait plus comment revenir.
**Proposition :** une feuille basse (≈ 50 % de la hauteur, accordéon qui se déploie depuis le haut du ☰) par-dessus l'écoute, qui ne la coupe pas : (1) « Cette session » = morceaux trouvés à trier, avec GARDER / PASSER ; (2) une ligne « Tout l'historique › » qui seule ouvre `SessionHistory` en plein écran ; (3) fermeture par toucher du fond, glisser vers le bas ou bouton ×, retour exact sur l'écoute. Composant réutilisant la liste existante (aucune seconde logique de session). Sur PC (1440×900) : panneau latéral de 420 px.
**Garde-fous :** écoute en cours jamais interrompue ; parité mobile / PC ; test dual-viewport ; barre des 5 onglets inchangée. Aucun code avant validation.

## Plan Robot guide clignotant (10/10/2026) — À VALIDER PAR ADEL
**Déjà en place :** scénario par rubrique (`robotSectionScenario.ts`) : intro + conseils + propositions adaptées à Loki Pulse, Découvertes, Playlists, Soirées, Profil ; secousse et 5 touchers passent par lui.
**Reste (guidage) :** (1) registre de cibles `useRobotGuideStore` (id → bouton) ; chaque bouton clé (onglet, ＋ playlist, Créer une soirée, ma story, Partager sur mon PC…) se déclare avec un id ; (2) quand l'utilisateur choisit une proposition, le robot l'amène à la rubrique puis fait clignoter la cible (halo pulsant) jusqu'au toucher ; (3) le robot explique en une phrase, puis s'efface quand l'action est faite ; (4) le clignotement de la barre des 5 onglets touche `Navigation.tsx` (verrouillé) : à confirmer. Aucun code avant validation.

## Audit goût musical + notifications des stories (10/10/2026) — À VALIDER PAR ADEL (changements de base = « OK base »)
**Base réelle (lecture seule) :** tables de goût actives (796 scores, 53 styles, 172 artistes) ; déclencheurs actifs qui nourrissent le goût : GARDER (keep_decisions), écoutes en swipe, j'aime (+3), pouce bas (−4, 268 pas-aimés), bibliothèque. **Signaux NON utilisés aujourd'hui :** vues de story (21), j'aime de story (0 — personne ne l'utilise), PASSER, achats / déblocages de collections, abonnements, réponses Solo/Battle, durée d'écoute.
**Proposition goût :** ajouter ces signaux avec des poids bornés (achat +5, j'aime story +3, vue complète +1, PASSER −1, Solo juste +1) via la fonction existante `keep_apply_track_taste_signal` ; jamais bloquant, jamais mélangé aux profils de test.
**Notifications stories — manques constatés en base :** `keep_pin_story_track` et `keep_pin_shared_story_track` ne notifient PAS le membre qui avait mis la musique en story le premier ; `keep_record_story_view` et `keep_story_like_toggle` ne notifient pas le propriétaire (types existants : MUSIC_TAKEN « morceau repris », NEW_PUBLIC_KEEP, LOKI_PULSE_NEW). **Proposition :** nouveaux types STORY_RESHARED (« @x a repris ta musique dans sa story »), STORY_LIKED, avec regroupement (1 notification par heure et par personne) et respect de `notification_preferences`. Anti-doublon actuel (🔒 « Déjà en story chez @x ») conservé : le premier reste crédité.
**Musique non découverte / gratuite :** déjà marquée « Gratuit · non certifiée » en story ; à ajouter : même pastille dans Loki Pulse et bouton « L'acheter pour mon profil » tant qu'aucun membre ne l'a certifiée (premier acheteur crédité).
**Rien n'est appliqué en base sans ton « OK base ».**

## Plan Écoute « mieux que Shazam » (10/10/2026) — À VALIDER PAR ADEL
**Constat honnête :** (1) catalogue Loki = 50 249 titres, dont seulement 38 avec ISRC (identifiant international) : trop peu pour rivaliser en volume ; (2) iPhone : ShazamKit natif d'abord = même couverture que Shazam sur l'identification pure ; Android / web : AudD puis ACRCloud, couverture plus faible ; (3) « des milliards de musiques » = catalogues des plateformes (Apple Music ≈ 100 M+), pas une base à copier.
**Où Loki peut être meilleur :** (a) cascade parallèle + mémoire communautaire (déjà : `recognizeWithKeepMemoryFast`) : un son identifié par un membre l'est instantanément pour les suivants ; (b) enrichir chaque titre trouvé avec ISRC, pochette, style via les catalogues publics (iTunes / Deezer / MusicBrainz) pour que le goût, les stories et la boutique marchent sur des identifiants fiables ; (c) identification « sans micro » par lien (TikTok/YouTube) — déjà là ; (d) latence affichée (nom + pochette dès le premier résultat — fait le 09/10) ; (e) mesure : taux de réussite par plateforme dans le Super Admin pour savoir où on perd face à Shazam. **Aucun ajout de fournisseur payant sans ton accord (coût).**

## Plan lenteur Solo / Battle (10/10/2026) — « OK base » requis
1. Appliquer `20261010130000_battle_solo_pack_fast.sql` (remplace seulement la fonction `keep_battle_solo_pack`, même signature) → Solo MIX de 17 s à ~0,2 s. 2. Ensuite mesurer `keep_battle_solo_daily_status` (la « jauge » Solo) et `keep_battle_manual_availability_ping` (1 724 appels, 2,5 s) et alléger de la même façon. 3. Espacer ou plafonner les tâches planifiées de catalogue (toutes les 3 et 5 min, 36 s chacune) qui occupent la base pendant les parties. 4. Contrôle après application : refaire `explain analyze` et lire les journaux 24 h.

## Plan IDEA-214 — Détail spectateurs de ma story + % satisfaction (à valider par Adel)
1. Lecture seule : vérifier ce que `keep_my_story_viewers_v4` / `story_watch_sessions` enregistrent déjà par musique (secondes, lecture complète, swipe) et les j'aime par spectateur (`track_likes`).
2. Calcul pur côté app (testé) : par musique = écoutée en entier / passée / aimée ; satisfaction spectateur = écoute complète + j'aime pondérés − passages rapides ; satisfaction story = moyenne.
3. Écran « Voir qui » : par spectateur, liste des musiques avec ✓ entière / ⏭ passée / ❤️, puis message de fin « Félicitations » + pourcentage.
4. Base (accord requis) : éventuelle RPC v5 agrégeant j'aime + complétion ; signaux envoyés au moteur de goût (déjà identifiés manquants).
5. Tests : contrat + jest ; parité mobile 390 / PC 1440.

## Plan IDEA-219 — Studio ordinateur (DJ) + QR par e-mail (à valider par Adel, aucun code avant accord)
Existant : QR PC, popup Oui/Non + lieu (fonction `keep-web-pairing` écrite, NON déployée), session 24 h (écrite, NON déployée), clé Super Admin `web_share_free_cost` (migration NON appliquée), bouton « Partager sur mon PC ».
1. **Lien par e-mail** : nouvelle action `email` de `keep-web-pairing` + modèle d'e-mail via `keep-auth-email` (Brevo déjà utilisé) ; lien unique 5 min ; ouvre l'app/web sur « Connecter cet ordinateur ? » (même popup Oui/Non). Réponse à « Gmail ? » : le lien est un lien https classique : Gmail/Outlook l'ouvrent dans le navigateur ou l'app KEEP (lien universel), aucun code de boîte e-mail à copier.
2. **Studio** : écran réservé web (`Platform.OS==='web'` + session PC valide), import MP3 + visuel (photo/courte vidéo), stockage Supabase Storage, diffusion « avant-première » à ses abonnés ; verrou `CREATOR_PRO` ; jamais disponible sur mobile.
3. **Durée / paiement** : 24 h puis déconnexion ; gratuit au lancement (prix 0 annoncé dans la fenêtre), puis débit FREE selon le Super Admin ; ligne dédiée dans Offres.
4. **Super Admin** : réglages (durée, prix FREE, activation Studio), liste des sessions PC, bouton Déconnecter.
5. **Robot** : rubrique « Studio ordinateur » ajoutée au scénario par rubrique.
6. **Tests avant livraison** : protocole `docs/INTEGRATION_CHECKLIST.md` § « Protocole de test avant livraison » (parité PC 1440 / 1366×650 / mobile 390, preuve image, connexion réelle, anti-régression).
Écritures de production à valider : déploiement `keep-web-pairing`, migrations prix/Studio, bucket Storage.

## Plan IDEA-220 — Lia, guide des boutons allumés (à valider par Adel, aucun code avant accord)
Existant à remplacer (sans retirer de fonction) : `robotCoachService.ts` (bulles « Qu’est-ce que je peux faire ? » et menu « On fait quoi ? »), `robotSectionScenario.ts` (scénario par rubrique), `robotHelp.ts`, `RobotSummonWrapper.tsx`, `ProblemReportHost.tsx` (secousse, appel du robot).
Étapes :
1. **Accueil connexion** : bulle de Lia « Besoin de moi ? Secoue-moi » (une fois par session, fermable d'un toucher, respecte le silence après 3 fermetures).
2. **Guide par rubrique** : une étape = un bouton allumé (pulsation) + une phrase courte de Lia ; l'utilisateur appuie sur le bouton allumé pour passer à l'étape suivante ; objectif = la fonction demandée (profil, ☰ du profil, soirée, Solo, Loki Pulse, boutique…).
3. **Secousse en soirée** : même guide, branché sur la rubrique active (`scenarioForRoute`).
4. **Discussion** : Lia répond dans le même bandeau de chat (réutilise `GlobalChatDock`), pas de second chat.
5. **Correction visuelle** : le titre des bulles ne doit plus chevaucher la barre d'état (safe-area) sur iPhone et PC ; contrôle en capture 390×844 et 1440×900.
6. **Tests avant livraison** (protocole `docs/INTEGRATION_CHECKLIST.md`) : parcours complet profil → ☰ → fonction, et soirée → secousse → fonction, sur mobile et PC, avec captures.
Décisions à valider par Adel : (a) remplacer les bulles existantes d'un coup ou par rubrique ? (b) Lia en voix (existe déjà) ou texte seul ? (c) nom « Lia » confirmé ?
