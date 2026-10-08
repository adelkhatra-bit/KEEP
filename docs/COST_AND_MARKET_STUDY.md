# Étude coûts API, marché et rentabilité — Loki Music / KEEP

Date : 05/10/2026. Statut : étude de cadrage, **aucune décision appliquée** (aucun code, contrat ni donnée modifié).
Sources internes lues : `docs/PRICING_STRATEGY.md` (dont « Économie FREE — 04/10/2026 »), `config/keep-product-contract.json`, `docs/KEEP_MASTER_SPEC.md`, `CLAUDE.md`, code des fonctions Supabase et de `packages/mobile/src/services`.

Légende : **[VÉRIFIÉ]** = lu sur la source citée le 05/10/2026 ; **[CODE]** = lu dans le dépôt ; **[HYPOTHÈSE]** = estimation à confirmer avec de vraies données.

---

## 1. Inventaire des API externes (reconnaissance, extraits, catalogue)

Ordre de la cascade d'écoute (contrat `musicRecognitionArchitecture.providerOrder` : ShazamKit, ACRCloud, AudD optionnel) [CODE] :
mémoire Loki (gratuite) -> ShazamKit natif -> ACRCloud (payant) -> AudD (désactivé) -> source sans clé (iTunes/Deezer).
Orchestration client : `packages/mobile/src/services/keepMusicCoreRecognition.ts` (mémoire en premier ~l.590, ACRCloud ~l.617-624, `AUDD_PRIMARY_ENABLED = false` l.24-27).

| API | Usage | Fichier propriétaire | Payant ? | Cache | Limite / quota |
|---|---|---|---|---|---|
| **ACRCloud** | Reconnaissance par empreinte, moteur serveur principal | `supabase/functions/keep-music-fallback/index.ts` (appel l.379 ; secrets l.343-345 ; code 3003 = quota épuisé l.392-411 ; seuils de score l.233-235) | **Oui** (par requête, voir §2) | Aucun cache de réponse ; seulement mémoire d'empreintes en amont | Serveur : 1 appel / 20 s / identité (`service_allow_recognition`, l.68-71). Client : écart 20 s (`PAID_PROVIDER_MIN_GAP_MS`), pause 6 h si 3003 (`FALLBACK_QUOTA_RECHECK_MS`) |
| **AudD** | Reconnaissance, secours optionnel (désactivé : clé refusée) | `keep-music-recognition-v2/index.ts` (appel l.287 ; limite 1/20 s l.86-93) ; `packages/music/src/providers/AudDRecognitionProvider.ts` | **Oui** | Non | Idem 1/20 s ; détection quota 402 |
| **ShazamKit** | Reconnaissance native iOS, 1er palier après mémoire | `packages/mobile/src/services/nativeShazamRecognition.ts` | Aucun tarif trouvé sur la page Apple [VÉRIFIÉ, absence non prouvante] | n/a | Pas de quota visible ; erreurs encore peu diagnostiquées (ERROR_LEDGER) |
| **Mémoire Loki** (empreintes maison) | Reconnaissance gratuite mutualisée entre tous les utilisateurs | `keep-music-memory/index.ts` (limite 12/min l.45) ; ensemencement `_shared/fingerprintSeed.ts` (`seedInBackground`, l.172) | Non (coût = Supabase) | C'est le cache | 12 requêtes/min/identité |
| **iTunes Search / Lookup** | Extraits 30 s, jaquettes, confirmation de titre | `trackPreviewResolver.ts` (l.37), `keep-music-core`, `keep-music-recognition-v2` (l.149), `keep-music-keyless-source` (l.380-391), `keep-battle-catalog-seed/refresh`, `keep-world-catalog-expand`, `keep-pulse-catalog-expand` | Gratuit, sans clé [CODE] | Client : mémoire 6 h (positif) / 60 s (négatif) mais **perdue à chaque redémarrage** (`trackPreviewResolver.ts` l.3-7) | Limite de débit Apple non vérifiée ; cron catalogue toutes les minutes (`20261001024000_battle_catalog_supabase_cron.sql`) |
| **Deezer (API publique)** | Extraits, confirmation, lecture ISRC | `keep-music-fallback` (l.180), `keep-music-keyless-source` (l.386-397), `keep-music-recognition-v2` (l.172) | Gratuit, sans clé pour la recherche publique [CODE] | Non | Non vérifiée ; sources sans clé limitées à 24/min/identité (`keep-music-keyless-source` l.299) |
| **Spotify Web API** | Import de la bibliothèque connectée de l'utilisateur (OAuth) ; liens `open.spotify.com` | `packages/backend/src/lib/connectedMusicLibrary.ts`, `routes/musicConnections.ts` | Gratuit, mais soumis à quotas/conditions Spotify (non vérifiés) | Non | Non vérifiée |
| **YouTube** | Liens de recherche, `oembed` pour les métadonnées d'un lien partagé | `keep-music-keyless-source` (l.338, 470), `keep-music-fallback` (l.299) | Gratuit (aucune API Data v3 payante trouvée) | Non | n/a |
| **Apple MusicKit / Apple Music API** | Connexion bibliothèque utilisateur | `packages/music/src/providers/AppleMusicProvider.ts`, `appleMusicAuthHtml.ts` | Inclus dans le compte développeur [HYPOTHÈSE] | Non | n/a |
| **MusicBrainz** | Liste de genres (taxonomie) | `keep-music-taxonomy/index.ts` (l.36) | Gratuit | Ponctuel | Non vérifiée |
| **Brevo / e-mail** | E-mails d'authentification (hors périmètre musique) | `keep-auth-email` | Hors étude | | |

