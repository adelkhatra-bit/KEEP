# KEEP — Design System

Statut : proposition à valider avant implémentation. Ce document unifie l'identité existante sans modifier les écrans actuels.

## 1. Principes

- **Spotify** : priorité au contenu musical, surfaces sombres, une action dominante.
- **Bandcamp** : prix, achat et propriété immédiatement compréhensibles.
- **Instagram** : identité compacte, collection visuelle, actions sociales prévisibles.
- Une couleur = une intention : violet pour naviguer/agir, menthe pour GARDER/succès, corail pour PASSER/danger.
- Ne jamais supprimer une fonction pour alléger un écran : utiliser sections, accordéons ou sous-menus accessibles en 1–2 taps.

## 2. Palette de couleurs

### Marque et actions

| Token | Hex | Nom d'usage | Usage |
|---|---:|---|---|
| `brand.primary` | `#7C5CFC` | Violet KEEP | CTA principal, sélection, lien actif |
| `brand.primaryDark` | `#5B3FE0` | Violet pressé | État pressed, dégradé |
| `brand.primaryLight` | `#A78BFA` | Lavande KEEP | Focus, icônes, accents légers |
| `brand.secondary` | `#2DE1C2` | Menthe KEEP | GARDER, succès, validation |
| `brand.secondaryDark` | `#22B8A0` | Menthe pressée | État pressed positif |

### Sémantique

| Token | Hex | Nom d'usage | Usage |
|---|---:|---|---|
| `semantic.success` | `#2DE1C2` | Succès | Confirmation, disponible, connecté |
| `semantic.danger` | `#FF5C72` | Corail | PASSER, erreur, suppression, blocage |
| `semantic.dangerPressed` | `#E14A5F` | Corail pressé | État pressed destructif |
| `semantic.warning` | `#FFB454` | Ambre | Alerte non bloquante, essai, attente |
| `semantic.info` | `#5CA8FC` | Bleu information | Aide, information, statut technique |
| `semantic.like` | `#FF5F83` | Rose social | Like uniquement |

### Neutres

| Token | Hex | Nom d'usage | Usage |
|---|---:|---|---|
| `neutral.canvas` | `#0B0A12` | Fond principal | Fond de tous les écrans |
| `neutral.surface` | `#151320` | Surface élevée | Sections, modales, menus |
| `neutral.card` | `#1C1930` | Carte | Cartes et lignes interactives |
| `neutral.border` | `#2A2640` | Bordure | Séparateurs et contours calmes |
| `neutral.textPrimary` | `#FFFFFF` | Texte principal | Titres, valeurs, actions |
| `neutral.textSecondary` | `#E5E0EC` | Texte secondaire | Métadonnées utiles |
| `neutral.textMuted` | `#B8B2C4` | Texte discret | Aides et légendes non critiques |
| `neutral.disabled` | `#7D7789` | Désactivé | Texte/icône inactive seulement |
| `neutral.black` | `#000000` | Noir | Texte sur menthe claire si nécessaire |

### États interactifs

| État | Règle |
|---|---|
| Repos | Couleur du composant + contraste AA |
| Hover web | Éclaircir la surface de 8 % ; ne jamais déplacer le contenu |
| Pressed | `primaryDark`, `secondaryDark` ou `dangerPressed` + scale `0.98` |
| Focus | Anneau `2 px #A78BFA`, décalage `2 px` ; jamais supprimé |
| Actif/sélectionné | Fond `rgba(124,92,252,0.18)` + bordure `#7C5CFC` |
| Disabled | Opacité `0.45`, aucune ombre, action bloquée |
| Loading | Libellé conservé si possible + indicateur ; largeur stable |

## 3. Typographie

- Famille native : San Francisco sur iOS, Roboto sur Android, `system-ui` sur le Web.
- Aucun téléchargement de police requis. Respecter le réglage de taille système.

| Style | Taille | Ligne | Poids | Usage |
|---|---:|---:|---:|---|
| `h1` | 32 | 40 | 700 | Titre d'écran unique |
| `h2` | 26 | 32 | 700 | Identité, titre de modale |
| `h3` | 20 | 26 | 600 | Titre de section |
| `body` | 16 | 24 | 400 | Texte courant |
| `bodyMedium` | 16 | 24 | 500 | Métadonnée importante |
| `bodyBold` | 16 | 24 | 700 | Action ou valeur forte |
| `caption` | 14 | 20 | 500 | Compteur, date, aide |
| `small` | 12 | 16 | 500 | Badge court uniquement |
| `button` | 15 | 20 | 700 | Boutons, casse normale recommandée |

Règles : un seul `h1` par écran ; `h2` pour l'identité ; `h3` pour les sections ; jamais de texte fonctionnel sous 12 px ; majuscules réservées aux libellés courts.

## 4. Espacements et formes

- Grille de base : `4 px`.
- Échelle : `4 / 8 / 12 / 16 / 24 / 32 / 48`.
- Padding horizontal écran mobile : `16 px` + safe area.
- Carte compacte : `12 px` ; carte standard : `16 px` ; carte mise en avant : `20 px`.
- Entre éléments liés : `8 px` ; entre groupes : `16 px` ; entre sections : `24 px`.
- Liste : ligne minimale `64 px`, contenu dense autorisé à `56 px` si la cible tactile reste ≥ `44 px`.
- Rayons : petit `8 px`, moyen `12 px`, grand `16 px`, modal `24 px`, rond `999 px`.
- Ombres rares : préférer surface + bordure ; ombre seulement pour modal, menu flottant ou CTA superposé.

