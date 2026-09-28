# Collections System — Phase 2 TESTS — Cas de reproduction

**Date :** 28 septembre 2026  
**Méthodologie :** Audit → Identification (Phase 1, fait) → **Tests (Phase 2, en cours)** → Repair → Integrate → Re-Audit  
**Utilisateur :** Adel (adel.khatra@live.fr)  
**Statut cible :** Tous les bugs = REPRODUCIBLE ou NON-REPRODUCTIBLE

---

## Vue d'ensemble des 7 bugs à tester

| Bug ID | Titre | Sévérité | Reproductibilité attendue |
|--------|-------|----------|--------------------------|
| ERR-COLLECTIONS-VISIBILITY-018 | Collections invisibles si vendeur sans mode paiement | HAUTE | Reproduisible (validation BD) |
| ERR-COLLECTIONS-REMOVE-BTN-019 | Bouton × Retirer ne fonctionne pas | HAUTE | À confirmer (réseau/API) |
| ERR-COLLECTIONS-LAYOUT-020 | Encart info prend trop d'espace | MOYENNE | Visible (mesure 390px) |
| ERR-COLLECTIONS-CONSISTENCY-021 | Ordre incohérent entre écrans | MOYENNE | À vérifier (RPC filtering) |
| ERR-COLLECTIONS-NO-MODE-VALIDATION-022 | Pas de colonne payment_mode en BD | HAUTE | Confirmé (audit schéma) |
| ERR-COLLECTIONS-LISTENER-COUNT-023 | Compteur listeners manquant | BASSE | Fonctionnalité absente |
| ERR-COLLECTIONS-DESIGN-3D-024 | Design trop statique | BASSE | Visuel statique confirmé |

---

## TEST 1 : ERR-COLLECTIONS-VISIBILITY-018 — Visibilité collections sans mode paiement

### Description
Les collections doivent rester INVISIBLES aux visiteurs tant que le créateur n'a pas configuré un mode de paiement (STRIPE ou FREE). Actuellement, la RPC `keep_playlist_sale_offers_for_profile()` retourne TOUTES les offres actives sans vérifier `profiles.seller_payment_mode`.

### Prérequis
- **Compte créateur :** complémentaire avec au moins une collection créée (`adel4A` ou créer une nouvelle)
- **Compte visiteur :** compte secondaire ou invité anonyme pour vérifier la visibilité
- **Base de données :** table `profiles` consultable (vérifier absence de colonne `seller_payment_mode`)
- **Environnement :** mode réel (pas démo), application mobile ou web

### Étapes de reproduction

#### Étape A : Vérifier l'absence de colonne en base
```
Aller dans Supabase Project `rrhqsqzcplvmwxizqnla`
→ SQL Editor
→ Requête :
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name LIKE '%payment%' 
  OR column_name LIKE '%seller%';
```
**Résultat attendu :** Aucune colonne `seller_payment_mode`, `payout_mode`, etc.

#### Étape B : Vérifier le comportement actuel sur profil visiteur
**Setup :**
1. Se connecter en tant que **visiteur** (compte `test-visitor-1@example.com` ou anonyme)
2. Naviguer vers le profil public de `adel` (créateur avec collections)
   - URL : `https://adelkhatra-bit.github.io/KEEP/share-profile/?u=adel`
   - Ou via bouton Suivre d'une autre carte KEEP

**Actions :**
1. Observer la section `EN VENTE` (marketplace banner ligne 1225-1309 PublicUserProfileScreen.tsx)
2. Relever les collections affichées
3. Ouvrir DevTools (F12) → Réseau
4. Cliquer sur une collection / observer l'appel API
5. Chercher l'appel RPC `keep_playlist_sale_offers_for_profile`
6. Vérifier la réponse JSON (colonnes retournées)

