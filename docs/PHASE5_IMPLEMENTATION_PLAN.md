# PHASE 5 — Kids-Friendly Implementation (28 septembre 2026)

## ✅ Composants crées (commit 62422a9)

- KidsFriendlyErrorBanner ✅
- KidsEmptyState ✅
- KidsLoadingSpinner ✅
- KidsButton (56px min) ✅
- KidsModal ✅

Exports: `src/components/index.kids.ts`

## 🎯 Stratégie d'intégration

**Appro che**: Remplacer progressivement tous les:
1. ❌ `Alert.alert()` harsh messages → KidsModal + kid-friendly wording
2. ❌ `setError(rawMessage)` → KidsFriendlyErrorBanner
3. ❌ Petits boutons (<48px) → KidsButton (56px)
4. ❌ Vides lists → KidsEmptyState
5. ❌ `console.error` silencieuses → KidsFriendlyErrorBanner visible

**Fichiers prioritaires** (par impact utilisateur):
1. **PartiesScreen.tsx** — Battle (jeu, haute friction si erreur)
2. **ProfilePublicScreen.tsx** — Profil (navigation principale)
3. **DiscoverScreen.tsx** — Découvertes (jeu principal)
4. **HomeScreenCompact.tsx** — Accueil/Écouter
5. **MyMusicScreen.tsx** — Playlists

## 📋 Checklist par écran

### PartiesScreen.tsx
- [ ] Remplacer `Alert.alert()` par KidsModal
- [ ] `setError()` state → afficher KidsFriendlyErrorBanner
- [ ] Boutons de Battle : vérifier taille >= 56px
- [ ] Wording technique → kid-friendly

### ProfilePublicScreen.tsx  
- [ ] Boutons APERÇU/PÉPITES/BATTLE → vérifier 56px
- [ ] Dialogs verrouillés → KidsModal
- [ ] Menu → Kid-friendly labels

### DiscoverScreen.tsx
- [ ] Erreurs swipe → KidsFriendlyErrorBanner  
- [ ] Boutons GARDER/PASSER → 56px vérifié
- [ ] Vide playlist → KidsEmptyState

### HomeScreenCompact.tsx
- [ ] Erreurs reconnaissance → KidsFriendlyErrorBanner
- [ ] Bouton "Reconnaitre" → 56px vérifié

### MyMusicScreen.tsx
- [ ] Playlist vide → KidsEmptyState avec emoji pertinent
- [ ] Actions playlist → boutons 56px

## 🚀 Commandes intégration

```bash
# Chercher tous les Alert.alert() à remplacer
grep -rn "Alert.alert" packages/mobile/src/screens --include="*.tsx"

# Chercher tous les setError() à remplacer
grep -rn "setError" packages/mobile/src/screens --include="*.tsx"

# Vérifier cibles tactiles  
grep -rn "height.*[0-9]\|padding.*[0-9]" packages/mobile/src/screens --include="*.tsx"
```

## 📊 Métriques de succès

| Métrique | Target | Comment tester |
|---|---|---|
| Tous boutons >= 56px | 100% | `grep paddingVertical` sur min height |
| Erreurs tech visibles | 0 | User voit message ami, pas crash |
| Wording enfant | 100% | Lire tout message visible |
| Refonte complète | 5/5 écrans | Tous touchés et testés |

## ⏱️ Timeline

- **Immédiat** : Commencer PartiesScreen + ProfilePublicScreen
- **<2h** : Compléter intégration tous écrans
- **<30min** : Tests web + refresh
- **<15min** : OTA deploy trigger
- **<1h** : Tests device réel (si possible)

## 🎬 Commencer maintenant

1. Lire les écrans prioritaires
2. Remplacer Alert.alert() par KidsModal dans PartiesScreen
3. Ajouter KidsFriendlyErrorBanner où setError/console.error existent
4. Commit + push
5. Tests web validation

---

**Statut** : Phase 5 lancée, intégration massive en cours
**Auteur** : Claude Haiku (CTO/PM)
**Date** : 28 septembre 2026 23:45 UTC
