# PHASE 2 — Diagnostic et Réparation (Designs coincés après refresh)

**Date** : 28 septembre 2026  
**Statut** : Diagnostic complet + plan de réparation  
**Objectif** : Éliminer les modales "fantômes" qui persistent après refresh/navigation

---

## 🔍 Audit des Modales (State of the Art)

Modales identifiées dans le projet :

### ProfilePublicScreen (7 modales)
```typescript
1. menuOpen          → Menu modal (notifications + offres + services + settings)
2. styleModalOpen    → Parcourir par style
3. accountOpen       → Création/connexion compte
4. kindPickerOpen    → Sélection type profil (DJ, Artiste, etc.)
5. repriseListOpen   → Liste des reprises
6. shareOpen         → Partage profil
7. qrOpen            → Carte d'identité musicale
```

**Problème potentiel** : 7 variables d'état = 7 possibilités de conflits. Si deux sont true simultanément, z-index peut créer un overlap.

### PartiesScreen (5+ modales)
```typescript
1. statsEntry        → Stats détaillées
2. myRankingOpen     → Mon classement
3. createOpen        → Créer/modifier événement
4. participantsOpen  → Liste participants
5. eventDetailOpen   → Détails événement
6. ticketModalOpen   → Modal tickets
7. reviewTarget      → Review personne
+ battleOpen (gère l'overlay Battle qui n'est pas un <Modal> mais un render conditionnel)
```

### Autres fichiers
- PlaylistSaleImmersivePreview : 1 modal
- SourceProfileQuickView : modal dédiée
- MusicSwipeDeckModal : modal dédiée
- Autres composants : AlertHost, AccountGateModal, etc.

---

## 🎯 Causes racines possibles

### Cause 1 : État initial incorrect après refresh
**Symptôme** : Refresh (F5) → modale reste visible en arrière-plan  
**Techniquement** :
- React Native Web modal ne nettoie pas le DOM correctement
- Backdrop reste avec opacity > 0

**Diagnostic** : Ouvrir DevTools (F12), chercher `<Modal>` en DOM après refresh → si présent = problème

**Fix** : Ajouter `useEffect` pour reset toutes les modales au démarrage

### Cause 2 : Modales multiples ouvertes simultanément
**Symptôme** : Clic sur A → ouvre Modal A. Clic rapide sur B → Modal B s'ouvre PAR-DESSUS. Les deux se chevauchent.  
**Techniquement** :
- `setMenuOpen(true)` ET `setStyleModalOpen(true)` exécutés en même temps
- React rend les deux `<Modal visible={true}>`

**Diagnostic** : Vérifier que clics rapides sur boutons différents ne causent pas d'overlaps

**Fix** : Ajouter guard clauses qui ferment les autres modales avant d'en ouvrir une nouvelle

### Cause 3 : Z-index mal géré sur web
**Symptôme** : Backdrop visible mais contenu pas clickable  
**Techniquement** : 
- React Native Web utilise `zIndex` différemment que CSS pur
- Plusieurs modales avec z-index auto-calculé créent des conflits

**Diagnostic** : DevTools → vérifier z-index de chaque modal

**Fix** : Utiliser z-index explicite croissant (1000, 1001, 1002, etc.)

### Cause 4 : Modal n'a pas d'onRequestClose correct
**Symptôme** : Backdrop noir reste même après clic sur Fermer  
**Techniquement** :
- `onRequestClose` appelé mais état pas mis à jour
- ou `onRequestClose` appelle une fonction qui throw une erreur silencieuse

**Diagnostic** : Console (F12) → vérifier qu'aucune erreur lors du clic Fermer

**Fix** : Tester chaque bouton Fermer manuellement

---

## 📋 Checklist de Diagnostic (À faire manuellement)

### Test 1 : Refresh → Pas de ghost modal
- [ ] Ouvrir `/KEEP` sur web
- [ ] Aller au Profil (onglet 5)
- [ ] Cliquer Bell (🔔) → Menu s'ouvre
- [ ] F5 (refresh)
- [ ] ❓ Menu reste-t-il visible ? Si OUI = bug. Si NON = OK ✅

### Test 2 : Clic Fermer → Modal disparaît
- [ ] Menu ouvert
- [ ] Clic [Fermer]
- [ ] ❓ Menu disparaît complètement ? Si OUI = OK ✅. Si NON (shadow reste) = bug

### Test 3 : Deux modales simultanées = refusées
- [ ] Menu ouvert
- [ ] Simultanément : clic Bell + clic Hamburger
- [ ] ❓ Quelle modale s'affiche ? Si un seul menu = OK ✅. Si deux s'ouvrent = bug