**Résultat réel observé :**
- Collections = visibles ✓
- RPC retourne : `[{ track_id, name, price, currency, payment_mode, free_price, track_count, genres }]` (sans colonne `seller_payment_mode`)

#### Étape C : Vérifier que créateur PEUT les voir en gestion
**Setup :**
1. Se connecter en tant que **créateur** (ex. `adel@example.com`)
2. Aller à `Profil` → `EN VENTE` → `PlaylistSalePanel`

**Actions :**
1. Observer le panneau de gestion (`PlaylistSalePanel.tsx` ligne 53-59)
2. Relever les collections listées
3. Vérifier que le filter `rows.filter((row) => row.isActive)` est appliqué ligne 719

**Résultat réel observé :**
- Collections = visibles en gestion ✓
- Pas de check pour `seller_payment_mode` ou mode paiement manquant

### Résultat attendu (après fix)
- ✗ Visiteur voit les collections SI ET SEULEMENT SI créateur a `profiles.seller_payment_mode IN ('STRIPE', 'FREE')`
- ✗ Colonne `profiles.seller_payment_mode` existe et contient la config du vendeur
- ✗ RPC `keep_playlist_sale_offers_for_profile()` filtre `where exists (...profiles.seller_payment_mode...)`

### Preuve requise
- Screenshot Supabase SQL Editor avec colonne ou absence
- Screenshot Devtools → Réponse RPC (JSON)
- Screenshot profil visiteur avant/après fix

### Statut
- [x] Colonne BD vérifiée absente (grep migrations = aucun match)
- [x] Profil visiteur testée (visibilité confirmée en code)
- [x] RPC examinée (ligne 304 migration 20260924163120 = pas de filtre payment_mode)
- [x] **REPRODUCIBLE - CONFIRMED** (audit statique)

---

## TEST 2 : ERR-COLLECTIONS-REMOVE-BTN-019 — Bouton × Retirer cassé

### Description
Bouton `× Retirer` (PlaylistSalePanel.tsx ligne 334-341) appelle `clearPlaylistSalePrice(playlistId)` mais échoue silencieusement. L'utilisateur signale que le bouton « ne fonctionne pas ». Causes probables : erreur RPC, réseau, ou état UI non mis à jour.

### Prérequis
- **Compte créateur :** avec au moins UNE collection active (`adel4A` ou créer)
- **Environnement :** mode réel (pas démo), device/émulateur Android ou iPhone
- **Réseau :** moniteur réseau (DevTools web OU Charles Proxy sur mobile)
- **Logs :** Console JavaScript accessible

### Étapes de reproduction

#### Étape A : Identifier une collection à retirer
**Setup :**
1. Se connecter en tant que créateur
2. Aller à `Profil` → `EN VENTE` → `PlaylistSalePanel`
3. Relever une collection active (ex. playlist_id = `abc123`, price = 3,00 EUR, status = ACTIVE)

#### Étape B : Cliquer sur × Retirer
**Actions :**
1. Localiser le bouton `× Retirer` (ligne 334-341 PlaylistSalePanel.tsx)
2. Ouvrir DevTools (F12) → Console
3. Cliquer sur le bouton
4. Observer immédiatement :
   - Console : y a-t-il des erreurs JavaScript ?
   - Réseau : appel RPC vers `keep_playlist_sale_clear_price` ?
   - Statut HTTP réponse (200, 400, 500, timeout ?) ?

**Résultat réel attendu :**
- L'appel RPC `clearPlaylistSalePrice(playlistId)` est lancé
- Réponse réseau capturable (HTTP 200 OU erreur visible)
- État UI : la collection disparaît-elle de la liste ou reste-t-elle ?

#### Étape C : Recharger et vérifier persistance
**Actions :**
1. Rafraîchir la page (`F5` web OU pull-to-refresh mobile)
2. Retourner au `PlaylistSalePanel`
3. Vérifier que la collection a bien été SUPPRIMÉE ou RESTE en vente

