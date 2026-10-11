# Loki Music — Refonte profil par styles + commerce social

Date : 24/09/2026  
Statut : **DESIGN VALIDÉ PAR ADEL — référence d’intégration**  
Branche : `reconcile/claude-main-20260825`

## 1. Objectif produit

Le profil devient un **univers musical par styles**, pas une longue liste de morceaux.

But :
- comprendre un profil en moins de 2 clics ;
- permettre à un visiteur d’écouter immédiatement un style ;
- rendre visibles et désirables les sélections payantes sans révéler titre/artiste/jaquette avant achat ;
- permettre au propriétaire de gérer ses ventes directement depuis son profil ;
- conserver absolument toutes les fonctions existantes.

Aucune suppression fonctionnelle. Les longues listes restent accessibles comme vue secondaire `Voir tous les morceaux`.

## 2. Règles immuables

- Ne pas modifier `packages/mobile/App.tsx`, `Navigation.tsx` ni la barre des 5 onglets.
- Même design system sur Écouter / Découvertes / Playlists / Soirées / Profil.
- Couleurs : violet = action principale ; menthe = garder/succès ; corail = passer/danger.
- Toutes les actions existantes restent accessibles en 1 ou 2 taps.
- Aucun dark pattern : engagement par valeur, découverte, communauté, progression et simplicité.
- Toute donnée commerciale réelle vient de Supabase ; aucun faux compteur, faux stock, faux “très demandé”.
- Marketplace iOS reste derrière le feature flag tant que le paiement n’est pas conforme App Store.

## 3. Profil visité — hiérarchie cible

### A. Hero compact
1. Avatar + pseudo + certification.
2. Type de profil + ville/pays.
3. Bio courte.
4. Boutons :
   - `SUIVRE / ABONNÉ(E)`
   - `PARTAGER`
5. Compteurs : morceaux, abonnés, reprises.
6. CTA pleine largeur : `▶ ÉCOUTER SON UNIVERS`.

### B. SES STYLES — contenu principal
Grille 2 colonnes mobile.

Carte gratuite :
- nom du style : FUNK / HOUSE / RAP / R&B / etc.
- nombre de morceaux ;
- visuel/pochette représentative si autorisée ;
- mini bouton lecture ;
- tap = Swipe continu de ce style.

Carte payante :
- cadenas visible ;
- nom du style ou nom de collection ;
- nombre de découvertes ;
- prix total ;
- texte court : `Aperçu audio disponible` ;
- aucun titre/artiste/jaquette de morceau avant achat ;
- tap = `PlaylistSaleImmersivePreview`.

Exemple :
`TECHNO 🔒 · 27 découvertes · 4,99 €`

### C. Après achat
Même carte, mais :
- cadenas supprimé ;
- badge `✓ Débloqué` ;
- titres/artistes/jaquettes accessibles selon les droits ;
- CTA `▶ ÉCOUTER CE STYLE`.

### D. Contenu secondaire compact
Sous les styles :
- `Artistes favoris ›`
- `Loki Music DNA ›`
- `Communauté ›`
- `Battle & progression ›`
- `Réseaux & site ›`
- `Voir tous les morceaux ›`

Les blocs existants sont déplacés/repliés, jamais supprimés.

## 4. Profil propriétaire — même architecture

Le propriétaire voit la même structure que les visiteurs pour comprendre immédiatement sa vitrine.

Hero :
- `▶ SWIPE`
- rangée secondaire :
  - `INVITER / PARTAGER`
  - `💰 VENDRE / GÉRER MES VENTES`

Le bouton Vente ouvre le flux existant `PlaylistSale`.  
Le bouton Invitation/Partage ouvre le flux existant de partage/referral.

### SES STYLES
Chaque dossier affiche son état :
- `PUBLIC`
- `PRIVÉ`
- `EN VENTE · 4,99 €`

Actions dossier :
- `▶ SWIPE`
- `✎ Renommer`
- `🏷 Mettre en vente` ou `Gérer la vente`

La longue liste n’est plus la vue principale. Elle reste derrière `Voir tous les morceaux`.

## 5. Vente — objet commercial cible

On ne présente pas une “ligne de musique à vendre”. On présente une **collection de découvertes**.

Carte payante :
- style/nom ;
- quantité ;
- prix ;
- bénéfice clair : `Écoute les extraits avant de débloquer`.

Aperçu immersif :
- logo/animation Loki ;
- waveform ;
- extraits audio masqués ;
- numéro d’extrait ;
- prix ;
- CTA `DÉBLOQUER · X,XX €`.

Interdit avant achat :
- titre réel ;
- artiste réel ;
- jaquette réelle ;
- lien externe permettant d’identifier le morceau.

## 6. Playlists

Navigation visuelle cible :
- `STYLES`
- `PLAYLISTS`
- `ARTISTES`

Section `Mes découvertes` et `Mes reprises` conservée.

Les Smart Albums/Vibes deviennent le moteur automatique derrière `Styles` :
- classement automatique ;
- renommage propriétaire ;
- regroupement par genre ;
- vente au niveau dossier.

## 7. Soirées

Conserver le design validé.

Hiérarchie :
- Hero événement ;
- lieu/date/styles/participants ;
- CTA `J’Y VAIS` ;
- sous-onglets :
  - `Lobby`
  - `Classement`
  - `Ambiance` (libellé visuel proposé pour l’actuel contenu Playlist).

Aucune logique RSVP/billet/QR/participants supprimée.

## 8. Découvertes

Priorité visuelle :
1. personne ;
2. styles ;
3. compatibilité ;
4. passer / profil / suivre.

Les réglages distance/recherche deviennent compacts et secondaires, sans supprimer leur logique.