### Test 4 : Modal sur petit écran
- [ ] DevTools → mobile view (iPhone SE 375px)
- [ ] Aller à Profil
- [ ] Ouvrir menu
- [ ] Scroll → contenu scrollable ou coupé ?
- [ ] ❓ Contenu lisible + scroll fonctionne ? Si OUI = OK ✅

### Test 5 : Modales sur autres écrans
- [ ] HomeScreenCompact → NotificationsScreen ?
- [ ] PartiesScreen → Ouvrir Battle → Refresh → Interface ok ?
- [ ] MyMusicScreen → Playlist sale modal ?

---

## 🛠️ Stratégie de Réparation (Phases)

### Repair Phase A : Ajout garde-fous universels (2h)

**Fichier cible** : Créer `packages/mobile/src/utils/modalStateManager.ts`

```typescript
// Gérer l'état global de tous les modales pour éviter les conflits
export const useModalState = () => {
  const [openModals, setOpenModals] = useState<Set<string>>(new Set());
  
  const open = (id: string, closeOthers = true) => {
    if (closeOthers) {
      setOpenModals(new Set([id]));
    } else {
      setOpenModals((prev) => new Set([...prev, id]));
    }
  };
  
  const close = (id: string) => {
    setOpenModals((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  
  const isOpen = (id: string) => openModals.has(id);
  
  return { open, close, isOpen, openModals };
};
```

**Application** : 
1. ProfilePublicScreen : utiliser `useModalState()` pour toutes les 7 modales
2. PartiesScreen : utiliser `useModalState()` pour ses 5+ modales
3. Bénéfice : Un seul modal à la fois, pas d'overlaps

**Tests** : 
- [ ] Clik Bell + Hamburger rapidement → Seul le dernier s'ouvre
- [ ] Refresh → Aucune modale visible

### Repair Phase B : Reset d'état au montage (1h)

**Fichier cible** : Chaque écran avec modales

```typescript
useEffect(() => {
  // Reset ALL modales au montage
  setMenuOpen(false);
  setStyleModalOpen(false);
  setAccountOpen(false);
  setKindPickerOpen(false);
  setRepriseListOpen(false);
  setShareOpen(false);
  setQrOpen(false);
  setExpandedMenuItem(null);
}, []);
```

**Bénéfice** : Élimine les modales "fantômes" après refresh

**Tests** : 
- [ ] Refresh sur chaque écran → Aucune modale ne persiste

### Repair Phase C : Ajout z-index explicite (1h)

**Fichier cible** : Styles ProfilePublicScreen + PartiesScreen

```typescript
const zIndex = {
  menuDrawerBackdrop: 1000,
  modalBackdrop: 1001,
  styleModalBackdrop: 1001,
  accountModalBackdrop: 1001,
  // etc.
};

// Utiliser dans les styles
menuDrawerBackdrop: {
  ...existing,
  zIndex: zIndex.menuDrawerBackdrop,
}
```

**Bénéfice** : Évite les conflits de z-index implicites

**Tests** : 
- [ ] Deux modales ouvertes → Celle en avant a plus haut z-index

### Repair Phase D : Simplification menu (2h)

**Objectif** : Réduire de 7 modales à ~3-4 modales max

**Stratégie** :
1. Menu modal (menuOpen) = modal unique pour tout
2. Battlescreen modal = gérée séparément
3. Modales "action" (QR, partage) = keep but non-conflictuelles

**Bénéfice** : Moins de possibilités de conflits

---

## ✅ Checklist finale de validation

- [ ] Refresh sur tous les écrans → pas de modale fantôme
- [ ] Clic Bell/Hamburger → menu s'ouvre
- [ ] Clic Fermer → menu disparaît complètement
- [ ] Deux clics rapides → un seul modal ouvert
- [ ] Mobile + desktop → responsive OK
- [ ] Aucune erreur console
- [ ] Performance acceptable (< 100ms modale open)

---

## 📈 Prochaines étapes

1. ✅ Diagnostic complet (ce document)
2. ⏳ Tester manuellement via web export
3. ⏳ Phase A : Ajout garde-fous
4. ⏳ Phase B : Reset d'état
5. ⏳ Phase C : Z-index explicite
6. ⏳ Phase D : Simplification (optionnel)
7. ⏳ Validation finale + déploiement OTA

---

**Document créé par** : CTO (Claude Haiku)  
**Prochaine étape** : Exécuter Repair Phases A-B (3h estimé)