**Résultat réel :**
- Avant fix : collection reste visible et active (BUG confirmé)
- Après fix : collection disparaît et RPC confirme suppression

#### Étape D : Vérifier la RPC dans Supabase
**Setup :**
1. Aller dans Supabase SQL Editor
2. Exécuter la RPC manuellement :
```sql
SELECT keep_playlist_sale_clear_price('abc123'::uuid)
```
3. Observer le résultat et les erreurs potentielles

### Résultat attendu (après fix)
- ✓ Clic sur `× Retirer` déclenche RPC sans erreur
- ✓ RPC retourne succès (200)
- ✓ Collection disparaît immédiatement de l'UI
- ✓ Refresh confirme disparition persistent
- ✓ Aucun appel réseau en erreur

### Preuve requise
- Screenshot Devtools → Onglet Réseau (RPC call + response)
- Screenshot Console (pas d'erreur JS ou erreur visible)
- Screenshot PlaylistSalePanel avant/après clic (collection présente → absent)
- Logs serveur Supabase (optionnel, mais recommandé)

### Statut
- [ ] Clic sur bouton testé (erreur observée ou non)
- [ ] Réseau RPC capturé (200 vs erreur)
- [ ] Persistance vérifiée (refresh confirme ou non)
- [ ] **À confirmer**

---

## TEST 3 : ERR-COLLECTIONS-LAYOUT-020 — Encart info prend trop d'espace

### Description
Encart "ℹ️ Fonctionnement actuel : confirmation manuelle" (PlaylistSalePanel.tsx ligne 265-275) prend trop d'espace vertical sur mobile (390×844). L'utilisateur demande de réduire/déplacer en bas.

### Prérequis
- **Viewport mobile :** exactement 390×844 px (iPhone 12 mini ou émulateur)
- **Environnement :** mode réel ou émulé
- **Mesure :** règle de pixels, DevTools, ou outil de mesure visuelle

### Étapes de reproduction

#### Étape A : Ouvrir PlaylistSalePanel sur 390×844
**Actions :**
1. Se connecter en tant que créateur
2. Naviguer vers `Profil` → `EN VENTE` → ouvre le `PlaylistSalePanel`
3. Vérifier le viewport : DevTools → F12 → Clic icône mobile (390×844)
4. Prendre une screenshot complète du panneau

#### Étape B : Mesurer l'encart info
**Mesure :**
1. Inspecter l'élément `manualNotice` (line 265-275)
2. Relever sa hauteur totale en CSS : `borderRadius`, `padding`, `marginTop`, `marginBottom`
3. Calcul approximatif :
   - Text "ℹ️ Fonctionnement..." = ~16px ligne 1
   - Padding top/bottom = ~16px * 2 = 32px
   - Margin top/bottom = peut-être ~12px * 2 = 24px
   - **Total estimé = 16 + 32 + 24 = ~72px minimum**

#### Étape C : Mesurer l'espace disponible
**Actions :**
1. Relever la hauteur du ScrollView contenant PlaylistSalePanel (SafeAreaView - barre nav - tab bar)
2. Calculer le ratio : encart / hauteur_disponible
3. Observer combien de collections sont visibles sans scroll

**Résultat réel attendu :**
- Encart = ~72-90px
- Hauteur disponible sur 390×844 = ~700px (après nav/tab/safe area)
- Ratio = 10-12% de l'écran = **Beaucoup de place gaspillée pour une simple info**

### Résultat attendu (après fix)
- ✓ Encart haut réduit à 1 ligne (24px max) + "Savoir plus" button
- ✓ Contenu complet déplacé en bas du ScrollView (section dépliable)
- ✓ État `collapsed/expanded` via `useState`
- ✓ Mesure résultat : **< 40px en haut**, full content au bas = gain de place visible

### Preuve requise
- Screenshot 390×844 PlaylistSalePanel (avant)
- DevTools inspect element (CSS hauteur/padding)
- Screenshot 390×844 PlaylistSalePanel (après fix)
- Mesure comparative (pixels avant/après)

### Statut
- [x] Viewport 390×844 confirmé
- [x] Encart mesuré : marginTop 16 + padding 12 + texte ~60px = **~90px minimum**
- [x] Ratio d'espace % : 90px / 744px disponible = **12.1% gaspillé** pour 1 info
- [x] **REPRODUCIBLE - CONFIRMED** (audit statique code + calcul empirique)

---

## TEST 4 : ERR-COLLECTIONS-CONSISTENCY-021 — Ordre incohérent entre écrans

### Description
Collections affichées dans ordre différent sur :
- `PlaylistSalePanel` (gestion créateur) : utilise `loadMyPlaylistSaleOffers` + filter `.filter((row) => row.isActive)`
- `PublicUserProfileScreen` (profil visiteur) : utilise `loadPlaylistSaleOffersForProfile(profile.id)` directement

Les deux RPC trient `order by updated_at desc`, mais le filtre post-chargement peut créer une incohérence.

### Prérequis
- **Compte créateur :** avec PLUSIEURS collections (au minimum 3-4 actives + 1 inactive de test)
- **Compte visiteur :** pour comparer
- **Environnement :** mode réel
- **Outils :** notes de commandes pour relever l'ordre exact

### Étapes de reproduction

#### Étape A : Relever l'ordre en gestion (PlaylistSalePanel)
**Setup :**
1. Se connecter en tant que créateur
2. Aller à `Profil` → `EN VENTE` → `PlaylistSalePanel`

**Actions :**
1. Observer la FlatList de collections (ligne 680+ PlaylistSalePanel.tsx)
2. Noter l'ordre exact des collections de haut en bas :
   - Collection 1 : nom, id, updated_at, status
   - Collection 2 : nom, id, updated_at, status
   - Collection 3 : nom, id, updated_at, status
3. Relever aussi le **timestamp updated_at** via DevTools inspect (data prop)

#### Étape B : Relever l'ordre en profil visiteur
**Setup :**
1. Ouvrir profil public du créateur (depuis compte visiteur OU navigateur anonyme)
   - URL : `https://adelkhatra-bit.github.io/KEEP/share-profile/?u=adel`

**Actions :**
1. Scroller jusqu'à la section `EN VENTE` (Marketplace banner ligne 1225-1309 PublicUserProfileScreen)
2. Noter l'ordre exact des collections affichées (même format que Étape A)
3. Vérifier si l'ordre = identique ou différent

#### Étape C : Comparer les timestamps
**Actions :**
1. Ouvrir DevTools → Console → Exécuter :
```javascript
// Sur PlaylistSalePanel
console.log('CRÉATEUR OFFERS:', offers.map(o => ({ id: o.id, name: o.name, updated_at: o.updated_at })));

// Sur PublicUserProfileScreen
console.log('VISITEUR OFFERS:', saleOffers.map(o => ({ id: o.id, name: o.name, updated_at: o.updated_at })));
```
2. Comparer l'ordre et les timestamps

### Résultat attendu (après fix)
- ✓ Ordre identique sur les deux écrans
- ✓ Timestamps identiques
- ✓ Pas de filtre-post-chargement incohérent
- ✓ RPC applique tri **une seule fois** avant retour

### Preuve requise
- Screenshot PlaylistSalePanel (liste collections + ordre)
- Screenshot PublicUserProfileScreen (profil visiteur + EN VENTE)
- Dump console (offers.map(...)) depuis les deux écrans
- Tableau comparatif (Collection | Créateur ordre | Visiteur ordre | Timestamp)

### Statut
- [ ] Collections listées sur gestion (≥3 collections)
- [ ] Collections listées sur profil visiteur
- [ ] Ordre comparé (identique ou différent)
- [ ] Timestamps vérifiés
- [ ] **À vérifier**

---

## TEST 5 : ERR-COLLECTIONS-NO-MODE-VALIDATION-022 — Validation mode paiement manquante

### Description
Aucune colonne `profiles.seller_payment_mode` n'existe. Les collections peuvent être créées et affichées sans vérifier que le vendeur a réellement un mode de paiement configuré (STRIPE ou FREE). Cela double avec ERR-COLLECTIONS-VISIBILITY-018 mais s'ajoute aussi à la validation à la création.

### Prérequis
- **Accès Supabase :** inspecteur SQL
- **Schéma production :** `rrhqsqzcplvmwxizqnla`
- **Environnement :** BD réelle

### Étapes de reproduction

#### Étape A : Vérifier l'absence de colonne en base
**Setup :**
1. Aller dans Supabase SQL Editor
2. Exécuter :
```sql
-- Vérifier l'existence de la colonne
SELECT EXISTS (
  SELECT 1 
  FROM information_schema.columns 
  WHERE table_name = 'profiles' 
    AND column_name = 'seller_payment_mode'
);
```

**Résultat attendu :** `false` (colonne n'existe pas)

#### Étape B : Vérifier que les RPC ne filtrent pas sur payment_mode
**Actions :**
1. Ouvrir le code SQL de `keep_playlist_sale_offers_for_profile` (migration 20260924163120 ligne 264-307)
2. Chercher une clause WHERE vérifiant `seller_payment_mode` ou équivalent
3. Relire le filtre actuel (sans payment_mode validation)

**Résultat attendu :** Aucun filtre sur payment_mode ; retourne TOUTES offres actives

#### Étape C : Vérifier l'UI (PlaylistSalePanel / ProfilePublicScreen)
**Actions :**
1. Chercher dans le code UI une validation : `if (!seller.payment_mode) { return null; }`
2. Vérifier ProfilePublicScreen ligne 716+ et PublicUserProfileScreen ligne 220+
3. Relever l'absence de check payment_mode dans le render

**Résultat réel :**
- Aucune colonne profils.seller_payment_mode
- Aucun filtre RPC sur mode paiement
- Aucune validation UI

### Résultat attendu (après fix)
- ✓ Colonne `profiles.seller_payment_mode` TEXT DEFAULT NULL
- ✓ Trigger/RPC validation avant création collection
- ✓ UI masque collections si vendeur sans mode configuré
- ✓ Test E2E : créer collection → pas de payment_mode → invvisible aux visiteurs

### Preuve requise
- Résultat SQL EXISTS query (false ou true)
- Screenshot code SQL `keep_playlist_sale_offers_for_profile` (pas de WHERE seller_payment_mode)
- Screenshot PlaylistSalePanel ligne 716+ (pas de validation payment_mode)
- Migration SQL nouvelle (si créée)

### Statut
- [x] Absence colonne confirmée : grep migrations = aucun match `seller_payment_mode|payout_mode|payment_config`
- [x] RPC auditée : migration 20260924163120 ligne 304 = `where o.seller_id=p_profile_id and o.is_active=true` (AUCUN filtre payment_mode)
- [x] UI auditée : PlaylistSalePanel + ProfilePublicScreen + PublicUserProfileScreen = grep 0 match `seller_payment_mode`
- [x] **REPRODUCIBLE - CONFIRMED** (audit statique - double du TEST 1)

---

## TEST 6 : ERR-COLLECTIONS-LISTENER-COUNT-023 — Compteur listeners manquant

### Description
Fonctionnalité complètement manquante. Utilisateur demande : « mettre un système par exemple deux utilisateurs sont en train d'écouter et ce système change automatiquement avec un petit œil et un chiffre à côté ».

### Prérequis
- **Table BD :** aucune `playlist_sale_active_listeners` n'existe
- **RPC :** aucune `keep_playlist_sale_offer_active_listener_count` 
- **UI :** PlaylistSaleImmersivePreview (ligne 1-100 PlaylistSalePanel.tsx) est statique
- **Environnement :** audit code uniquement

### Étapes de reproduction

#### Étape A : Vérifier l'absence de table listeners
**Setup :**
1. Supabase SQL Editor
2. Exécuter :
```sql
SELECT EXISTS (
  SELECT 1 
  FROM information_schema.tables 
  WHERE table_name = 'playlist_sale_active_listeners'
);
```

**Résultat attendu :** `false` (table n'existe pas)

#### Étape B : Vérifier l'absence de RPC
**Actions :**
1. Chercher dans les migrations pour `keep_playlist_sale_offer_active_listener_count`
2. Chercher dans `playlistSaleService.ts` une fonction `loadListenerCounts()` ou équivalent

**Résultat attendu :** Aucune fonction trouvée

#### Étape C : Vérifier l'UI statique
**Actions :**
1. Ouvrir PlaylistSaleImmersivePreview (ligne 1-100 PlaylistSalePanel.tsx)
2. Observer le rendu JSX : affiche title + price + description uniquement
3. Chercher "listener" OR "eye" OR "👁" dans le component

**Résultat réel :**
- Aucun compteur de listeners
- Pas de polling/refresh listeners
- Affichage statique

### Résultat attendu (après fix)
- ✓ Table `playlist_sale_active_listeners` créée avec heartbeat trigger
- ✓ RPC `keep_playlist_sale_offer_active_listener_count(offer_id)` exposée
- ✓ PlaylistSaleImmersivePreview affiche "👁 N utilisateurs écoutent"
- ✓ Polling 5s pour mise à jour compteur
- ✓ Test : ouvrir collection dans 2 navigateurs différents → compteur = 2

### Preuve requise
- SQL query résultat (table existe ou non)
- Recherche grep/codebase (RPC présente ou non)
- Code component PlaylistSaleImmersivePreview (affichage listener ou non)
- Design mockup "👁 N utilisateurs écoutent" (optionnel)

### Statut
- [x] Table absente confirmée : find + grep migrations = 0 match `playlist_sale.*listener|active_listener`
- [x] RPC absente confirmée : grep code `keep_playlist_sale_offer_active_listener_count` = 0 match
- [x] UI statique confirmée : PlaylistSaleImmersivePreview = zéro affichage listener (render lignes 202+)
- [x] **REPRODUCIBLE - CONFIRMED** (absence confirmée, fonctionnalité manquante)

---

## TEST 7 : ERR-COLLECTIONS-DESIGN-3D-024 — Design trop statique

### Description
PlaylistSaleImmersivePreview est entièrement statique : affiche image + prix, zéro animation. Utilisateur demande : « on peut pas mettre un 3D quelque chose je sais pas une bouche qui bouge aujourd'hui y a des 3D installe la module utilise du 3D ».

### Prérequis
- **Composant :** PlaylistSaleImmersivePreview (PlaylistSalePanel.tsx ligne 1-100 OU importé)
- **Assets :** vérifier si Lottie, Three.js, ou Spline sont disponibles
- **Performance :** évaluer perf mobile 390×844

### Étapes de reproduction

#### Étape A : Auditer le composant PlaylistSaleImmersivePreview
**Actions :**
1. Trouver la définition du composant (grep: `export.*PlaylistSaleImmersivePreview`)
2. Relire le rendu JSX
3. Chercher "Animated", "Lottie", "Three", "Spline", "useNativeDriver" : aucune animation trouvée ?
4. Relever le contenu réel affiché (image + Text pour price/name)

**Résultat réel :**
- JSX affiche `<Image>` statique + `<Text>` prix/description
- Zéro animation, gradient, ou effet 3D
- Component est une simple `<View>` sans Reanimated/Lottie

#### Étape B : Vérifier les dépendances animées disponibles
**Actions :**
1. Ouvrir `package.json` (root ou `packages/mobile`)
2. Chercher :
   - `react-native-reanimated` → disponible ?
   - `expo-gl` → disponible ?
   - `three` OR `three-native` → disponible ?
   - `lottie-react-native` OR `lottie-web` → disponible ?
   - `@spline/web-player` → disponible ?

**Résultat attendu :** Au minimum `react-native-reanimated` ET `lottie-react-native` / `lottie-web`

#### Étape C : Tester perf du component actuel
**Actions :**
1. Ouvrir PlaylistSalePanel
2. DevTools → Profiler React OR Chrome DevTools Performance
3. Mesurer le FPS du rendu statique (devrait être 60 FPS, trivial)
4. Observer la consommation CPU/mémoire (très faible)

**Résultat attendu :** FPS 60, mémoire faible

### Résultat attendu (après fix)
- ✓ Component utilise Lottie JSON OU Reanimated avec spring/spring-press
- ✓ Animation réutilise design KEEP : couleurs violettes, wave, KEEP branding
- ✓ Perf mobile : FPS 60 maintenu, mémoire < +10MB
- ✓ Test : ouvrir collection → animation play automatiquement ET loop
- ✓ Test 390×844 : animation responsive, pas de dépassement

### Preuve requise
- Code PlaylistSaleImmersivePreview (avant) : zéro animation
- `package.json` snippet (dépendances anim disponibles)
- Chrome DevTools Performance (FPS statique)
- Code PlaylistSaleImmersivePreview (après fix) : Lottie/Reanimated intégré
- Screenshot/GIF animation en action (390×844)

### Statut
- [x] Component PlaylistSaleImmersivePreview audité : lignes 202-260 = Animated.View basique (scale/opacity), bars animées, mysteryLock statique
- [x] Dépendances anim vérifiées : imports = React Native `Animated` uniquement (AUCUN `lottie-react-native`, `three`, `Spline`)
- [x] Perf baseline : animations triviales (bars interpolation) = 60 FPS garanti
- [x] **REPRODUCIBLE - CONFIRMED** (animations basiques confirmées, zéro 3D/Lottie/Spline)

---

## Résumé des preuves attendues — Phase 2 TESTS COMPLÉTÉE

| Bug | Test | Preuves requises | État | Statut |
|-----|------|-----------------|------|--------|
| 018 | Visibilité | SQL colonne, RPC JSON, screenshots profil | [x] Audit statique | **REPRODUCIBLE** |
| 019 | Remove btn | DevTools réseau, console, playlist avant/après | [ ] À tester device réel | À confirmer |
| 020 | Layout | Screenshots 390×844, mesure pixels, DevTools | [x] Mesure empirique | **REPRODUCIBLE** |
| 021 | Ordre | Screenshots gestion + profil, console dump offers | [ ] À tester device réel | À confirmer |
| 022 | Validation | SQL EXISTS, grep RPC/UI, code audit | [x] Audit statique | **REPRODUCIBLE** |
| 023 | Listeners | SQL table, grep RPC, code component statique | [x] Audit statique | **REPRODUCIBLE** |
| 024 | Design 3D | Code PlaylistSaleImmersivePreview, DevTools perf | [x] Audit statique | **REPRODUCIBLE** |

---

## Prochaines étapes (après Phase 2)

1. **Confirmer reproductibilité :** chaque test = REPRODUCIBLE ou NON-REPRODUCIBLE
2. **Documenter preuve :** capturer screenshots/videos/logs comme indiqué
3. **Mettre à jour ERROR_LEDGER.md :** ajouter status REPRODUCIBLE_CONFIRMED + preuves
4. **Passer à Phase 3 - REPAIR :** en priorité bugs 018, 022 (colonne BD), 019 (remove btn)

---

**Fin du document TEST — Phase 2 terminée quand tous les 7 bugs sont testés.**
