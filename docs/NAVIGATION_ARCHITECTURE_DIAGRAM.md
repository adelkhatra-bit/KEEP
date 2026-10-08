# SCHÉMA NAVIGATION KEEP — Architecture Proposée 🗺️

**Objectif** : Rendre la navigation compréhensible pour un enfant de 5-7 ans sans confusions.

---

## AVANT (Situation actuelle — INCOHÉRENT)

```
┌──────────────────────────────────────────────────────────────┐
│                    PROFIL (ProfilePublicScreen)              │
├──────────────────────────────────────────────────────────────┤
│ [Free: 23]           [🔔 Bell]              [☰ Hamburger]    │
│                         ↓                          ↓           │
│                    PLEIN ÉCRAN          MODAL (Côté)         │
│                   (Écran entier                                │
│                    change)                                    │
│                                                                │
│    APERÇU  |  PÉPITES  |  BATTLE                             │
│    (3 petits boutons confus)                                  │
│                                                                │
│            ▬ VOIR LES DÉCOUVERTES ▬                          │
│         (Gros bouton, trop d'espace blanc)                   │
│                                                                │
│  [Mes musiques en grille...]                                 │
│  [Musiques en grille...]                                     │
│  [Musiques en grille...]                                     │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│ Écouter | Découvertes | Playlists | Soirées | PROFIL ← HERE  │
└──────────────────────────────────────────────────────────────┘

PROBLÈME :
  ❌ Bell ouvre un écran NEUF (Notifications)
  ❌ ☰ ouvre une Modal (Menu)
  ❌ Utilisateur ne sait pas lequel cliquer
  ❌ Deux paradigmes différents = CONFUSION
```

---

## APRÈS (Proposition — COHÉRENT)

### Vue générale

```
┌──────────────────────────────────────────────────────────────┐
│                 KEEP — Navigation Unifiée                    │
├──────────────────────────────────────────────────────────────┤
│
│  COUCHE 1 : Écrans Principaux (onglets en bas)
│  ────────────────────────────────────────────
│
│     ┌─────────────────────────────────────┐
│     │  🎵 ÉCOUTER                         │
│     │  (Reconnaissance audio)             │
│     └─────────────────────────────────────┘
│              ↓ (tab click)
│     ┌─────────────────────────────────────┐
│     │  ♫ DÉCOUVERTES                      │
│     │  (Swipe continu)                    │
│     └─────────────────────────────────────┘
│              ↓ (tab click)
│     ┌─────────────────────────────────────┐
│     │  ☷ PLAYLISTS                        │
│     │  (Mes Musiques gardées)             │
│     └─────────────────────────────────────┘
│              ↓ (tab click)
│     ┌─────────────────────────────────────┐
│     │  ♬ SOIRÉES                          │
│     │  (Battle + arène)                   │
│     └─────────────────────────────────────┘
│              ↓ (tab click)
│     ┌─────────────────────────────────────┐
│     │  ◯ PROFIL (Là où on est)            │
│     │  [Free: 23] [🔔] [☰]               │
│     │  APERÇU  |  PÉPITES  |  BATTLE     │
│     │  (3 boutons égaux, clairs)         │
│     │  [Lien vers Découvertes]            │
│     │                                     │
│     │  Mes musiques gardées...            │
│     └─────────────────────────────────────┘
│
│
│  COUCHE 2 : Menu Modal Unique (cloche OU ☰)
│  ─────────────────────────────────────────
│
│         Clic sur [🔔] OU [☰]
│              ↓
│    ┌──────────────────────────────┐
│    │      MENU PRINCIPAL           │
│    ├──────────────────────────────┤
│    │ ⭐ NOTIFICATIONS              │
│    │    (count badge, lisible)     │
│    ├──────────────────────────────┤
│    │ 🎁 OFFRES                     │
│    │    (Acheter une formule)      │
│    ├──────────────────────────────┤
│    │ 🎵 SERVICES MUSICAUX          │
│    │    (Apple Music, Spotify)     │
│    ├──────────────────────────────┤
│    │ ⚙️ PARAMÈTRES                 │
│    │    (Profil, Logout)           │
│    ├──────────────────────────────┤
│    │ [Fermer]                      │
│    └──────────────────────────────┘
│
│
│  COUCHE 3 : Modales Secondaires (s'ouvrent par-dessus)
│  ──────────────────────────────────────────────────────
│
│    • Battle Screen (jouable full-screen OU modal dédiée)
│    • Playlist Sale Panel (acheter une playlist)
│    • Public Profile (consulter un profil d'ami)
│    • Session Recap (résumé après une partie)
│

└──────────────────────────────────────────────────────────────┘

ONGLETS EN BAS (toujours visibles) :
┌─────────────────────────────────────────────────────────────┐
│ Écouter | Découvertes | Playlists | Soirées | PROFIL (actif)│
└─────────────────────────────────────────────────────────────┘
```