Constats importants [CODE] :
1. **Seuls ACRCloud (et AudD, éteint) coûtent de l'argent à l'appel.** Tout le reste est sans clé.
2. **Le décompte FREE ne se fait que sur reconnaissance réussie** (`creditRules.listenCountsOnlyOnSuccessfulRecognition`), alors que le fournisseur facture vraisemblablement **chaque requête, y compris sans correspondance** (AudD le dit explicitement : « per request »). Les « rien trouvé » sont donc un coût non couvert.
3. Les réglages `guest_recognition_limit` et `signup_bonus_recognitions` ont été signalés comme jamais lus (PRICING_STRATEGY, audit 04/10) : les invités ne sont limités que par 1 appel / 20 s.
4. Le cache d'extraits (`previewCache`) est local à l'appareil et volatil ; il n'y a pas de cache serveur partagé par ISRC pour les recherches iTunes/Deezer faites à la demande.
5. Incohérence de prix à trancher : seed `0007_seed_defaults.sql` = Premium 4,99 EUR/mois (39,99 EUR/an) ; migration `0030_premium_launch_price_2_99.sql` = **2,99 EUR/mois** ("source de vérité fonctionnelle"). Le prix réellement en base n'a pas été lu (lecture Supabase non effectuée).

---

## 2. Tarifs publics et marché

### Fournisseurs de reconnaissance
- **AudD** [VÉRIFIÉ, audd.io/resources/articles/music-recognition-api-pricing.html, 05/10/2026] : 300 requêtes gratuites ; **5 USD / 1 000 requêtes** en paiement à l'usage, remises jusqu'à ~2 USD / 1 000 à grande échelle ; forfaits 450 / 800 / 1 800 USD par mois pour 100 000 / 200 000 / 500 000 requêtes (soit 4,50 / 4,00 / 3,60 USD pour 1 000). ISRC et score réservés au plan « Startup » ou supérieur.
- **ACRCloud** [VÉRIFIÉ en partie, acrcloud.com/music-recognition/, 05/10/2026] : essai gratuit 14 jours sans carte ; base de plus de 150 millions de titres ; **la grille tarifaire n'est pas publique sur le site** (page /pricing/ renvoie à l'accueil, « Contact Sales »). Un extrait de forum (Stack Overflow, non fiable) cite ~6 USD / 1 000 : **non vérifié**. Un message Reddit indique qu'une clé d'essai peut être plafonnée à 1 000 requêtes/jour : **non vérifié**. À obtenir : devis réel (déjà demandé dans PRICING_STRATEGY).
- **ShazamKit (Apple)** [VÉRIFIÉ, developer.apple.com/shazamkit/] : nécessite d'activer le service ShazamKit dans Certificates, Identifiers & Profiles ; la page ne mentionne aucun tarif ni quota (absence d'information, pas une garantie de gratuité illimitée).

