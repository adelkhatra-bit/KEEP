# Audit Complet KEEP — 28 Septembre 2026

**Demande Adel :** Vérifier TOUS les boutons, design épuré, intégration web ↔ App Store, QR code, 2FA, social login, liens d'affiliation.

**Statut :** En cours (audit exhaustif + corrections progressives).

---

## 📋 Checklist Audit Complet

### 1️⃣ BOUTONS ET INTERACTIONS

#### Home Screen (HomeScreenCompact)
- [x] 32 interactions trouvées (scan complet)
- [ ] Tous les boutons ont contours animés ?
- [ ] Tous les boutons ont accessibilityLabel ?
- [ ] Toutes les redirections vont au bon endroit ?

**Boutons clés Home :**
- `Démarrer une écoute` → session.start ✓
- `Tester avec le son d'un onglet` → tab capture (manque feedback visuel ?)
- `Morceau plus récent/ancien` → queue navigation (disabled state OK ?)

#### Discover Screen
- [x] 15 interactions trouvées
- [ ] Recherche utilisateur → redirect profil visiteur OK ?
- [ ] Lock badge Premium → openPremium correct ?
- [ ] Filtre rayon → reset OK ?

**Problème identifié :** Bouton "RECHERCHER" peut avoir state désactivé mais pas feedback visuel clair.

#### Parties Screen
- [x] 90 interactions trouvées (la plupart en Leaderboard)
- [ ] Podium clickable → openPlayerStats correct ?
- [ ] Créer événement → permission check correct ?
- [ ] Battle solo → dédié SOLO ou multiplex?

**Problème potentiel :** Trop de boutons dans leaderboard, hiérarchie visuelle faible.

#### Profile Screen (ProfilePublicScreen)
- [x] Scan en cours
- [ ] Hero buttons (Inviter, Partager, Vendre) animés ?
- [ ] Collections clickable → open immersive preview OK ?
- [ ] Profil visitor vs owner → UI consistency ?

#### PlaylistSalePanel (Marketplace)
- [x] 38 interactions trouvées
- [ ] Bouton "× Retirer" → clearPlaylistSalePrice fonctionne ? (TEST 2, non confirmé)
- [ ] "Modifier musiques" → navigation correct ?
- [ ] Paiement lien externe → pas de redirection interne (OK selon design) ?

---

### 2️⃣ DESIGN ET VISUELS

#### Fonds Noirs + Contours Animés
- [ ] Tous les boutons primaryColor ont contours ?
- [ ] Tous les boutons avaient hover state ?
- [ ] Tous les boutons avaient press animation (scale/glow) ?

**Exemple manquant :** PlaylistSalePanel boutons d'action = simples TouchableOpacity sans animation.

#### Cohérence Design
- [x] Home compact validée (refonte 22/09)
- [x] Discover validée (refonte 22/09)
- [x] Parties validée (refonte 22/09)
- [ ] Playlists screen → design acceptable mais "reste à désirer" (Adel)
- [ ] Profile screen → "propre et à peu près bon mais incohérences" (Adel)

**À améliorer :** Playlist et Profile manquent d'animations micro (button press, card reveal, etc).

---

### 3️⃣ INTÉGRATION WEB ↔ APP STORE

#### Site Web (GitHub Pages)
- [x] Export Expo Web: `packages/mobile` → `/KEEP/`
- [x] Workflow `.github/workflows/web-preview-pages.yml` testé
- [ ] Tous les boutons web = mobiles (React Native Web) ?
- [ ] Responsive desktop 1920×1080 testé ?

#### App Store (iOS)
- [ ] Build TestFlight (en attente depuis 22/09)
- [ ] 2 builds lancés : colors + refontes
- [ ] Métadonnées validées ? (app review info REST)

#### Google Play (Android)
- [ ] Build natif disponible ?
- [ ] Métadonnées Android complètes ?

**Problème constaté :** Web et natif peuvent avoir divergences (feature flags, social login, payments).

---

### 4️⃣ QR CODE AUTHENTICATIO N (NOUVELLE DEMANDE)

**Besoin :** Système de connexion via QR code animé (type Netflix).

**À implémenter :**
1. Écran "Connexion par QR" dans onboarding
2. Générer QR code animé (Lottie ou Spline)
3. Valider QR sur backend (cryptographique)
4. Limiter lifetime du QR (5 min ?)
5. Fallback : login/password classique

**Complexité :** HAUTE (nouveau flow auth, nouveau endpoint Supabase)

**Timeline :** 8-12h (design + implémentation + test)

---

### 5️⃣ AUTHENTIFICATION FORTE (2FA/MFA)

**Besoin :** Utilisateur peut sécuriser son compte avec authenticator.

**Localisation :** Paramètres → Sécurité → "Ajouter authentifiant"

**Options :**
- TOTP (Time-based One-Time Password) via Google Authenticator / Authy
- SMS (non GDPR-friendly, éviter)
- Biometric (platform-specific)

**À implémenter :**
1. Écran paramètres Sécurité
2. Pairing QR code TOTP
3. Vérification backup codes
4. Enforcement lors du login

**Complexité :** MOYENNE (auth classique, peu de UI)

**Timeline :** 6-8h

---

