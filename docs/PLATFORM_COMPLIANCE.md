# Conformité plateformes — KEEP

Recherche réalisée le 2026-08-21 (sources citées par section). KEEP ne diffuse
jamais de musique : il reconnaît, organise et route vers les comptes que
l'utilisateur possède déjà. Ce document fixe ce qui est **autorisé**,
**limité**, **soumis à validation** ou **interdit**, pour ne jamais coder une
fonctionnalité qu'il faudrait ensuite retirer.

## 1. Spotify Web API — ⚠️ CONTRAINTE MAJEURE, structure le plan de lancement

**Changement critique (mars-mai 2025, confirmé toujours en vigueur en 2026)** :
l'accès "Extended Quota Mode" (utilisateurs illimités) exige désormais :
- une **entité légale enregistrée** (plus d'accès individuel/hobbyiste) ;
- **250 000+ utilisateurs actifs mensuels DÉJÀ existants** ;
- un service **actif et déjà lancé**, présent sur les marchés clés Spotify ;
- viabilité commerciale démontrée ; délai de revue jusqu'à 6 semaines.

En **Development Mode** (par défaut, avant approbation), l'app est limitée à
**5 utilisateurs Spotify authentifiés maximum**, et le compte développeur doit
lui-même être Premium (nouveau, février 2026).

**Conséquence directe pour KEEP** : impossible de lancer une bêta publique
avec Spotify comme provider principal au-delà de 5 testeurs tant que
250k MAU ne sont pas atteints ailleurs — un problème de type "poule et œuf".
**Décision produit qui en découle** : le MVP public doit s'appuyer en priorité
sur **Apple Music** (pas de tel seuil MAU documenté) pour la bêta et le
lancement initial, Spotify restant branché en Development Mode (5 comptes,
dont ceux de l'équipe/beta testeurs proches) en attendant une demande
d'Extended Quota déposée dès que KEEP a une entité légale et une traction
réelle.

**Interdictions Spotify pertinentes pour KEEP :**
- Interdiction stricte d'utiliser le contenu Spotify pour entraîner un modèle
  IA/ML — **le SmartPlaylistRouter n'apprend QUE sur les données propres à
  KEEP** (décisions GARDER/PASSER, corrections utilisateur), jamais sur le
  contenu ou les métadonnées Spotify elles-mêmes → conforme.
- Interdiction de "construire des profils utilisateurs" ou des "métriques
  d'écoute dérivées" à partir du contenu Spotify → **directement pertinent
  pour KEEP DNA** (voir `docs/INNOVATIONS.md`) : l'ADN musical KEEP doit être
  calculé à partir des décisions KEEP (GARDER/PASSER/corrections), jamais
  d'une analyse du catalogue/contenu Spotify lui-même.
- Pas de vente de métadonnées/pochettes en produit autonome.
- Monétisation : KEEP peut facturer l'accès à ses propres fonctionnalités,
  jamais l'accès au contenu Spotify en tant que tel.

**Statut** : provider CONNECTED en Development Mode uniquement pour l'instant
(architecturalement prêt via `MusicProviderAdapter`, implémentation réelle
PLANNED — voir PROJECT_STATUS.md).

Sources : [Spotify Developer Policy](https://developer.spotify.com/policy) ·
[Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) ·
[TechCrunch — Feb 2026 changes](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/) ·
[Updating Extended Access criteria](https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access)

## 2. Apple Music API (MusicKit) — provider recommandé pour le MVP

**Autorisé :** lecture native du catalogue Apple Music et de la bibliothèque
utilisateur, création de playlists, ajout de morceaux, affichage
pochettes/métadonnées en lien avec la lecture/les playlists.

**Interdit :**
- Monétiser l'accès au **catalogue Apple Music lui-même** (ne pas vendre
  "l'accès à la musique" en IAP) — KEEP facture ses propres fonctionnalités
  (SmartPlaylistRouter avancé, quotas, analytics), jamais le catalogue → conforme.
- Télécharger/uploader/permettre le partage de fichiers audio.
- Partager les données utilisateur (playlists, favoris) avec des tiers hors
  amélioration de l'app elle-même.
- Utiliser pochettes/métadonnées à des fins publicitaires sans autorisation
  des ayants droit.
- Jouer un morceau précis à un moment précis dans un contenu partagé
  (vidéo/audio créé) sans droits de synchronisation — pertinent si KEEP
  ajoute un jour des "moments partagés" avec extrait audio.

**Statut** : pas de seuil MAU documenté comparable à Spotify → recommandé
comme **provider principal du MVP public**. Implémentation réelle : voir
`packages/music/src/providers/AppleMusicProvider.ts` (CODED + vérifié par
`packages/music/scripts/verify-apple-music.ts`, 14/14 vérifications
réussies avec un fetch simulé fidèle aux réponses réelles de l'API —
jamais encore appelé en conditions réelles, statut TESTED-mock pas
PRODUCTION_READY).

**Contraintes techniques réelles découvertes (vérifiées le 21/08/2026,
documentation officielle Apple + forums développeurs Apple) :**
- Authentification à **deux jetons distincts et obligatoires ensemble** :
  `Authorization: Bearer <developer token>` (JWT ES256 signé côté backend
  KEEP, jamais dans l'app) + `Music-User-Token: <jeton utilisateur>` (obtenu
  côté app via MusicKit JS dans une WebView, pas d'échange OAuth
  code→token côté serveur comme Spotify).
- **Aucun endpoint de profil utilisateur** (pas de nom, pas d'email) —
  choix de confidentialité assumé par Apple. `getProfile()` ne doit jamais
  inventer ces informations.
- **La suppression d'un morceau d'une playlist de bibliothèque via l'API
  REST n'est PAS supportée par Apple** (confirmé sur les forums
  développeurs Apple, demandé depuis des années, jamais implémenté —
  seul MusicKit natif Swift le permet). Conséquence produit directe :
  "Ranger ma musique" doit, pour les utilisateurs Apple Music, seulement
  **proposer** les doublons détectés (l'utilisateur les supprime lui-même
  dans l'app Musique), jamais prétendre les avoir supprimés.
- L'ISRC des morceaux de bibliothèque n'est pas garanti par l'API (relation
  `catalog` parfois vide, signalé sur les forums Apple) — traité comme
  best-effort, avec repli automatique sur la résolution fuzzy titre+artiste
  déjà en place dans `TrackResolver`.

Sources : [Apple Developer Forums — music app development](https://developer.apple.com/forums/thread/688335),
[Get All Library Playlists](https://developer.apple.com/documentation/applemusicapi/get-all-library-playlists),
[User Authentication for MusicKit](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit),
[Can we remove tracks from a user's Library Playlist yet?](https://developer.apple.com/forums/thread/707759)

## 3. Deezer API — ⚠️ NON RETENU pour le MVP commercial

Les conditions d'utilisation standard de l'API Deezer sont **strictement
non-commerciales** : "l'utilisation des Services est strictement limitée à un
usage non-commercial". Un produit facturé comme KEEP (Premium, Creator Pro,
Venue Pro) ne peut pas s'appuyer sur l'API Deezer publique sans un accord
commercial séparé négocié directement avec Deezer.

**Décision** : Deezer reste dans l'interface `MusicProviderAdapter` (prêt
architecturalement) mais **statut PLANNED/BLOCKED** — non activé tant qu'un
accord commercial n'est pas obtenu. Ne pas l'annoncer comme provider
disponible dans l'app tant que ce point n'est pas résolu.

Source : [Terms of use of Deezer for Developers](https://developers.deezer.com/termsofuse)

## 4. YouTube / YouTube Music

Il n'existe pas d'API officielle publique couvrant la gestion de
playlists **YouTube Music** (bibliothèque, ajout de titres) comme le fait
l'API Web Spotify ou MusicKit. Les bibliothèques tierces "ytmusicapi" et
équivalents s'appuient sur des points d'accès internes non documentés,
ce qui viole les Conditions de Service de l'API YouTube (interdiction de
contournement/reverse engineering des services Google).

**Décision** : YouTube Music **non retenu comme provider MVP**. La YouTube
Data API v3 (officielle) reste envisageable plus tard pour des cas d'usage
limités (rechercher une vidéo officielle d'un morceau, afficher un lien) —
statut PLANNED, hors périmètre GARDER/playlists.

Source : [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)

## 5. Apple App Store — In-App Purchase (Guideline 3.1.1)

> "If you want to unlock features or functionality within your app [...]
> you must use in-app purchase. Apps may not use their own mechanisms to
> unlock content or functionality."

**Conséquence directe** : PREMIUM / CREATOR PRO / VENUE PRO sur iOS **doivent**
passer par In-App Purchase (StoreKit) — jamais un paiement web direct pour
débloquer des fonctionnalités in-app. Le "système web" mentionné au §43 du
cahier des charges reste possible uniquement pour un achat effectué **hors
de l'app** (site web, sans lien de déblocage in-app), jamais comme
alternative à l'IAP à l'intérieur de l'app.

Guideline 4.2.2 : une app ne doit pas être "principalement un agrégateur de
contenu ou une collection de liens" — KEEP doit démontrer une valeur
intégrée réelle (reconnaissance, SmartPlaylistRouter, réseau social musical),
pas seulement rediriger vers Spotify/Apple Music. C'est déjà la promesse
produit ("KEEP route, mais range et apprend") — à mettre en avant dans les
notes de review App Store.

Source : [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## 6. Google Play Billing

Les achats numériques débloquant des fonctionnalités in-app doivent utiliser
Google Play Billing (règle équivalente à l'IAP Apple). Frais de service pour
les abonnements réduits à **15%** (contre 30% historique) pour la plupart des
développeurs — vérifier l'éligibilité exacte (programme petites entreprises /
ancienneté d'abonnement) au moment de la configuration réelle dans Play
Console, les grilles ayant évolué plusieurs fois en 2025-2026.

Sources : [RevenueCat — 15% Reduced Service Fee](https://www.revenuecat.com/docs/platform-resources/google-platform-resources/15-reduced-service-fee) ·
[Google Play service fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)

## 7. APIs de reconnaissance musicale

Voir `docs/MUSIC_RECOGNITION_PROVIDERS.md` pour le comparatif complet.
AudD et ACRCloud n'imposent pas de restriction connue incompatible avec un
usage commercial standard (reconnaissance ponctuelle, pas de revente du
résultat brut en tant que produit de données).

**Implémentation réelle AudD** (`packages/music/src/providers/AudDRecognitionProvider.ts`,
vérifiée le 21/08/2026 contre docs.audd.io) : endpoint unique
`POST https://api.audd.io/`, multipart/form-data (`api_token`, `file`,
`return=apple_music,spotify` pour obtenir l'ISRC — absent de la réponse de
base). Point d'attention retenu dans le code : **AudD ne fournit aucun
score de confiance continu** (contrairement à ACRCloud) — correspondance
binaire trouvé/pas trouvé, `confidence` fixé à 1.0 documenté comme non
probabiliste plutôt que d'inventer un pourcentage. Testé : 13/13
vérifications via `packages/music/scripts/verify-audd.ts` (requête
multipart + réponses simulées fidèles à la doc, y compris les deux formes
"pas de correspondance" — `result:null` et `result:[]`).

## Synthèse — ce qui structure la suite du build

| Provider | Statut MVP | Raison |
|---|---|---|
| Apple Music (MusicKit) | **Provider principal recommandé** | Pas de seuil MAU bloquant |
| Spotify | Development Mode uniquement (5 comptes) | Seuil 250k MAU pour accès illimité |
| Deezer | Non activé | ToS non-commercial, accord séparé requis |
| YouTube Music | Non retenu | Pas d'API officielle de gestion playlists |
| AudD (reconnaissance) | Retenu primaire | Prix publié, pas de restriction bloquante |
| ACRCloud (reconnaissance) | Retenu secours | Devis à obtenir |

**Paiements :** IAP obligatoire sur iOS et Android pour tout déblocage
in-app ; jamais de mécanisme de contournement.

## 8. Continuité de la reconnaissance en session (recherche 21/08/2026)

Contexte : le concept KEEP corrigé (§ session, voir `docs/PROJECT_STATUS.md`)
demande que l'utilisateur démarre une session puis **profite de sa soirée**
sans avoir à rouvrir l'app à chaque morceau. Ce point structure directement
ce que le moteur de session (`useSessionStore`) a le droit de faire.

**Ce qui existe réellement et est autorisé par les plateformes :**
- iOS : le mode d'arrière-plan `UIBackgroundModes: ["audio"]` permet à une
  app d'utiliser le micro en arrière-plan tant qu'une `AVAudioSession`
  active (catégorie `.record`/`.playAndRecord`) est engagée. C'est le
  mécanisme réellement utilisé par **Auto Shazam** (Shazam, propriété
  Apple) : "listens continuously... even when you switch to another app or
  when your device is locked", avec un Live Activity affiché pendant
  l'écoute (ajouté en mai 2024). C'est donc un mécanisme public, pas un
  privilège réservé aux apps Apple.
- Android : équivalent via un **Foreground Service** de type `microphone`
  (obligatoire avec notification persistante depuis Android 8+, permission
  `FOREGROUND_SERVICE_MICROPHONE` explicite depuis Android 14).

**Ce qui reste un vrai risque/coût, pas juste un détail technique :**
- App Review iOS rejette régulièrement les apps qui déclarent
  `UIBackgroundModes: audio` sans justification d'usage manifeste et
  continue à surveiller l'usage réel du micro en arrière-plan (retours de
  développeurs sur les forums Apple, 2024-2026) — déclarer ce mode
  **sans l'avoir réellement câblé et testé sur un vrai appareil** est le
  genre d'erreur qui fait rejeter une soumission TestFlight/App Store.
- L'écoute continue en arrière-plan consomme sensiblement plus de batterie
  qu'une écoute au premier plan — Auto Shazam le signale explicitement à
  l'utilisateur.

**Décision produit pour cette itération (ne pas sur-promettre) :**
Le moteur de session (`useSessionStore`) fonctionne aujourd'hui **au
premier plan** : tant que l'app KEEP est ouverte (écran allumé ou verrouillé
avec lecture audio de fond activée nativement par iOS/Android pour les apps
audio, ce que KEEP n'utilise pas encore), la reconnaissance tourne à
intervalle régulier. La continuité en arrière-plan total (app fermée,
utilisateur sur une autre app) — `UIBackgroundModes: audio` + Foreground
Service Android + gestion batterie — est un chantier séparé, référencé dans
`docs/RESTE_A_FAIRE.md`, **pas encore déclaré dans `app.json`** : on ne
déclare une capability système qu'une fois le code correspondant réellement
écrit et vérifiable sur un vrai appareil (cf. règle "jamais dire validé sans
test réel"). Ne jamais présenter KEEP comme "toujours à l'écoute" tant que
ce chantier n'est pas fait.

Sources : [Auto Shazam — Apple Support](https://support.apple.com/guide/shazam/aside/dev450e1498e/web) ·
[Shazam can now run in the background with Live Activities — AppleInsider](https://appleinsider.com/articles/24/05/22/shazam-can-now-run-in-the-background-with-live-activities) ·
[How to use continuous background music recognition on iPhone](https://www.idownloadblog.com/2025/12/10/use-auto-shazam/) ·
[Apple Developer Forums — Background Audio capabilities not accepted](https://developer.apple.com/forums/thread/91872) ·
[Apple Developer Forums — Cannot record audio when app is background](https://developer.apple.com/forums/thread/674632)

## 9. Marketplace "Découvertes musicales entre particuliers" — audit juridique/fiscal/technique (21/09/2026)

> ⚠️ **Je ne suis pas juriste.** Ce qui suit est une analyse technique et une
> mise en cohérence de premier niveau (Code de la consommation, RGPD, IAP),
> pas un avis juridique. Une relecture par un avocat spécialisé droit du
> numérique/consommation est recommandée avant d'exposer cette fonctionnalité
> à un volume significatif d'utilisateurs, en particulier pour la partie
> droit voisin/SACEM et le seuil DAC7 ci-dessous.

### 9.1 Ce qui a été corrigé cette session

- **CGV / non-remboursement** : `legal/terms.html` §6bis + `legal/refund.html`
  §3bis — accès à une "découverte musicale" (jamais une cession de droits),
  vendeur = particulier (jamais de statut pro/SIRET requis ou affiché),
  aucun remboursement une fois la case de renonciation au délai de
  rétractation (L221-28 13°) cochée et le paiement confirmé.
- **RGPD** : `legal/privacy.html` §6bis — mention du lien de paiement perso,
  clarifie que Loki ne voit/stocke aucune donnée bancaire.
- **Bug réel identifié et corrigé** : le bouton "ACHETER" vert qu'Adel a vu
  n'était pas un défaut du flow acheteur (déjà correct côté profil visité,
  masquage + preview immersive + case de renonciation) mais un résidu de
  code sur **son propre profil** (`ProfilePublicScreen.tsx`, l'onglet
  "Profil" — toujours en libre-service pour son propre compte), qui listait
  ses propres offres avec un CTA d'achat impossible à aboutir (le serveur
  bloque `CANNOT_BUY_OWN_PLAYLIST`). Corrigé + composant mort
  `PlaylistSaleCard.tsx` supprimé.

### 9.2 Flux PayPal réel — preuve par le code, pas une promesse

**Il n'existe aucune intégration PayPal (API, SDK, webhook) dans ce
dépôt.** Ce que l'app appelle "payer avec PayPal" est en réalité :

1. Le vendeur colle **une URL personnelle en texte libre** (PayPal.me, Lydia,
   n'importe quoi) via `keep_set_payout_link` —
   [`payoutLinkService.ts:15-19`](../packages/mobile/src/services/payoutLinkService.ts#L15-L19).
   Rien ne vérifie que c'est bien un lien PayPal ni qu'il est valide.
2. L'acheteur appelle `requestPlaylistPurchase(offerId)` puis
   `Linking.openURL(request.payoutLink)` —
   [`PublicUserProfileScreen.tsx:383-385`](../packages/mobile/src/screens/PublicUserProfileScreen.tsx#L383-L385)
   — ce qui ouvre simplement ce lien dans le navigateur/l'app PayPal.
   **Aucune donnée de montant, de référence ou de retour n'est transmise à
   Loki par PayPal** : rien ne relie le paiement PayPal réel à la commande
   Loki.
3. Le paiement est ensuite déclaré manuellement par le **vendeur** via un
   bouton "J'ai bien été payé" —
   [`PlaylistSalePanel.tsx:67-96`](../packages/mobile/src/components/PlaylistSalePanel.tsx#L67-L96)
   — qui appelle `markPlaylistSalePaid` → RPC
   `keep_playlist_sale_mark_paid_and_deliver`. C'est cette déclaration
   humaine, non vérifiée, qui débloque les morceaux pour l'acheteur.

**Conséquences concrètes, à ne jamais présenter comme résolues :**
- Pas de confirmation de paiement (webhook IPN/Order API), pas de 3D-Secure/
  SCA côté Loki — c'est PayPal ou le service choisi par le vendeur qui gère
  ça pour son propre compte, hors de Loki.
- **Un vendeur malhonnête peut débloquer une vente jamais payée**, ou
  refuser de confirmer un paiement réellement reçu — aucun arbitrage
  automatique possible, seul un litige manuel entre les deux personnes.
- Pas de génération de facture, pas de preuve de transaction exploitable
  par Loki en cas de litige — seul l'historique `playlist_sale_payments`
  (montant déclaré, statut, dates) existe côté Loki.
- Cohérent avec la position "Loki n'est qu'un intermédiaire technique" des
  CGV, mais ça veut dire concrètement que **Loki ne peut garantir aucune
  protection acheteur/vendeur sur le paiement lui-même**.

Le système de paiement Paddle.com (abonnements Premium/Creator Pro/Venue
Pro, `terms.html` §6) est totalement séparé, réel, et non concerné par ce
qui précède.

### 9.3 Risque IAP Apple/Google — le flag est maintenant ACTIF en production

Constat vérifié en base ce jour (`feature_flags`, table de production) :

```
key: playlist_marketplace
is_enabled_globally: true
rollout_percent: 100
description (écrite par une session précédente, jamais mise à jour) :
  "Marketplace playlists (VENDRE/ACHETER + pré-écoute) — paiement par
   lien externe, désactivé tant que non conforme Apple IAP"
```

**La description du flag dit explicitement pourquoi il devait rester
désactivé, et il est actif à 100% depuis le 21/09/2026 12:08 UTC** (activé
plus tôt dans cette session, sur demande explicite d'Adel de faire avancer
la marketplace). C'est un vrai risque de rejet App Store / suspension de
compte développeur, pas une formalité :

- Guideline 3.1.1 App Store : "if you want to unlock features or
  functionality within your app [...] you must use in-app purchase" —
  débloquer des morceaux/une playlist via un lien de paiement externe
  saisi par l'utilisateur est exactement le cas visé.
- Une exception existe pour du contenu "consommé en dehors de l'app"
  (lecture-seule externe) ou pour certaines catégories (ex. "reader apps"),
  mais **ne s'applique pas ici** : les morceaux achetés sont livrés et
  écoutés **dans** l'app Loki.
- Risque identique côté Google Play Billing (règle équivalente).

**Recommandation, pas une décision prise ici** (hors périmètre de cette
session — c'est un choix produit/juridique, pas un bug à corriger seul) :
soit (a) repasser le flag à `is_enabled_globally: false` en attendant un
vrai arbitrage Apple/Google, soit (b) limiter le rollout à une plateforme
non concernée (web only) via `enabled_plans`/un contrôle de plateforme côté
client, soit (c) obtenir un avis explicite que le risque est accepté pour
la phase actuelle. Je n'ai pas désactivé le flag moi-même : c'est un choix
produit qui appartient à Adel, pas une correction technique.

### 9.4 RGPD — ce qui reste à faire

- `privacy.html` a été complétée (§6bis, voir 9.1) mais **aucun registre
  des traitements formel**, ni DPA (Data Processing Agreement) documenté
  avec Supabase pour les nouvelles données `playlist_sale_payments` /
  `playlist_sale_offers` n'existe. Hors budget de cette session.
- Les cookies : `pricing.html` et le reste du site public ne documentent
  aucun cookie/tracker — à vérifier si un outil analytics est ajouté un
  jour (rien de tel n'a été trouvé dans le code cette session).

### 9.5 Risques non-minimisés (SACEM / droit voisin / droit à l'image)

- **Droit voisin / SACEM** : la "découverte musicale" vendue est une
  sélection curatée de morceaux déjà présents dans la bibliothèque du
  vendeur (via ses propres comptes Apple Music/Spotify), jamais un fichier
  audio hébergé par Loki. Les CGV (§6bis) l'affirment explicitly. **Ce
  n'est cependant pas une garantie juridique absolue** : faire payer un
  accès à une sélection/mise en avant d'œuvres protégées, même sans
  transférer le fichier, peut être requalifié selon les faits précis
  (nombre de morceaux, caractère systématique, volume) — c'est le point le
  plus incertain de tout l'audit et celui qui justifie le plus une relecture
  par un avocat spécialisé propriété intellectuelle avant un lancement à
  grande échelle.
- **Droit à l'image / pochettes** : les pochettes (artwork) restent
  masquées jusqu'à l'achat (`keep_playlist_sale_offer_preview_tracks` ne
  renvoie jamais artwork/titre/artiste) — réduit mais n'élimine pas le
  risque, une fois achetées les pochettes redeviennent visibles dans le
  Loki de l'acheteur, ce qui est un usage normal (l'app affiche déjà des
  pochettes partout pour la musique reconnue).

### 9.6 Vendeur particulier, pas de TVA, obligations de la plateforme

Traité dans `terms.html` §6bis : statut particulier explicite (jamais
"micro-entreprise"/"auto-entrepreneur"/"SIRET"/"professionnel"), pas de TVA
prélevée par Loki sur l'échange entre particuliers. Vérifié dans le code :
aucun champ SIRET/TVA/statut professionnel n'existe dans le formulaire de
mise en vente (`MyMusicScreen.tsx` `openSellModal`/`PlaylistSalePanel.tsx`
modal de prix) — rien à retirer, ce n'était jamais présent.

**Obligation DAC7-style (2 000€ OU 30 transactions/an → transmission à
l'administration fiscale) : NON implémentée.** Aucun cumul annuel par
vendeur n'est calculé aujourd'hui. C'est un vrai chantier technique (pas
une case à cocher) : il faudrait a minima une vue agrégée
`sum(amount_cents) / count(*) group by seller_id` sur `playlist_sale_payments`
filtrée par année civile, un job de rapprochement, et un canal de
transmission réel vers l'administration — non construit cette session,
volontairement, plutôt que de livrer quelque chose de non fiable sur un
sujet fiscal. À planifier avant que le volume de ventes ne devienne
significatif.

### 9.7 Checklist conformité France — état au 21/09/2026

| Point | Statut |
|---|---|
| CGV marketplace (accès à une découverte, pas cession de droits) | ✅ fait (`terms.html` §6bis) |
| Renonciation expresse au délai de rétractation (case dédiée, non pré-cochée) | ✅ fait (`PlaylistSaleImmersivePreview.tsx`) |
| Politique de non-remboursement explicite | ✅ fait (`refund.html` §3bis) |
| Statut vendeur = particulier, aucun champ SIRET/TVA affiché | ✅ déjà conforme (rien à retirer) |
| Pas de collecte de TVA sur l'échange entre particuliers | ✅ déjà conforme (Loki n'encaisse jamais) |
| RGPD — mention du paiement dans la politique de confidentialité | ✅ fait (`privacy.html` §6bis) |
| RGPD — registre des traitements / DPA formel | ❌ non fait — nécessite un professionnel |
| PayPal end-to-end réellement câblé (webhook, capture, SCA) | ❌ n'existe pas — lien externe + confirmation manuelle (voir 9.2) |
| Conformité Apple/Google IAP | ❌ **risque actif** — flag marketplace à 100% en prod alors que sa propre description dit le contraire (voir 9.3) |
| Obligations DAC7 (récap annuel, seuils 2000€/30 transactions) | ❌ non implémenté — chantier technique à planifier (voir 9.6) |
| Risque SACEM/droit voisin sur la vente de sélections | ⚠️ atténué mais pas éliminé — relecture avocat recommandée |

Sources : [App Review Guidelines §3.1.1](https://developer.apple.com/app-store/review/guidelines/) ·
Code de la consommation articles L221-18, L221-28 13° · code du dépôt cité
ligne par ligne ci-dessus (vérifié le 21/09/2026, requête directe en
production via l'API Management Supabase).
