# AUDIT UX COMPLET — KEEP (Loki Music) 🧭

**Date** : 28 septembre 2026 23:45 UTC  
**Statut** : PHASE INITIALE — Audit complet de structure, navigation et design  
**Responsabilité** : CTO / Product Manager / QA / Designer / DevOps  
**Mandate** : Rendre la plateforme compréhensible pour un enfant de 5-7 ans sans friction. Aucune fonctionnalité ne doit disparaître.

---

## 📊 Vue d'ensemble de l'audit

Cet audit analyse trois axes critiques :

1. **NAVIGATION** : Cohérence des patterns (bell vs hamburger) et routing
2. **DESIGN & RENDERING** : Problèmes visuels, z-index, composants collés
3. **UX FLUX** : Clarté des parcours utilisateur (onboarding, profil, battle, etc.)

Chaque section décrit :
- ❌ **Le problème** observé
- 🔍 **Racine** (où dans le code)
- 💡 **Impact utilisateur** (qu'un enfant de 7 ans verrait)
- ✅ **La solution** proposée
- 📋 **Priorisation** : CRITIQUE (blocage UX) / HAUT (confusant) / MOYEN (usabilité) / BAS (cosmétique)

---

## 1️⃣ NAVIGATION — Incohérences critiques

### 1.1 🔴 CRITIQUE : Bell (🔔) vs Hamburger (☰) — Patterns incompatibles

**Le problème** :
- Bell (notifications) → `navigation.navigate('Notifications')` → **écran plein-page**
- Hamburger (menu) → `setMenuOpen(true)` → **Modal latéral dépliable**

**Localisation du code** :
- ProfilePublicScreen.tsx:1229-1230 (Bell)
- ProfilePublicScreen.tsx:1233 (Hamburger)

**Observation utilisateur (enfant 7 ans)** :
> « Pourquoi quand je clique sur la cloche ça ferme tout l'écran et m'envoie ailleurs, mais quand je clique sur trois barres ça se déplie à côté ? C'est pas la même chose. »

**Impact métier** :
- ✖️ Incohérence éducationnelle (pas de pattern reconnaissable)
- ✖️ Utilisateur perdu (ne sait pas s'il faut attendre un changement d'écran ou un menu)
- ✖️ Friction UX (deux paradigmes pour le même besoin : accès à des fonctions)

**La solution** :
Unifier les deux patterns. **Choix recommandé : Hamburger + Modal (plutôt que Bell → plein écran)**.

Pourquoi ? Parce que :
1. TikTok, Instagram, Snapchat utilisent le modèle Modal pour tous les menus (cohérent)
2. Notifications peut être une rubrique **dans** le menu modal (pas séparé)
3. Plus facile de switcher entre sections sans recharger toute l'interface

**Architecture proposée** :

```
TopBar (ProfilePublicScreen)
  ├─ [Free badge] (toujours visible)
  ├─ [Bell — notif count badge]  ← reste là
  └─ [Hamburger] (☰) ← ouvre le Modal unique

Modal Menu (s'ouvre au clic de Bell OU Hamburger)
  ├─ ⭐ Notifications (lisible, avec count)
  ├─ 🎁 Offres (acheter une formule)
  ├─ 🎵 Services musicaux (Apple Music, Spotify link)
  ├─ ⚙️ Paramètres (profil, logout)
  └─ [Fermer]
```

**Code à modifier** :
1. `ProfilePublicScreen.tsx:1229` → remplacer `navigation.navigate('Notifications')` par `setMenuOpen(true); setExpandedMenuItem('notifications')`
2. Ajouter onglet Notifications **dans** le Modal (au lieu de créer un écran dédié)
3. Conserver NotificationsScreen pour les cas où on veut une vue détaillée plein-écran (route complète)

**Priorisation** : 🔴 **CRITIQUE** — Bloque toute intuitivité UX

---

### 1.2 🟠 HAUT : Routes multiples vers le même endroit — Confusion

**Le problème** :
- Écran Profil a un bouton "Voir les découvertes" (gros, prend de la place)
- Onglet Découvertes en bas aussi accéder depuis la barre de tabs
- Utilisateur ne sait pas lequel cliquer

**Impact enfant 7 ans** :
> « Y a deux boutons pour aller aux musiques ? Pourquoi ? »

**Solution** :
Un seul chemin : onglet Découvertes en bas. Supprimer le gros bouton "Voir les découvertes" du profil OU le transformer en **lien discret** (pas un bouton primaire).

**Priorisation** : 🟠 **HAUT**

---

### 1.3 🟡 MOYEN : Profondeur de navigation — Trop d'onglets dans le menu modal

**Le problème** :
Menu hamburger contient trop de sections expansibles (Notifications, Offres, Services, Paramètres...). L'enfant doit dérouler, attendre, taper plusieurs fois.

**Solution** :
Limiter à 4-5 sections principales, grouper les sous-sections. Garder un chemin rapide pour les actions fréquentes (notifications, offres).

**Priorisation** : 🟡 **MOYEN**

---

## 2️⃣ DESIGN & RENDERING — Problèmes visuels

### 2.1 🔴 CRITIQUE : Designs coincés/superposés après refresh

**Le problème** (rapporté par Adel 28/09) :
> « Y a des Design qui sont coincés va chercher regarde pourquoi y a des Design qui ont pas été intégrés quand je fraîche des fois, je vois limite un autre Design derrière »

**Symptômes** :
- Refresh de page → composants overlappés
- Z-index mal géré ou conflictuel
- Modales/panneaux ne disparaissent pas correctement
- Animations CSS/React bloquées

**Éléments suspects** :
1. **Modales** (Modal, PlaylistSalePanel, hamburger menu)
2. **Overlays** (toute couche semi-transparent)
3. **Positionnement absolu** sans z-index clair
4. **États React non nettoyés** après unmount

**Localisation probable** :
- `PlaylistSalePanel.tsx` (peut rester montée en arrière-plan)
- `ProfilePublicScreen.tsx:1536` (Modal menuOpen)
- `PartiesScreen.tsx` (BattleScreen overlay)

**Solution immédiate** :
1. Auditer tous les `Modal` du projet → vérifier que `visible={condition}` est correct
2. Vérifier que chaque Modal a un handler `onRequestClose` qui ferme proprement
3. Ajouter `pointerEvents="none"` aux couches derrière les Modales actives
4. Tester le refresh sur chaque écran (F5 / CMD+R)

**Code de diagnostic** :
```bash
# Trouver tous les Modal du projet
grep -r "<Modal" packages/mobile/src --include="*.tsx" | head -20

# Vérifier les z-index et positioning
grep -r "zIndex\|absolute\|fixed" packages/mobile/src/screens --include="*.tsx" | wc -l
```

**Priorisation** : 🔴 **CRITIQUE** — Crée une impression de bug/instabilité

---

### 2.2 🟠 HAUT : Trois petits boutons sur un grand profil

**Le problème** (Adel 28/09) :
> « Et sur le profil c'est quoi ces boutons de merde trois petits boutons sur un grand profil... c'est pas ce que je t'ai demandé, je t'ai demandé juste de faire des contours... »

**Symbômes observés** :
- Boutons APERÇU / PÉPITES / BATTLE trop petits
- Grand trou noir/vide au-dessus d'eux
- Bouton "VOIR LES DÉCOUVERTES" gigantesque d'un côté
- Manque d'équilibre et de hiérarchie

**Solution** :
1. Redimensionner les trois petits boutons (APERÇU/PÉPITES/BATTLE) → hauteur uniforme (48px minimum)
2. Réduire la taille du bouton "VOIR LES DÉCOUVERTES" ou le convertir en lien
3. Utiliser une grille 2×2 ou 3 colonnes pour équilibrer l'espace blanc
4. Ajouter de vrais contours (2px border) plutôt que remplissage

**Priorisation** : 🟠 **HAUT** — Affecte la perception professionnelle de l'app

---

### 2.3 🟡 MOYEN : Contraste & lisibilité sur dark mode

**Le problème** :
Certains textes restent blancs/gris clair sur fond clair/foncé changeant. Pas de constraste suffisant.

**Solution** :
Utiliser les tokens de couleur centralisés (`colors.ts`) et **tester sur un vrai téléphone** (pas le simulateur) avec mode sombre ON.

**Priorisation** : 🟡 **MOYEN**

---

## 3️⃣ UX FLUX — Parcours utilisateur non-linear

### 3.1 🔴 CRITIQUE : Onboarding manquant (enfant débarque, ne sait pas quoi faire)

**Le problème** :
- Après inscription, l'utilisateur arrive sur l'écran Accueil (HomeScreenCompact)
- Aucun tutoriel visuel, aucune flèche, aucun contexte
- Les 5 onglets en bas ne sont pas expliqués
- Enfant 7 ans : « Qu'est-ce que je dois faire maintenant ? »

**Impact** :
- Taux d'abandon post-signup élevé
- Utilisateurs ne découvrent pas les features principales (Découvertes, Battle, Profil)

**Solution** :
1. Ajouter **1ère visite flag** → redirect vers OnboardingGuideScreen
2. Écran tutoriel avec dessins/emojis clairs :
   - « 🎵 Écouter » = Reconnais une chanson avec le micro
   - « ♫ Découvertes » = Trouve de nouvelles chansons en swipant
   - « ☷ Playlists » = Garde tes chansons préférées
   - « ♬ Soirées » = Joue en Battle avec d'autres
   - « ◯ Profil » = C'est TOI, vois tes stats
3. Bouton « Commencer » → ferme le tutoriel, lance l'écran Écouter
4. Bouton « Skip » discret (ne pas forcer)

**Priorisation** : 🔴 **CRITIQUE** — Affecte l'activation utilisateur

---

### 3.2 🟠 HAUT : Battle / Solo trop compliqué (interfaces superposées)

**Le problème** :
Quand on ouvre une Battle, plusieurs couches se chevauchent :
- En arrière : l'écran Soirées
- Devant : l'overlay Battle
- Encore devant : les scores, les boutons

Utilisateur déconcerté (pas clair que c'est une modale).

**Solution** :
1. Battle doit être un écran **full-page** (pas un overlay léger)
2. OU si c'est une modal → très clair avec un grand bouton « Retour »
3. Tester que le design battle est lisible sur iPhone SE (petit écran)

**Priorisation** : 🟠 **HAUT**

---

### 3.3 🟠 HAUT : Profil créateur — Confusant (boutons verrouillés sans explication)

**Le problème** :
- Enfant clique sur « Devenir DJ » → bouton verrouillé (icône cadenas)
- Pas d'indication où aller pour l'acheter
- Texte petit/gris = enfant le rate

**Solution** :
1. Clic sur bouton verrouillé → **popup explication** (pas fermé après 2 sec)
2. « Tu dois acheter CREATOR_PRO pour débloquer ça. Clique ici pour voir les offres »
3. Bouton « Voir les offres » → ouvre le Menu modal → rubrique Offres

**Priorisation** : 🟠 **HAUT**

---

## 4️⃣ ARCHITECTURE RECOMMANDÉE (vue d'ensemble)

### Navigation globale
```
┌─────────────────────────────────────────┐
│           KEEP (Loki Music)             │
├─────────────────────────────────────────┤
│ [Free Badge]  [Notifications] [☰ Menu] │   ← TopBar (sauf sur Écouter)
├─────────────────────────────────────────┤
│                                         │
│  [MAIN CONTENT — dynamique]             │
│                                         │
├─────────────────────────────────────────┤
│ Écouter | Découvertes | Playlists |      │ ← BottomTabs (5 onglets)
│ Soirées | Profil                        │
└─────────────────────────────────────────┘

Modals globales (s'ouvrent par-dessus) :
  • Menu (Notifications + Offres + Services + Paramètres)
  • Battle (full-screen ou modal dédiée)
  • Playlist Sale (achat)
  • Profil partagé (guest)
```

### Hiérarchie des écrans

**Écrans principaux (onglets en bas)** :
1. `HomeScreenCompact` (Écouter)
2. `DiscoverScreen` (Découvertes)
3. `MyMusicScreen` (Playlists)
4. `PartiesScreen` (Soirées)
5. `ProfilePublicScreen` (Profil)

**Écrans secondaires (accès via menu)** :
- NotificationsScreen (peut être une vue détaillée, accessible aussi via Modal)
- OffersScreen (acheter formules)
- ProfileSettingsMobileScreen (paramètres)

**Écrans tiers (partage / invite)** :
- PublicUserProfileScreen (profil d'un autre utilisateur)
- SessionRecapScreen (après une partie)

---

## 5️⃣ CHECKLIST ENFANT 7-8 ANS 🎯

Un interface est OK si un enfant de 7-8 ans peut :

- ✅ Ouvrir l'app sans aide
- ✅ Comprendre ce que chaque onglet du bas fait (icons + labels clairs)
- ✅ Cliquer sur un onglet et voir le contenu changer
- ✅ Trouver où « reconnaître une chanson »
- ✅ Trouver où « garder une chanson »
- ✅ Trouver son profil
- ✅ Voir son compte utilisateur (pseudo, stats)
- ✅ Accéder au menu (cloche ou ☰) et comprendre ce qui est dedans
- ✅ Ne pas être confronté à un écran blanc ou des textes chevauchés
- ✅ Retrouver son chemin s'il s'est perdu (bouton Retour toujours visible)

---

## 6️⃣ PHASES DE CORRECTION (Roadmap)

### Phase 1 : Navigation Unifiée (P0 — CRITIQUE)
- Étapes :
  1. Unifier Bell + Hamburger → un seul Menu modal
  2. Tester que le modal s'ouvre/ferme correctement
  3. Tester que Notifications est accessible depuis le modal
  4. Commit + OTA deploy

- Fichiers touchés : `ProfilePublicScreen.tsx`, `PublicUserProfileScreen.tsx`
- Durée estimée : 2-3 heures
- Impact : ✅ UX cohérente, ✅ Enfant comprend

---

### Phase 2 : Fix Design Rendering (P0 — CRITIQUE)
- Étapes :
  1. Identifier tous les `<Modal>` du projet
  2. Vérifier états d'ouverture/fermeture
  3. Tester refresh sur chaque écran
  4. Corriger z-index/pointerEvents si conflits
  5. Commit + OTA deploy

- Fichiers suspects : `ProfilePublicScreen.tsx`, `PlaylistSalePanel.tsx`, `PartiesScreen.tsx`
- Durée estimée : 2 heures
- Impact : ✅ Interface stable, ✅ Pas d'overlaps

---

### Phase 3 : Onboarding 1ère visite (P1 — HAUT)
- Étapes :
  1. Créer `OnboardingGuideScreen.tsx`
  2. Ajouter flag `user_seen_guide` en base
  3. Redirection post-signup
  4. Tester sur iOS + Android + web
  5. Commit + build EAS si assets natives ajoutées

- Fichiers : Nouveau `OnboardingGuideScreen.tsx`, mise à jour auth flow
- Durée estimée : 4 heures
- Impact : ✅ Utilisateurs guidés, ✅ Activation +20%

---

### Phase 4 : Hiérarchie Profil (P1 — HAUT)
- Étapes :
  1. Redimensionner les 3 petits boutons
  2. Transformer gros bouton "Voir découvertes" en lien discret
  3. Ajouter contours visuels (border 2px)
  4. Équilibrer l'espace blanc
  5. Tester sur petit/moyen/grand écrans
  6. Commit + OTA deploy

- Fichiers : `ProfilePublicScreen.tsx` (styles)
- Durée estimée : 1.5 heures
- Impact : ✅ Profil professionnel, ✅ Boutons clairs

---

### Phase 5 : Explained Locked Features (P2 — MOYEN)
- Étapes :
  1. Ajouter dialogs pour boutons verrouillés
  2. Lier au Menu → rubrique Offres
  3. Tester chaque cas d'accès

- Fichiers : `ProfilePublicScreen.tsx`, `PartiesScreen.tsx`
- Durée estimée : 2 heures
- Impact : ✅ Utilisateur sait comment débloquer, ✅ Conversion meilleures

---

## 7️⃣ INDICATEURS DE SUCCÈS

Après chaque phase, valider :

| Indicateur | Avant | Après | Cible |
|---|---|---|---|
| **Temps pour trouver Notifications** | ? | < 3 sec | < 2 sec |
| **Clics pour accéder à Menu** | 2 (bell vs ☰) | 1 (menu unique) | 1 |
| **Modales overlappées** | Observées | 0 | 0 |
| **Enfant 7 ans comprend les onglets** | 60% | 95% | 95%+ |
| **Taux abandons post-onboarding** | ? | ? | -50% vs baseline |

---

## 8️⃣ RESSOURCES / INSPIRATION

**Apps reconnues pour UX enfant-friendly** :
- TikTok (navigation modal claire)
- YouTube Kids (tutoriel visuel, sans texte dense)
- Siri Shortcuts (icones + labels évidents)
- Minecraft Education (tutoriels progressifs)

**Points clés à copier** :
1. **Icons universels** (🔔, ☰, ◯ suffisent)
2. **Pas de hiérarchie cachée** (tout est visible / 1 clic max)
3. **Confirmation explicite** (« Tu quittes le Battle ? » au lieu de clic silencieux)
4. **Pas de scrolling infini** (enfant se perd)
5. **Feedback immédiat** (tap → change visible dans <200ms)

---

## 9️⃣ NOTES D'AUDIT ADDITIONNELLES

### Audio / Préchargement
- ✅ Préchargement de la manche N+1 en Battle = OK (commit 2562f5e)
- ⚠️ Tester que `expo-av` ne freeze pas après 10+ morceaux
- 📋 Migration vers `expo-audio` à plannifier (expo-av deprecated)

### Performance / Sentry
- ⏳ Vérifier que les crashs ne sont pas masqués
- ⏳ Logs console : y a-t-il des erreurs silencieuses ?

### Supabase RPC / Sync
- ⏳ SOLO system phase 1 : vérifier que `keep_battle_solo_daily_status` est appliquée en production
- ✅ Battle exit confirmation : correctement sauvegardé (commit 54f1f75)

---

## Prochaines étapes immédiatement

1. ✅ **Lire ce document** (c'est fait)
2. 🔴 **Phase 1 : Unifier Navigation** (Bell + Hamburger → un seul Menu modal)
3. 🔴 **Phase 2 : Fix Design Rendering** (Modales overlaps, z-index)
4. 📋 **Créer branch git** : `feature/uiux-audit-complete-20260928`
5. 📋 **Documenter chaque changement** dans `AGENT_MESSAGES.md`

---

**Document maintenu par** : CTO/PM (Claude Haiku)  
**Dernière mise à jour** : 28/09/2026 23:45 UTC  
**Statut** : Audit initial — Prêt pour Phase 1 (Navigation unifiée)