## 9. Écouter

Conserver la refonte actuelle :
- état micro évident ;
- waveform ;
- morceau ;
- PASSER / GARDER / ARRÊTER ;
- swipe facultatif.

C’est le modèle de simplicité à répliquer dans les autres écrans.

## 10. Inscription / onboarding

Objectif : montrer la valeur avant de demander un effort.

Parcours :
1. essai immédiat ;
2. premier “aha moment” : écouter/découvrir/garder ;
3. création de compte ;
4. choix rapide des styles ;
5. arrivée sur un profil déjà organisé par styles.

À la création :
- expliquer en une ligne : `Tes découvertes seront rangées automatiquement par style.`
- expliquer en une ligne : `Plus tard, tu pourras partager ou vendre certaines collections si ton accès le permet.`

Pas de promesse de revenu garanti.

## 11. Super Admin

Le Super Admin pilote les règles, pas le design écran par écran.

À exposer/maintenir :
- feature flag marketplace ;
- seuil d’accès vente ;
- prix autorisés ;
- auto-classement Smart Albums ;
- renommage autorisé ;
- masquage pré-achat ;
- durée/protection preview ;
- visibilité des fonctions selon plan ;
- textes remote_config ;
- conformité iOS/Android.

Aucun secret dans le client.

## 12. Règle “2 clics maximum”

| Objectif | Parcours |
|---|---|
| Écouter du Funk | Profil → Funk |
| Écouter toute la collection | Profil → Écouter son univers |
| Préécouter une offre | Profil → Style 🔒 |
| Acheter | Style 🔒 → Débloquer |
| Vendre un style | Mon profil → Style → Mettre en vente |
| Gérer mes ventes | Mon profil → Vendre |
| Inviter | Mon profil → Inviter/Partager |
| Voir une soirée | Soirées → carte |
| Écouter l’ambiance | Soirée → Ambiance |

## 13. Fichiers d’intégration

- Profil propriétaire : `packages/mobile/src/screens/ProfilePublicScreen.tsx`
- Profil visité : `packages/mobile/src/screens/PublicUserProfileScreen.tsx`
- Bibliothèque : `packages/mobile/src/screens/MyMusicScreen.tsx`
- Vente : `packages/mobile/src/components/PlaylistSalePanel.tsx`
- Preview : `packages/mobile/src/components/PlaylistSaleImmersivePreview.tsx`
- Soirées : `packages/mobile/src/screens/PartiesScreen.tsx`
- Découvertes : `packages/mobile/src/screens/DiscoverScreen.tsx`
- Écouter : `packages/mobile/src/screens/HomeScreenCompact.tsx`
- Onboarding : `packages/mobile/src/screens/onboarding/OnboardingScreen.tsx`
- Smart styles : `packages/mobile/src/services/smartAlbumService.ts`

## 14. Ordre d’intégration

1. Profil visité : grille Styles gratuits + payants.
2. Profil propriétaire : grille Styles + bouton direct Vendre + Inviter/Partager.
3. Playlists : Styles en vue prioritaire, longue liste secondaire.
4. Vente : rattacher chaque dossier verrouillé à sa vraie offre, jamais `saleOffers[0]`.
5. Découvertes : compacter filtres.
6. Soirées : harmoniser le libellé Ambiance.
7. Onboarding : promesse “tes musiques se rangent automatiquement”.
8. Super Admin : vérifier que les flags/règles couvrent toute la chaîne.
9. Tests Web 390×844 puis natif.

## 15. Critères de sortie

- 20 000 morceaux restent navigables sans liste principale infinie.
- Un visiteur comprend le profil, les styles et les ventes sans explication.
- Aucun contenu payant n’est révélé par un autre chemin.
- Le propriétaire voit exactement ce que verra un visiteur.
- Vente et invitation accessibles directement depuis le profil.
- Toutes les fonctions historiques restent accessibles.
- Aucun refresh nécessaire après mutation.


## 16. Interactions sociales sans messagerie

Décision produit validée le 24/09/2026 : **aucune messagerie utilisateur-à-utilisateur** dans Loki Music. Les interactions sociales doivent rester instantanées, publiques ou semi-publiques, sans conversation privée.

### Remplacement des emplacements “Message / Contacter”
- Aucun bouton Message/DM ne doit être ajouté au profil mobile.
- Si une maquette contient un emplacement Message, il devient **❤️ J’AIME TON UNIVERS**.
- Le like est un toggle simple, sans texte libre, qui déclenche une notification sociale au propriétaire.
- Le profil visité garde aussi : **+ SUIVRE**, **⚡ DÉFIER EN BATTLE**, **↗ PARTAGER**, **▶ ÉCOUTER SON UNIVERS**.

### Notifications virales
- À l’arrivée d’une nouvelle notification : toast/ruban court visible immédiatement.
- Tant qu’il reste au moins une notification non lue : badge rouge sur la cloche + ruban compact **🔔 X nouveautés · Voir**.
- Le ruban persistant disparaît seulement quand les notifications concernées sont lues/supprimées.
- Les rappels événementiels peuvent remplacer le texte générique par **🎉 Soirée ce soir · Voir** ou le libellé de l’événement.
- Le centre existant conserve : lire une notification, tout marquer comme lu, supprimer une notification, tout supprimer.

### Commerce
- Une offre en vente est un produit visible : nom de collection/style, quantité, prix, cadenas, CTA **▶ ÉCOUTER UN APERÇU**.
- Un aperçu ne révèle jamais titre/artiste/jaquette avant achat.
- Les événements sociaux autour d’une offre (mise en vente, déblocage, achat confirmé selon conformité plateforme) alimentent les notifications, sans ouvrir de chat.