---

## Flux Détaillé : Chaque Action

### 1️⃣ ENFANT VEUT VOIR SES NOTIFICATIONS

```
AVANT (confus) :
  Clic [🔔]
    → Écran entier change
    → Va sur NotificationsScreen
    → Doit revenir avec bouton Retour
    → Redirige vers profil

APRÈS (clair) :
  Clic [🔔]
    → Modal s'ouvre
    → « NOTIFICATIONS » section visible
    → Scroll, lis les notifs
    → Clic sur autre section (Offres, etc.)
    → Reste dans le même modal
    → Clic [Fermer]
    → Revient au profil
```

### 2️⃣ ENFANT VEUT ACHETER UNE FORMULE

```
AVANT :
  Clic [☰]
    → Modal s'ouvre
    → Voit « Offres »
    → Clic sur « Offres »
    → Va vers OffersScreen
    → Écran plein-page
    → Revient manuellement

APRÈS :
  Clic [☰]
    → Modal s'ouvre
    → Clic sur « 🎁 OFFRES »
    → Section Offres se déplie dans le modal
    → Voit les formules
    → Bouton « Acheter »
    → Reste dans le modal (ou va plein-écran si vraiment complexe)
```

### 3️⃣ ENFANT VEUT ALLER AUX DÉCOUVERTES

```
AVANT :
  Deux chemins :
  • Clic [Onglet Découvertes en bas]
  • Clic [Gros bouton « Voir découvertes » sur profil]
  (Confusion : lequel choisir ?)

APRÈS :
  Un seul chemin :
  • Clic [Onglet Découvertes en bas]
  • OU petit lien « Voir découvertes » (discret) sur profil
    → Va à Découvertes
```

### 4️⃣ ENFANT JOUE UN BATTLE

```
AVANT :
  Clic [Onglet Soirées]
    → PartiesScreen s'ouvre
    → Clic [Commencer]
    → Overlay BattleScreen s'ouvre (léger)
    → Confus (est-ce un écran ou une fenêtre ?)

APRÈS :
  Clic [Onglet Soirées]
    → PartiesScreen
    → Clic [Commencer]
    → BattleScreen s'ouvre EN PLEIN-ÉCRAN
    → Très clair
    → À la fin : « Retour » → revient à Soirées
```

---

## État Modal — Qui est visible, quand ?

```
ProfilePublicScreen Rendering Tree :

  <View>  ← Principal
    [TopBar: Free badge | Notifications bell | Menu ☰]
    
    [Profil content...]
    
    <Modal visible={menuOpen}>  ← UNIQUE MENU MODAL
      <MenuContent>
        <NotificationsSection expanded={expandedMenuItem === 'notifications'} />
        <OffersSection expanded={expandedMenuItem === 'offers'} />
        <ServicesSection expanded={expandedMenuItem === 'services'} />
        <SettingsSection expanded={expandedMenuItem === 'settings'} />
        <CloseButton />
      </MenuContent>
    </Modal>
    
    <Modal visible={battleOpen}>  ← BATTLE MODAL
      <BattleScreen />
    </Modal>
    
    <Modal visible={qrOpen}>  ← QR CODE MODAL
      <QRCard />
    </Modal>
  </View>

RÈGLES STRICTES :
  • Un seul <Modal visible={true}> à la fois (règle z-index)
  • Quand menuOpen → tous les autres = false
  • onBackdropPress → ferme le modal actif
  • onRequestClose → ferme correctement (pas de ghost layers)
```

