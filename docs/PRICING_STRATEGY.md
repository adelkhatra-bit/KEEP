# Stratégie tarifaire KEEP

Étude réalisée le 2026-08-21. Objectif du cahier des charges : **prix bas +
volume mondial + viralité + coûts maîtrisés**. Toutes les valeurs ci-dessous
sont des **valeurs de démarrage**, saisies dans
`supabase/migrations/0007_seed_defaults.sql`, et **100% modifiables depuis le
Super Admin** une fois construit (§48) — rien n'est codé en dur côté app.

## Comparables étudiés

| Produit | Catégorie | Free | Payant |
|---|---|---|---|
| **Soundiiz** | Transfert/gestion de playlists | 200 titres/conversion, 1 sync, IA limitée | Premium $5/mois ($39/an) · Creator $9.50/mois ($75/an) |
| **TuneMyMusic** | Transfert de playlists | 500 titres | Premium $4.50/mois (ou $24 à l'année, soit $2/mois) |
| **AudD** (coût provider, pas un comparable produit) | Reconnaissance musicale | 300 requêtes | $5/1 000 requêtes |

Constat : le marché du "playlist management" se vend **$2 à $9,50/mois**. KEEP
apporte plus de valeur (reconnaissance temps réel + apprentissage + réseau
social musical + événements), ce qui justifie un positionnement Premium
légèrement au-dessus de Soundiiz tout en restant très accessible.

## Grille proposée (marché de lancement : France, EUR)

| Plan | Mensuel | Annuel | Pour qui |
|---|---|---|---|
| **FREE** | 0 € | 0 € | Découverte + viralité — 150 GARDER/mois, 1 provider, 3 comparaisons/mois, 100 follows |
| **PREMIUM** | 4,99 € | 39,99 € (≈3,33 €/mois) | Usage illimité, historique complet, jusqu'à 3 providers, essai 7 jours |
| **CREATOR PRO** | 9,99 € | 79 € | DJ/artistes/créateurs — analytics, événements (jusqu'à 10/mois), essai 14 jours |
| **VENUE PRO** | 29 € | 279 € | Clubs/bars/hôtels — événements illimités, QR, analytics de fréquentation, essai 14 jours |

### Logique de conversion Free → payant

Le quota FREE (150 GARDER/mois) est calibré pour laisser un utilisateur actif
(2-5 GARDER/jour) largement dans les clous la plupart des mois, tout en
créant une limite naturelle pour l'auditeur intensif ou l'utilisateur
multi-provider — cas où PREMIUM devient pertinent. Les comparaisons limitées
(3/mois) créent un point de friction sur la fonctionnalité la plus virale
(Compare nos KEEP), incitant à l'upgrade au moment où la valeur sociale est
la plus visible.

### Maîtrise des coûts

Le coût variable dominant identifié est la reconnaissance musicale (AudD,
~$5/1 000 requêtes — voir `docs/MUSIC_RECOGNITION_PROVIDERS.md`). Le quota
FREE plafonne ce coût par utilisateur gratuit ; ce plafond est ajustable
depuis Super Admin sans déploiement (`usage_limits.limit_key =
'keeps_per_month'`).

## Ce qui reste à faire avant un lancement commercial réel

- Ajouter les prix USD/GBP/AED une fois ces pays activés (§48) — ne jamais
  déduire un prix par conversion automatique de devise sans validation
  humaine (risque de prix incohérents localement).
- Valider les taux de commission Apple/Google réels (généralement 15-30 %
  selon le programme et l'ancienneté du compte développeur) pour affiner la
  marge nette affichée en Super Admin (§50).
- Chiffrer un devis ACRCloud réel avant d'envisager un changement de
  provider de reconnaissance à volume.

## Sources

- [Soundiiz — Pricing & Plans](https://soundiiz.com/pricing)
- [Tune My Music — Help / pricing](https://www.tunemymusic.com/help)
- [AudD pricing](https://audd.io/resources/articles/music-recognition-api-pricing.html)

---

## Reprises sociales GRATUITES — décision d'Adel du 05/10/2026 (CANONIQUE, complète et corrige la ligne « GARDER : −3 »)

- **Garder une musique rendue PUBLIQUE par un autre membre (depuis son profil ou sa story) est GRATUIT** : aucun FREE débité. La musique est marquée du nom du **premier découvreur** ; l'utilisateur la garde en Public ou en Privé.
- **Partager une musique d'un autre dans MA story est GRATUIT** et ne demande même pas de la garder (publicité pour le premier découvreur, qui reste identifié).
- **Restent payants** : les musiques en vente (PayPal ou FREE selon l'offre), la reconnaissance au-delà du quota, un GARDER issu d'une écoute (`listen`) ou de Loki Pulse (−3).
- Implémentation : RPC `keep_commit_social_free_decision` (plafond 200/24 h) et `keep_pin_shared_story_track` ; contrat `creditRules.socialFreeKeep` / `shareToOwnStoryIsFree`.

## Économie FREE — décision d'Adel du 04/10/2026 (CANONIQUE)

> **Statut : DÉCIDÉ — À IMPLÉMENTER.** Toute IA (Claude Code, Codex, ChatGPT,
> Claude Design) qui touche aux écoutes, aux FREE, aux recharges, au
> parrainage ou aux abonnements DOIT suivre cette section. Elle complète
> `docs/KEEP_MASTER_SPEC.md` §2 ; tant que le code n'est pas livré, les valeurs
> actuelles de `config/keep-product-contract.json > creditRules` restent en
> vigueur. **L'implémentation doit modifier le contrat ET le code dans le même
> commit** (`changeProtocol.updateContractAndGuardsInSameCommitWhenAProductRuleChanges`).
> Toutes les valeurs chiffrées sont des valeurs de départ, réglables depuis le
> Super Admin (`remote_config` / `usage_limits`), jamais codées en dur.

### Pourquoi (audit réel du 04/10/2026, mode RÉEL)

- 17 comptes, 13 FREE, 4 formules « payantes » **toutes offertes par l'admin
  (`source = admin_grant`) : 0 € encaissé**.
- Aucune recharge achetable n'existe : seulement 3 abonnements
  (`store_products`), pas encore créés côté App Store Connect au 15/09.
- Une écoute qui passe par un moteur payant (ACRCloud, AudD optionnel) nous
  coûte de l'argent ; une écoute ShazamKit / mémoire Loki / lien partagé ne
  coûte rien (`musicRecognitionArchitecture.providerOrder`).
- Écoute continue : jusqu'à 12 envois/minute/appareil
  (`keep-music-recognition-v2 > allowRecognition`) même quand le même morceau
  joue encore → coût inutile.
- Bugs qui font payer pour rien (à corriger avant tout, voir
  `docs/ERROR_LEDGER.md`) : seuil ACRCloud `minAcrScore = 55` qui rejette des
  bons résultats déjà payés (scores 22-49 observés sur de vrais titres) ;
  `mpg123-decoder: -1 MPG123_ERR` ~1 000 fois/24 h (audio M4A/AAC iPhone et
  extraits iTunes décodés comme du MP3) ; `nativeShazamRecognition.ts` avale
  toutes les erreurs ShazamKit sans diagnostic → impossible de savoir si
  ShazamKit marche en TestFlight.
- Réglages morts (affichés mais jamais lus par le code, vérifié le
  04/10/2026) : `guest_recognition_limit` et `signup_bonus_recognitions`. Les
  invités ne sont donc limités que par le rate-limit 12/min. À brancher côté
  serveur (jamais côté client).
- Super Admin > Clés & intégrations : la clé AudD est refusée par AudD
  (#900/#901 ou message « authorization ») mais l'écran n'affiche pas le code
  d'erreur AudD exact → afficher `error_code` + message fournisseur sous le
  champ. Vérifier aussi que `/admin-preview/` publié correspond à
  `packages/admin/pages/integrations.tsx` (retour par ligne « REFUSÉE — … ») :
  la version publiée affiche l'erreur en bannière en haut de page, loin du
  bouton.
- Appliqué en base le 04/10/2026 (demande explicite d'Adel) :
  `referral_monthly_free_cap` 40 → 20 (tracé dans `audit_logs`).

### Principe produit (modèle « Duolingo de la musique »)

**Ce qui ne nous coûte rien est illimité et addictif. Ce qui nous coûte est
rare et se paie en FREE.** On ne paie jamais pour « avoir le droit » d'aimer
la musique : on paie pour aller plus loin, plus vite.

Benchmark : SoundHound freemium = 5 recherches gratuites/mois puis payant ;
Duolingo = cœurs limités + série (streak) + gemmes gagnées en jouant, 4 % des
actifs paient (TechCrunch 03/05/2021).

### 1. Écoutes

| Formule | Écoutes incluses / jour | Au-delà |
|---|---|---|
| Invité (sans compte) | 3 au total (`guest_recognition_limit`, avant 20) | créer un compte |
| FREE | 5 | **1 FREE par écoute réussie** |
| PREMIUM | 30 | 1 FREE par écoute |
| CREATOR PRO | 60 | 1 FREE par écoute |
| VENUE PRO | 150 + mode Soirée | 1 FREE par écoute |

- Une écoute n'est décomptée **que si un morceau est trouvé** (jamais pour
  « rien trouvé »).
- Écoute continue : une fois un morceau reconnu, **aucun nouvel envoi avant la
  fin estimée du morceau** ; aucun envoi si l'extrait est silence/bruit ;
  maximum 1 envoi / 20 s.
- Côté serveur uniquement (jamais un compteur client contournable) :
  `feature_usage_counters` avec `feature_key = 'LISTEN_DAILY'`,
  `period_key = YYYY-MM-DD` (fuseau du profil), même modèle que
  `keep_consume_download_credit()` ; limites via `keep_plan_limit(plan,'listens_per_day')`.
- Bonus d'inscription : 5 (`signup_bonus_recognitions`, avant 20).

### 2. Gagner des FREE (boucles d'engagement)

| Action | Gain | Plafond |
|---|---|---|
| Bonus mensuel de la formule | FREE 5 · PREMIUM 30 · CREATOR 40 · VENUE 100 | existant |
| Série quotidienne (ouvrir Loki + 1 action) | +1 / jour, +5 au 7ᵉ jour | cycle de 7 jours |
| Victoire Battle | existant (`battle_win_free_credits`) | existant |
| Parrainage (lien d'affiliation perso) | +2 par inscrit validé | 20 / mois (avant 40) |
| Premier découvreur : ta découverte est GARDÉE par quelqu'un | +1 | 20 / mois |
| Paliers d'abonnés | existant (`growth_followers_reward_*`) | existant |

- **Gel de série** (protège la série un jour manqué) : réservé aux abonnés,
  1 / mois. C'est le déclencheur d'abonnement n°1.
- Les cadeaux manuels du Super Admin (crédits ou formules) ont **toujours une
  date d'expiration**.

### 3. Dépenser des FREE

- GARDER : −3 (inchangé, `creditRules.KEEP`).
- Écoute au-delà du quota du jour : −1.
- Packs de solos Battle : existants (`battle_solo_pack_small_free` /
  `battle_solo_pack_large_free`).
- Solde **calculé depuis l'historique d'événements**, jamais réinitialisé
  (`userContentProtection`).

### 4. Recharges FREE (achats intégrés consommables Apple / Google)

| Produit | Contenu | Prix FR |
|---|---|---|
| `com.adelkhatra.keep.free.30` | 30 FREE | 0,99 € |
| `com.adelkhatra.keep.free.100` | 100 FREE | 2,49 € |
| `com.adelkhatra.keep.free.300` | 300 FREE | 5,99 € |

Crédit uniquement après vérification serveur du reçu (`keep-iap-verify`),
idempotent par transaction. Pas de Stripe/Paddle pour l'app (décision QR
ci-dessous : pas de vente sur le web).

### 5. Design / marketing — l'utilisateur doit comprendre en 3 secondes

Respecter `uxInteractionRules` (contraste, 1 clic, aide compacte).

- **Badge FREE** visible (profil + Écouter) → 1 clic ouvre **« Mes FREE »** :
  1. Solde + historique (gagné / dépensé, daté).
  2. **Gagner** : cartes Série · Battle · Parrainer (bouton « Copier mon lien »
     + partage natif) · Premier découvreur.
  3. **Recharger** : les 3 packs avec prix Apple/Google affichés.
  4. **Solos** : packs de solos.
  5. **Passer Premium** : 30 écoutes/jour, +30 FREE/mois, gel de série, sans pub.
- Écran Écouter : compteur discret « 3/5 écoutes aujourd'hui ».
- Moment de vente = quand le morceau joue et le quota est à 0 :
  « Plus d'écoute aujourd'hui — 1 FREE pour découvrir ce morceau » ·
  [Utiliser 1 FREE] [Recharger] [Premium]. Jamais de bouton masqué, prix
  toujours affichés, aucun mécanisme de hasard payant (règles App Store 3.1.1).
- Onboarding : 3 cartes — « Écoute & découvre » · « Gagne des FREE » ·
  « GARDE ta musique ».

### 6. Accès ordinateur — QR uniquement (décision 04/10/2026)

Loki est une app d'abord. **Pas de connexion directe sur ordinateur** : l'écran
ordinateur s'ouvre uniquement par QR code scanné et approuvé depuis l'app
(`keep-web-pairing`, tables `web_pairings` / `web_companion_sessions`). Pas de
nom de domaine à acheter (GitHub Pages). Conséquences à implémenter :
retirer le formulaire pseudo/mot de passe du web public, faire ouvrir l'app
par les liens « mot de passe oublié », aucun paiement web. Audit du 04/10 :
23 QR créés, **0 approuvé** → le scan/approbation côté app est à réparer en
priorité. Le Super Admin (`/admin-preview/`) n'est pas concerné.

### 7. Ordre d'implémentation

1. Corriger les 3 bugs de reconnaissance (seuil ACRCloud, décodage M4A,
   diagnostic ShazamKit) — sinon on limite un service qui marche mal.
2. Compteur d'écoutes serveur + écran « Mes FREE » + compteur Écouter.
3. Série quotidienne + gel de série + parrainage plafonné + gain premier
   découvreur.
4. Produits consommables + abonnements dans App Store Connect / Play Console,
   puis branchement `keep-iap-verify`.
5. Mise à jour `config/keep-product-contract.json > creditRules` et des
   gardes CI dans le même commit que le code ; preuves sur 390×844 et 1440×900.

> **Clause à reprendre dans les CGU (Adel 05/10/2026)** : toute musique reprise gratuitement depuis le profil ou la story d'un membre reste associée au nom du **premier découvreur** (affiché « Découvert par @… »). Une collection en vente donne accès à la **sélection d'écoute** d'un membre ; l'acheteur n'achète pas les titres eux-mêmes (« Tu achètes son écoute, pas les titres »).

## Communauté musicale & concours de story — BROUILLON MARKETING (Adel, 05/10/2026 — IDEA-100, à valider avant publication)

> Statut : **BROUILLON** à valider par Adel. Aucun texte ci-dessous n'est encore dans l'app ni dans les conditions publiées.
> Base technique déjà livrée : classement 7 jours (`keep_story_ranking` : 1 pt par partage en story, 3 pts par reprise de sa musique, 2 pts par nouvel abonné ; top 50), badges 🥇🥈🥉 (top 3) et ⭐ (top 10) sur la bulle, vues de story détaillées (temps, chapitres, écoute).

**Promesse (une phrase)** : « Plus tu partages ta musique, plus ta communauté grandit : ceux qui te suivent écoutent ce que tu aimes, et tu peux leur conseiller tes soirées, tes événements et tes lieux préférés. »

**Les 4 avantages à expliquer aux utilisateurs**
1. **Ton historique** : tout ce que tu as découvert et partagé reste dans ton profil (reportage de ton goût musical).
2. **Ta communauté** : chaque abonné et chaque reprise de ta musique la fait grandir ; tu vois qui t'écoute, combien de temps, jusqu'où (stats de story).
3. **Le concours de story** : chaque semaine, les membres qui partagent le plus, font le plus reprendre leur musique et gagnent le plus d'abonnés montent au classement ; la médaille ou l'étoile s'affiche sur leur bulle, donc ils sont plus vus.
4. **Des options qui se débloquent** : plus la communauté grandit, plus de fonctions s'ouvrent (paliers d'abonnés existants `growth_followers_reward_*`) ; la communauté peut ensuite suivre ses conseils pour des soirées, événements et établissements.

**Règles du concours (proposition)**
- Période : 7 jours glissants, recalculé en continu ; classement visible par la médaille/étoile sur la bulle.
- Points : voir ci-dessus ; seuls les profils publics et non masqués de la découverte comptent ; minimum 3 points pour apparaître.
- Loyauté : un partage compte une fois par musique ; les reprises et abonnements d'un compte à lui-même ne comptent pas ; Loki Music peut retirer des points en cas d'abus (faux comptes, échanges de reprises).
- Récompenses : visibilité (badge, place dans la rangée) ; aucune promesse de gain d'argent. Toute récompense en FREE doit passer par `docs/PRICING_STRATEGY.md > Économie FREE` et rester réglable depuis le Super Admin.

**Clause pour les conditions des offres (proposition)** : « Le classement des stories est calculé sur les 7 derniers jours à partir de tes partages, des reprises de ta musique par d'autres membres et de tes nouveaux abonnés. Les badges de classement sont informatifs ; Loki Music peut corriger ou retirer un classement obtenu par des moyens abusifs. »

**À décider par Adel** : récompense concrète (FREE ? mise en avant ?), badge pour tous ou seulement certaines formules, texte exact des conditions, emplacement du récapitulatif dans Offres (carte « Ta communauté »).

**Boucles d'engagement proposées (IDEA-103, brouillon)** — gratuites pour tous au départ, les formules payantes donnent « la même chose en plus confortable » plus tard :
1. **Verrou à débloquer** : le 🔒 de ton badge (première récompense en 3 points) ; chaque action visible rapproche d'un palier.
2. **Progression visible** : « il te manque N points », classement de la semaine, médaille sur ta bulle.
3. **Retour quotidien** : story 24 h (chronomètre), série quotidienne (+FREE, à implémenter), robot qui salue sans harceler (plafonds par jour).
4. **Communauté** : abonnés, reprises, vues détaillées de ta story ; plus elle grandit, plus d'options se débloquent (paliers `growth_followers_reward_*`).
5. **Garde-fous** : jamais de pression excessive (messages plafonnés), aucune récompense d'argent promise, le classement reste lisible et corrigeable en cas d'abus.