## 5. Composants réutilisables

### Boutons

- Hauteur standard `48 px`, compact `36 px`, cible tactile toujours ≥ `44 × 44 px`.
- **Primaire** : fond `#7C5CFC`, texte blanc, rayon `24 px`; une seule action primaire par zone.
- **Positif/GARDER** : fond `#2DE1C2`, texte `#000000`; réservé à la conservation/validation.
- **Danger/PASSER** : fond ou contour `#FF5C72`; jamais utilisé pour GARDER.
- **Secondaire** : surface `#1C1930`, bordure `#7C5CFC`, texte blanc.
- **Ghost** : fond transparent, texte `#A78BFA`; pour fermer, retour ou action tertiaire.
- **Icône** : `44 × 44 px`, cercle ou carré arrondi, label d'accessibilité obligatoire.

### Cartes

- **Profil** : avatar `64 px`, identité, certification et actions ; padding `16 px`, rayon `16 px`.
- **Morceau** : pochette `56 px`, titre + artiste, lecture visible, actions secondaires regroupées.
- **Offre** : pochette `64 px`, nom, nombre de titres, prix très lisible, CTA d'achat explicite.
- **Section** : fond `#151320`; **élément interactif** : fond `#1C1930`; bordure `1 px #2A2640`.

### Badges

- Hauteur `24–28 px`, padding horizontal `8 px`, rayon rond.
- Certification : couleur du niveau + coche + libellé accessible.
- Statut : toujours texte + couleur (`Disponible`, `Privé`, `Connecté`), jamais couleur seule.
- Compteur : chiffres tabulaires si disponibles ; `99+` au-delà de 99 pour les notifications.

### Inputs

- Hauteur minimale `48 px`, rayon `12 px`, padding horizontal `12 px`.
- Fond `#151320`, bordure repos `#2A2640`, focus `#A78BFA`, erreur `#FF5C72`.
- Label persistant au-dessus ; placeholder non utilisé comme seul label ; erreur sous le champ.
- Recherche : icône à gauche, effacement à droite, action clavier explicite.

### Modales et panneaux

- Mobile : bottom sheet pour choix courts ; plein écran pour Swipe, formulaires longs et contenus immersifs.
- Rayon supérieur `24 px`, padding `16–24 px`, fond `#151320`, backdrop noir à `72 %`.
- Hauteur maximale sheet `90 %`; poignée, titre, fermeture et scroll interne obligatoires.
- Ouverture `220 ms`, fermeture `180 ms`; le focus revient au déclencheur sur le Web.

### Listes

- Ligne : `56–72 px`, séparateur `1 px #2A2640`, aucun double contour.
- Zone principale cliquable ; actions secondaires à droite ou dans un menu contextuel.
- États obligatoires : chargement, vide, erreur avec réessai, contenu, fin de liste.
- Une ligne de morceau conserve pochette, titre, artiste, lecture, statut et actions disponibles.

## 6. Micro-interactions

- Rapide `120 ms` : tap, hover, changement de couleur.
- Normale `220 ms` : accordéon, sheet, apparition d'une carte.
- Lente `320 ms` : transition immersive ou changement important de contexte.
- Courbe standard : `cubic-bezier(0.2, 0, 0, 1)` ; sortie : `cubic-bezier(0, 0, 0.2, 1)`.
- Tap : opacité `0.88` + scale `0.98`; retour à `1` sans rebond excessif.
- Succès : couleur + icône + texte ; erreur : vibration légère native si autorisée + message exploitable.
- Navigation : conserver les transitions natives ; aucun effet décoratif ne doit retarder une action.
- Respecter `Reduce Motion` : remplacer mouvement/scale par un fondu ≤ `120 ms`.

## 7. Accessibilité

- WCAG AA : contraste texte normal ≥ `4.5:1`, grand texte ≥ `3:1`, composants/focus ≥ `3:1`.
- Cible recommandée `48 × 48 px`, minimum absolu `44 × 44 px`.
- Focus clavier visible sur tous les contrôles Web ; ordre identique à l'ordre visuel.
- Rôles requis : `button`, `link`, `tab`, `switch`, `header`; exposer `selected`, `checked`, `disabled`, `busy`.
- Toute icône seule possède un nom accessible décrivant l'action, pas sa forme.
- Ne jamais transmettre un état uniquement par couleur : ajouter texte, icône ou motif.
- Supporter l'agrandissement du texte sans couper les libellés essentiels ; préférer le retour à la ligne.
- Images informatives : description accessible ; images décoratives : ignorées par le lecteur d'écran.
- Après ouverture d'une modale, placer le focus sur son titre ou sa première action ; le piéger jusqu'à fermeture.

## 8. Gouvernance

- Les tokens existants de `packages/mobile/src/theme/` restent la base technique ; toute évolution doit être centralisée, jamais répétée écran par écran.
- Aucun écran ne crée une nouvelle couleur, taille ou animation sans ajout préalable dans le design system.
- Les règles métier et couleurs critiques restent immuables : **GARDER = menthe**, **PASSER = corail**.
- Toute refonte doit conserver les fonctions existantes, vérifier mobile iOS/Android et valider contraste, taille des touches et lecteur d'écran.
