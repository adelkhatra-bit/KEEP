# KEEP — Audit des modales (24/08/2026)

Audit LECTURE SEULE demandé explicitement par Adel — aucune correction
appliquée dans ce document, uniquement des faits vérifiés par lecture
directe du code (jamais une supposition). 6 modales trouvées sur 4 écrans.

## Inventaire réel

| Écran | Modale | Contenu |
|---|---|---|
| HomeScreen | `showEndPrompt` | Confirmation fin de session (2 boutons) |
| DiscoverScreen | `openedProfile` | Détail profil visité (bio, artistes, upgrade) |
| MyMusicScreen | `createModalOpen` | Créer une playlist (TextInput) |
| MyMusicScreen | `renameTarget` | Renommer un morceau (TextInput) |
| ProfileScreen | `qrVisible` | QR code de profil |
| ProfileScreen | `previewVisible` | Aperçu "Voir comme visiteur" (contenu riche) |

## Tailles

Toutes utilisent `maxWidth: 380, width: '100%', alignSelf: 'center'` SAUF
la modale de fin de session (HomeScreen) et celle de rename/create
(MyMusicScreen), qui n'ont pas de `maxWidth` explicite — sur un écran très
large (tablette/desktop web), leur largeur suivrait uniquement le padding
de l'overlay, potentiellement trop large par rapport aux autres modales de
l'app. Incohérence réelle, pas critique.

## Marges

`padding: spacing.xl` sur l'overlay dans les 6 cas (cohérent). Padding
interne de la carte cohérent (`spacing.xl` ou `spacing.lg`) partout.

## Fermeture

- **`onRequestClose` présent** (bouton retour Android géré) : DiscoverScreen,
  les 2 de MyMusicScreen, les 2 de ProfileScreen.
- **`onRequestClose` ABSENT** : HomeScreen (`showEndPrompt`). Sur Android,
  le bouton retour physique ne fermera pas cette modale (ou pire, sortira
  de l'app selon le comportement par défaut de RN) — **incohérence réelle
  à corriger**, c'est la seule des 6 dans ce cas.
- Fermeture par tap sur l'overlay (hors de la carte) : **absente partout**
  (aucune des 6 ne ferme au tap extérieur) — cohérent au moins entre elles,
  mais s'écarte d'une convention mobile courante ; à confirmer si voulu.

## Hiérarchie

Titre (`typography.h3` ou équivalent) toujours en premier, cohérent. Les
modales à 2 actions (HomeScreen, MyMusicScreen×2) suivent le même schéma
"annuler/action neutre à gauche, action engageante à droite" — cohérent.

## Boutons

- Boutons d'action avec `minHeight: 48` explicite : HomeScreen uniquement.
- MyMusicScreen (`modalCancelBtn`/`modalConfirmBtn`) et ProfileScreen
  (`qrCloseBtn`) : pas de `minHeight` explicite trouvé, dépendent du
  padding seul pour atteindre une cible tactile correcte — **non vérifié
  visuellement, à confirmer avant de déclarer conforme aux 48px du Design
  System**.
- DiscoverScreen `upgradeBtn` : même remarque.

## Comportement mobile / scroll

- **DiscoverScreen** (`openedProfile`) : liste d'artistes en chips, sans
  `ScrollView` ni `maxHeight` sur `modalCard` — un profil avec beaucoup
  d'artistes distincts peut pousser le contenu hors de l'écran, y compris
  le bouton "Fermer", sans moyen de scroller. **Trouvaille réelle, priorité
  moyenne** (dépend du volume réel de données, pas garanti de se produire).
- **ProfileScreen** (`previewVisible`) : `previewFrame` a `overflow: 'hidden'`
  explicite, PAS de scroll — l'aperçu "Voir comme visiteur" embarque
  `PublicProfilePreview` (profil complet avec sessions/playlists). Sur un
  compte avec du contenu réel, une partie du profil sera **coupée
  silencieusement**, jamais visible, jamais signalée à l'utilisateur.
  **Trouvaille réelle, priorité plus haute** que la précédente — un
  aperçu tronqué sans le savoir est trompeur (l'utilisateur croit voir tout
  son profil public).
- Aucune des 6 modales n'a de `maxHeight` défini sur sa carte — dépendent
  toutes de la taille du contenu + de l'écran.

## Clavier

- **MyMusicScreen** (`createModalOpen` et `renameTarget`) : contiennent un
  `TextInput` avec `autoFocus` (le clavier s'ouvre automatiquement), mais
  **aucun `KeyboardAvoidingView`** ne les enveloppe — contrairement à
  `OnboardingScreen.tsx` qui utilise déjà ce pattern pour son propre
  formulaire. `modalOverlay` centre verticalement (`justifyContent:
  'center'`) : sur un vrai téléphone, le clavier peut couvrir la carte ou
  le bouton de confirmation. **Trouvaille réelle, priorité haute** — ce
  sont les 2 SEULES modales avec saisie clavier de toute l'app, et les 2
  ont le même gap.

## Cohérence des fonds

- `modalOverlay` : `rgba(0,0,0,0.6)` sur HomeScreen/DiscoverScreen/MyMusicScreen,
  mais `rgba(0,0,0,0.7)` sur ProfileScreen (les 2 modales `qrVisible`/`previewVisible`).
  **Incohérence réelle, mineure** — à uniformiser sur `0.6` (la valeur
  majoritaire, 4 modales sur 6).
- `backgroundElevated` pour la carte : cohérent sur les 6.

## Résumé priorisé (rien corrigé, audit seul)

1. **Clavier sans `KeyboardAvoidingView`** (MyMusicScreen ×2) — impact réel utilisateur le plus probable.
2. **Aperçu profil tronqué sans scroll** (ProfileScreen `previewVisible`) — trompeur, silencieux.
3. **`onRequestClose` absent** (HomeScreen) — impact Android uniquement.
4. Overlay 0.6 vs 0.7, `maxWidth` manquant sur 2 modales, `minHeight` bouton non confirmé sur 3 modales — cohérence, priorité basse.
5. Chips sans scroll (DiscoverScreen) — dépend du volume de données réel.