### Concurrents / références pour positionner les offres
- **SoundHound** [VÉRIFIÉ, support.soundhound.com, 05/10/2026] : « aucun frais ni abonnement », gratuit ; option **SoundHound Infinity = achat unique**, sans abonnement mensuel, pour retirer la publicité. Un site tiers (r-tt.com, non vérifié) cite 6,99 USD. Le repo cite aussi « 5 recherches gratuites/mois » : **contradictoire avec la page officielle actuelle, à ne plus utiliser comme argument**.
- **Shazam** : application gratuite (connaissance générale, non revérifiée aujourd'hui) -> la reconnaissance seule ne se vend pas ; elle est un produit d'appel.
- **Gestion de playlists** [déjà dans PRICING_STRATEGY, étude du 21/08/2026, non revérifiée aujourd'hui] : Soundiiz 5 USD/mois (Premium) et 9,50 USD/mois (Creator) ; TuneMyMusic 4,50 USD/mois ou 24 USD/an.
- **Duolingo** : 4 % d'utilisateurs actifs payants (TechCrunch 03/05/2021, cité dans le repo, non revérifié) : seule référence de conversion disponible ; c'est une **borne optimiste** pour une app de niche.
- **Non trouvé** : tarifs d'apps de découverte musicale sociale directement comparables. Aucun chiffre n'est avancé.

### Conclusion de positionnement
La reconnaissance seule est gratuite chez les leaders ; payer pour « plus d'écoutes » est donc le levier le plus fragile. Ce qui est défendable : le réseau social/GARDER, Battle/Solo, événements et outils créateur/lieu (VENUE_PRO, CREATOR_PRO). Les écoutes doivent rester un coût maîtrisé, pas l'argument de vente principal.

---

## 3. Modèle de rentabilité (EUR uniquement)

### Offres dans le dépôt [CODE]
FREE 0 EUR ; PREMIUM 4,99 EUR/mois (39,99 EUR/an) ou 2,99 EUR/mois (migration 0030) ; CREATOR_PRO 9,99 EUR/mois (79 EUR/an) ; VENUE_PRO 29 EUR/mois (279 EUR/an). Recharges FREE : 30 FREE = 0,99 EUR ; 100 FREE = 2,49 EUR ; 300 FREE = 5,99 EUR (`keep_iap_free_products`, `20261005000500_iap_free_recharges.sql`). Les packs de Solos Battle sont payés en FREE, **sans prix en EUR dans le dépôt**. Aucun encaissement réel à ce jour (4 formules payantes sur 17 comptes, toutes `admin_grant`, audit 04/10).

### Hypothèses (toutes à remplacer par de la mesure)
- H1 : coût d'une requête payante = **0,005 EUR** (5 USD/1 000 AudD, USD assimilé à EUR par prudence) ; fourchette testée 0,002 à 0,006 EUR. Le tarif ACRCloud réel est inconnu.
- H2 : requêtes payantes par écoute réussie r = **2** (les échecs et nouvelles fenêtres sont facturés).
- H3 : part p des écoutes qui atteignent un moteur payant (après mémoire Loki + ShazamKit) = **40 %** aujourd'hui ; objectif 15 %.
- H4 : TVA française 20 % retirée du prix TTC, puis commission Apple 15 % (Small Business Program <= 1 M USD de recettes, **[VÉRIFIÉ]** developer.apple.com/app-store/small-business-program/ ; 15 % aussi pour les abonnements après la 1re année) ou 30 % sinon. Le taux de TVA et le mode de calcul des « proceeds » Apple sont **à confirmer par le comptable**.
- Coûts fixes (Supabase, EAS, domaine) **non inclus** : plan Supabase réel non lu.

### Revenu net par vente (après TVA 20 % puis commission)
| Offre | Prix TTC | Net à 15 % | Net à 30 % |
|---|---|---|---|
| PREMIUM (si 4,99) | 4,99 | 3,53 | 2,91 |
| PREMIUM (si 2,99) | 2,99 | 2,12 | 1,74 |
| CREATOR_PRO | 9,99 | 7,08 | 5,83 |
| VENUE_PRO | 29,00 | 20,54 | 16,92 |
| Recharge 30 FREE | 0,99 | 0,70 | 0,58 |
| Recharge 100 FREE | 2,49 | 1,76 | 1,45 |
| Recharge 300 FREE | 5,99 | 4,24 | 3,49 |

Valeur nette d'un FREE vendu : 0,0234 EUR (pack 30) à 0,0141 EUR (pack 300) à 15 %. Coût d'une écoute payée en FREE : r x p x 0,005 = 0,004 EUR à H3=40 %. **Une écoute achetée avec 1 FREE reste rentable** dans tous les packs.

### Coût API mensuel par utilisateur (H1-H3, 30 jours, 0,005 EUR/requête)
| Profil | Écoutes/jour | Requêtes payantes/mois | Coût/mois |
|---|---|---|---|
| FREE usage léger | 3 | 72 | 0,36 EUR |
| FREE au quota (5/j) | 5 | 120 | 0,60 EUR |
| PREMIUM usage normal | 10 | 240 | 1,20 EUR |
| PREMIUM au quota (30/j) | 30 | 720 | 3,60 EUR |
| CREATOR_PRO au quota (60/j) | 60 | 1 440 | 7,20 EUR |
| VENUE_PRO au quota (150/j) | 150 | 3 600 | 18,00 EUR |

Lecture : **les quotas d'écoute inclus consomment presque toute la marge des abonnés si tout le quota est utilisé** (Premium 30/j : 3,60 EUR de coût contre 3,53 EUR net ; CREATOR_PRO 60/j : 7,20 contre 7,08 ; VENUE_PRO 150/j : 18,00 contre 20,54). Ce sont des plafonds théoriques ; l'usage réel est inconnu, mais ils montrent que le quota PREMIUM à 30/jour est dangereux au prix de 2,99 EUR (net 2,12 EUR < coût d'un usage modéré de 10/j).

### Seuil de rentabilité API (hors coûts fixes)
Un payant doit couvrir les gratuits. Avec conversion c (part des utilisateurs payants), le coût max par utilisateur gratuit est : `c x net / (1 - c)`.

| Conversion | PREMIUM 4,99 (net 3,53) | PREMIUM 2,99 (net 2,12) |
|---|---|---|
| 2 % | 0,07 EUR/gratuit/mois (~14 requêtes) | 0,04 EUR (~8 requêtes) |
| 4 % (réf. Duolingo, optimiste) | 0,15 EUR (~29 requêtes) | 0,09 EUR (~18 requêtes) |
| 8 % | 0,31 EUR (~61 requêtes) | 0,18 EUR (~37 requêtes) |

Comparer au coût actuel estimé d'un utilisateur FREE : 0,36 à 0,60 EUR/mois. **Au rythme de 5 écoutes/jour et 40 % de requêtes payantes, aucune conversion réaliste ne couvre les gratuits.** Il faut descendre vers **~1 requête payante par jour et par gratuit** (<= 30/mois), soit un facteur 4 à 5 de réduction.
Nombre d'abonnés pour couvrir un parc de N gratuits : N x coût_gratuit / net. Exemple : 10 000 gratuits à 0,36 EUR = 3 600 EUR/mois = ~1 020 PREMIUM à 4,99 EUR (10,2 % de conversion) ou ~1 700 à 2,99 EUR (17 %). Avec l'objectif p = 15 % (0,135 EUR/gratuit) : 1 350 EUR/mois = ~380 PREMIUM à 4,99 EUR (3,8 %). Les VENUE_PRO (20,54 EUR net) sont les plus efficaces : ~66 lieux couvrent 1 350 EUR.

Sensibilité au coût unitaire : à 0,002 EUR/requête, tous les coûts ci-dessus sont divisés par 2,5 ; à 0,006 EUR, multipliés par 1,2.

---

## 4. Leviers concrets de réduction de coût

| # | Levier | Impact estimé | Risque |
|---|---|---|---|
| 1 | **Corriger les 3 bugs de reconnaissance avant tout** (seuil ACRCloud 55 -> 40 déjà en code ; décodage M4A/AAC `mpg123` ; diagnostic ShazamKit) | Supprime les doubles paiements pour un même morceau et l'ensemencement raté de la mémoire ; fort | Faible (déjà identifiés, ledger) |
| 2 | **Mémoire d'empreintes d'abord, déjà en place** : ensemencer à chaque match, y compris par ShazamKit natif (aujourd'hui `seedInBackground` couvre les moteurs serveur) ; objectif p de 40 % à 15-20 % | Réduit de moitié ou plus le coût par utilisateur ; fort, croissant avec la base | Moyen : faux positifs de mémoire (déjà protégé par l'écart 1er/2e candidat) |
| 3 | **Cache serveur partagé par ISRC / (titre, artiste) normalisés** pour extraits, jaquettes et liens (table du catalogue `service_catalog_track_from_recognition`), au lieu du cache volatile par appareil | Moins d'appels iTunes/Deezer (gratuits mais limités par débit) ; moyen | Faible ; invalider les URLs d'extraits expirées |
| 4 | **Aucun envoi tant que le morceau joue** (fin estimée), silence/bruit filtré, 1 envoi / 20 s (décidé le 04/10) ; poursuivre : pas de nouvel appel payant dans la fenêtre « collante » déjà codée (3 min) | Évite des dizaines d'appels en écoute continue ; fort | Faible |
| 5 | **Facturer ou limiter les « sans correspondance »** : plafond journalier d'appels payants par compte (distinct du décompte de réussites) | Ferme la fuite signalée au §1 ; moyen à fort | Moyen : frustration si la capture ambiante est mauvaise ; compenser par un rappel « rapproche le micro » |
| 6 | **Brancher les limites invités côté serveur** (3 écoutes au total, `guest_recognition_limit`) | Supprime l'exposition gratuite non authentifiée ; fort contre les abus | Faible |
| 7 | **Quotas par formule revus** : PREMIUM 30/j trop haut à 2,99 EUR ; envisager 15/j ou un quota mensuel partagé avec le solde FREE | Protège la marge abonnés ; fort | Moyen : perception de valeur ; à tester |
| 8 | **Extraits iTunes / Deezer gratuits en repli et pour la lecture** (déjà le cas) ; ne jamais passer par un moteur payant pour un titre déjà dans le catalogue Loki | Évite 100 % du coût pour les titres connus ; fort | Faible |
| 9 | **File d'attente / lissage** : regrouper les appels payants (pas plus de N/min global) et refuser proprement au-delà, avec message d'attente | Plafonne la facture mensuelle (budget dur) | Moyen : latence perçue |
| 10 | **Budget dur et alerte** : seuil mensuel dans `remote_config` ; au-delà, basculer en mémoire + ShazamKit + sans clé seulement (mode dégradé) ; `3003` déjà géré par une pause de 6 h | Garantit qu'aucune facture ne dérape | Faible ; prévoir l'affichage Super Admin |
| 11 | **Négocier / changer de palier** : forfait mensuel AudD (3,60 à 4,50 USD/1 000 selon volume, **[VÉRIFIÉ]**) ou devis ACRCloud ; comparer avec le volume réel mesuré | Gain de 10 à 60 % sur le coût unitaire selon le volume | Moyen : changement de fournisseur = tests de précision |
| 12 | **Pépites sans surcoût** : s'appuyer sur le catalogue communautaire (titres GARDÉS, partages sociaux, imports Spotify/Deezer/Apple des utilisateurs, crons iTunes/Deezer déjà en place) plutôt que sur la reconnaissance payante pour grossir le catalogue | Croissance du catalogue à coût quasi nul ; fort | Moyen : qualité et droits des extraits ; respecter les conditions des API |

Ordre conseillé : 1, 6, 4, 2, 3, puis 5, 10, 7, enfin 11 une fois que l'on dispose de la télémétrie.

---

## 5. Décisions à prendre par Adel

1. **Prix PREMIUM réel : 2,99 EUR ou 4,99 EUR ?** (le dépôt contient les deux ; à 2,99 EUR le quota 30 écoutes/jour n'est pas tenable.)
2. Quota d'écoutes inclus par formule : garder 5 / 30 / 60 / 150 ou réduire PREMIUM (levier 7).
3. Plafond de budget mensuel API en EUR et comportement au-delà (mode dégradé, levier 10).
4. Faire facturer / plafonner les écoutes « sans correspondance » ou les absorber (levier 5).
5. Choisir de demander un devis ACRCloud et/ou un forfait AudD, une fois les chiffres réels mesurés.
6. Appliquer la commission Apple 15 % : inscrire le compte développeur au Small Business Program (à faire avant les premières ventes).
7. Renseigner le RIB dans App Store Connect (« Accords, fiscalité et opérations bancaires »), puis créer les 3 abonnements et 3 recharges avec les identifiants `com.adelkhatra.keep.free.30/100/300` (étape 4 de l'ordre d'implémentation FREE).

Idées nouvelles émises dans cette étude (à inscrire dans `docs/IDEAS_INBOX.md` par l'agent principal si Adel les valide) : plafond d'appels payants incluant les « sans correspondance » ; budget mensuel API configurable avec mode dégradé ; cache serveur partagé par ISRC.

---

## 6. Ce qui n'a pas pu être vérifié

- **Tarif réel d'ACRCloud** (page non publique) : toute valeur ACRCloud est une hypothèse.
- Coûts réels constatés : aucun journal de facturation, aucun comptage des appels ACRCloud/AudD, ni taux de succès mémoire/ShazamKit/ACRCloud (aucune lecture de la base ou des journaux Supabase n'a été faite : règle « lecture seule d'abord » respectée en n'y touchant pas).
- Prix Premium actuellement en base (`plan_prices`) ; plan Supabase et coûts fixes.
- ShazamKit : absence de tarif sur la page Apple, mais conditions détaillées (limites, Android) non lues.
- Limites de débit d'iTunes Search, Deezer et Spotify (non lues dans la documentation officielle).
- Tarifs actuels de Soundiiz / TuneMyMusic (reprise de l'étude du 21/08/2026), prix de SoundHound Infinity (seule l'existence d'un achat unique est vérifiée), taux de conversion Duolingo (source de 2021).
- Taux de TVA et formule exacte des « proceeds » Apple pour la France ; conversion USD/EUR (assimilée 1:1 par prudence).
- Fiabilité de la capture ambiante (taux d'échec) : le ratio de requêtes par écoute réussie (r = 2) et la part payante (p = 40 %) sont des hypothèses à remplacer par de la télémétrie.