### 6️⃣ SOCIAL LOGIN (Apple, Google, Facebook)

**Besoin :** Se connecter via Apple/Google/Facebook sans password.

**Demande Adel :** "Se connecter directement sans encombrer le design"

**Localisation :** Écran login principal (sauf mode desktop, peut encombrer ?)

**Options :**
- Apple Sign In (iOS/web)
- Google Sign In (Android/web)
- Facebook Login (web)

**À implémenter :**
1. OAuth2 flow Supabase
2. Button stack discret (sous login principal)
3. Account linking (user a déjà login/password)

**Complexité :** MOYENNE (Supabase provider, OAuth flow, UI)

**Timeline :** 8-10h

---

### 7️⃣ LIEN D'AFFILIATION UTILISATEUR

**Problème Adel :** "Lien d'affiliation utilisateur : quand on appuie dessus, pas de redirection correcte"

**Scenario :**
1. User A partage lien profil → `https://adelkhatra-bit.github.io/KEEP/share-profile/?u=adel4A`
2. User B anonyme clique lien
3. User B voit profil adel4A
4. User B clique "Suivre" ou "Voir profil complet"
5. **BUG :** Pas de redirection cohérente vers création compte avec "intent: suivre adel4A"

**À corriger :**
1. Lien anonyme → précharge l'intention (follow/visit)
2. Clic "Suivre" → création compte OU login
3. Après auth → suit automatiquement le profil cible
4. Pas de redirection perdue

**Complexité :** BASSE (navigation + state management)

**Timeline :** 3-4h

---

### 8️⃣ COHÉRENCE TEST WEB + APP STORE

**Problèmes constatés :**
- Web : certains boutons peuvent ne pas avoir same handler que natif
- App Store : certaines fonctions bloquées (feature flags, payments)
- Tests : mal faits, pas poussés (selon Adel)

**À vérifier :**
1. Bouton "Créer événement" → même UX web + natif ?
2. Playlist swipe → même perf web + natif ?
3. Battle solo → accessible sur web ?
4. Marketplace → même UI web + natif ?

**Timeline :** 5-6h (audit + fixes inévitables)

---

## 🎯 PRIORITÉ D'EXÉCUTION

| Priorité | Task | Durée | Impact |
|----------|------|-------|--------|
| 🔴 CRITIQUE | Vérifier TOUS les boutons (animation, redirect, label) | 3h | Medium → High |
| 🔴 CRITIQUE | Design épuré Playlist + Profile (animations micro) | 4h | Medium → High |
| 🟠 HAUTE | Test web + App Store cohérence | 3h | High |
| 🟠 HAUTE | Lien affiliation utilisateur (fix redirect) | 2h | Medium |
| 🟡 MOYENNE | QR code authentification (nouv. feature) | 10h | LOW (future) |
| 🟡 MOYENNE | Social login (Apple/Google/Facebook) | 8h | Medium |
| 🟡 MOYENNE | 2FA/MFA authenticator (nouv. feature) | 6h | Medium |
| 🟢 BASSE | Desktop responsive polish | 4h | Low |

---

## 📊 RÉSUMÉ DES PROBLÈMES IDENTIFIÉS

| Domaine | Problème | Sévérité | Fix Statut |
|---------|----------|----------|-----------|
| Boutons | Pas d'animation uniformes | MEDIUM | À faire |
| Boutons | Quelques sans accessibilityLabel | MEDIUM | À faire |
| Design | Playlist/Soirée "reste à désirer" | MEDIUM | À faire |
| Design | Profil "incohérences" | MEDIUM | À faire |
| Web ↔ App | Divergences possibles | MEDIUM | À vérifier |
| Affiliation | Lien utilisateur broken | MEDIUM | À faire |
| Auth | Pas de QR code | LOW (todo) | Non urgent |
| Auth | Pas de 2FA | LOW (todo) | Non urgent |
| Auth | Pas de social login | LOW (todo) | Non urgent |
| Tests | "Mal faits, pas poussés" | HIGH | À refaire |

---

## 🚀 PLAN D'ACTION IMMÉDIAT

**Phase 1 (3h) - Audit Détaillé Boutons**
- [ ] Scanner tous les boutons HomeScreenCompact
- [ ] Scanner tous les boutons DiscoverScreen
- [ ] Scanner tous les boutons PartiesScreen
- [ ] Scanner tous les boutons ProfilePublicScreen
- [ ] Lister les SANS animation
- [ ] Lister les SANS accessibilityLabel
- [ ] Lister les redirections cassées

**Phase 2 (4h) - Ajouter Animation Micro à Tous les Boutons**
- [ ] Créer MotionActionButton réutilisable
- [ ] Intégrer dans tous les écrans
- [ ] Tester perf mobile 390×844

**Phase 3 (2h) - Fix Lien Affiliation**
- [ ] Navigation intention correcte
- [ ] Test scenario complet

**Phase 4 (3h) - Test Web + App Store**
- [ ] Vérifier boutons web vs natif
- [ ] Vérifier perf swipe/deck
- [ ] Vérifier marketplace UI

**Phase 5 (Au-delà)** - QR Code, 2FA, Social Login (future sprints)

---

**Fin de ce rapport. En attente de commencer Phase 1.**