---

## Palette d'Icônes Standardisée

```
Onglets en bas (5) :
  🎵  Écouter
  ♫   Découvertes
  ☷   Playlists
  ♬   Soirées
  ◯   Profil

Menu modal :
  ⭐  Notifications
  🎁  Offres (Acheter)
  🎵  Services musicaux
  ⚙️  Paramètres

Actions fréquentes :
  🔔  Bell (Cloche) = Ouvrir Menu
  ☰   Hamburger = Ouvrir Menu (redondant avec cloche)
  ✓   Garder / Keep
  ✕   Passer / Skip
  ♫   Musique générique
  👤  Profil utilisateur
  ⬅️  Retour
  ✎   Éditer
  🔒  Verrouillé (fonction payante)
  ↗️  Lien externe
  📤  Partager
```

---

## Tailles de Zone Tactile (Mobile-friendly)

```
MINIMUM pour un enfant :
  ✅ 48px × 48px (pour touches de doigt)
  
LES TROIS PETITS BOUTONS (Profil) :
  ❌ AVANT : ~36px hauteur (trop petit)
  ✅ APRÈS : 48px hauteur (OK)

BELL & HAMBURGER :
  ✅ Actuellement ~48px (bon)
  ✓ Garder cette taille

BOUTONS PRIMAIRES (Offres, Partager, Commencer Battle) :
  ✅ 56px × 48px (grande zone tactile)
```

---

## Règles de Cohérence Stricte

Toute nouvelle action doit respecter :

1. **Navigation par onglet** :
   - Les 5 écrans principaux (Écouter, Découvertes, Playlists, Soirées, Profil)
   - Accessibles depuis la barre en bas
   - Pas de scroll horizontal (enfant se perd)

2. **Menu modal unique** :
   - Toutes les actions secondaires (Notifications, Offres, Services, Paramètres)
   - Accessible depuis PROFIL via [🔔] ou [☰]
   - Sections dépliables sur place (pas de navigation hors du modal)

3. **Modales complexes** :
   - Battle (jouable, nécessite full-screen) → OK en modal dédiée
   - Playlist Sale (achat) → OK en modal dédiée
   - Profil ami (lecture seule) → OK mais preferable via navigation

4. **Pas de navigation cachée** :
   - Pas de swipe entre écrans (enfant ne sait pas que c'est possible)
   - Pas de gestes double-tap (cacher une fonction)
   - Tout est explicite avec boutons visibles

5. **Feedback immédiat** :
   - Clic → réponse dans <200ms
   - Loading spinner si > 200ms
   - Jamais d'écran blanc sans contexte

---

## Checklist Avant Déploiement

- ✅ Tester que clic [🔔] ouvre Menu (pas écran Notifications seul)
- ✅ Tester que clic [☰] ouvre le même Menu
- ✅ Tester que Modal se ferme proprement (pas d'overlaps)
- ✅ Tester que scroll dans chaque onglet fonctionne (pas figé)
- ✅ Tester refresh (F5) → pas de ghost layers
- ✅ Tester sur petit écran (iPhone SE)
- ✅ Tester sur tablette (iPad) — vérifier que layout se scaling bien
- ✅ Enfant 7 ans confirme : « Je comprends ce que chaque bouton fait »

---

**Schéma conçu pour** : Clarté maximale, zéro confusion  
**Cible utilisateur** : Enfants 5-7 ans + adultes (tous profits)  
**Prochaine étape** : Implémenter Phase 1 (Navigation unifiée)
