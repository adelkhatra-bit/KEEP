# KEEP — Design System v3

Statut : **validée**. Ce document décrit l'identité réellement livrée dans `packages/mobile/src/theme/` et les composants partagés existants (pas une proposition) — toute valeur ci-dessous doit correspondre au code, jamais l'inverse.

Sauf mention contraire, tout écran existant reste inchangé : ce document sert de référence pour les prochains écrans/composants, pas de mandat de refonte. La refonte visuelle de `ProfilePublicScreen.tsx` reste un chantier séparé, non couvert ici (N4, 22/09/2026 : "ne refactore pas encore ProfilePublicScreen.tsx").

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
| `neutral.canvas` | `#0B0A12` | Fond principal | Fond de tous les écrans (`colors.background`) |
| `neutral.surface` | `#151320` | Surface élevée | Sections, modales, menus (`colors.backgroundElevated`) |
| `neutral.card` | `#1C1930` | Carte | Cartes et lignes interactives (`colors.backgroundCard`) |
| `neutral.border` | `#2A2640` | Bordure | Séparateurs et contours calmes (`colors.border`) |
| `neutral.text` | `#FFFFFF` | Texte fonctionnel | **Règle absolue du code** (`src/theme/colors.ts`) : `textPrimary`, `textSecondary` et `textMuted` valent tous `#FFFFFF` — aucun texte fonctionnel gris sur fond sombre. La hiérarchie visuelle passe par la taille/le poids de police ou l'opacité, jamais par une nuance de gris. |
| `neutral.black` | `#000000` | Noir | Texte sur menthe claire si nécessaire |

Note historique : une première version de ce document proposait des gris différenciés (`#E5E0EC`, `#B8B2C4`, `#7D7789`) pour `textSecondary`/`textMuted`/`disabled`. Cette proposition n'a jamais été implémentée — le code applique la règle "blanc partout" depuis le début. La v3 documente l'état réel, pas la proposition initiale.

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
| `body` | 17 | 24 | 400 | Texte courant |
| `bodyMedium` | 17 | 24 | 500 | Métadonnée importante |
| `bodyBold` | 17 | 24 | 700 | Action ou valeur forte |
| `caption` | 14 | 20 | 500 | Compteur, date, aide |
| `small` | 11 | 16 | 500 | Badge/caption non essentiel uniquement |
| `button` | 15 | 20 | 700 | Boutons, casse normale recommandée |

Règles : un seul `h1` par écran ; `h2` pour l'identité ; `h3` pour les sections ; texte courant cible **17 pt** ; secondaire **13–15 pt** ; minimum absolu **11 pt** uniquement pour badges/captions non essentiels ; aucun texte fonctionnel sous 11 pt ; majuscules réservées aux libellés courts. Supporter Dynamic Type et l'agrandissement sans chevauchement.

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
- **Offre** : pochette `64 px`, nom, nombre de titres, prix très lisible, CTA d'achat explicite.
- **Section** : fond `#151320`; **élément interactif** : fond `#1C1930`; bordure `1 px #2A2640`.

### Morceau — `TrackActionRow` (composant partagé, source unique de vérité)

Validé par maquette HTML interactive (21/09/2026) puis livré dans
`packages/mobile/src/components/TrackActionRow.tsx`, utilisé par
`MyMusicScreen.tsx`, `ProfilePublicScreen.tsx` et `PublicUserProfileScreen.tsx`.
Toute nouvelle liste de morceaux doit réutiliser ce composant plutôt que
recréer une grille inline.

- **Grille à colonnes fixes**, jamais de positions absolues (plus robuste sur petits écrans, arbitrage validé) :
  pochette `56×56` (rayon `10`) → zone titre/artiste flexible (troncature 1 ligne) → 0 à N carrés d'action `40×40`
  (rayon `10`, fond uniforme `#1A1A2E`, icône seule sans texte, `flexShrink:0`) → chevron `24×24` séparé en bout de ligne.
- **Hauteur de rangée constante**, jamais dérivée de l'état/props : `56 px` (MyMusicScreen), `64 px` (écrans de profil).
- **Un seul carré par concept d'état** : jamais deux boutons pour deux états d'un même morceau (ex. Garder = un seul
  carré changeant d'icône `+`/`✓`/`🔒`/`💰` et de `tone` selon l'état, jamais deux carrés distincts).
- **Tones d'action** (`TrackActionRowAction.tone`) : `success` → `colors.success` (Play en lecture, Garder actif) ;
  `pink` → `#FF5F83` (Like actif uniquement) ; `gold` → `#E8C766` (statut en attente/premium). Un tone ne change
  jamais le fond du carré (toujours `#1A1A2E`), seulement l'icône/bordure.
- **Badge de statut** (`badge?: { label, onPress? }`) : rendu sur la ligne du titre, jamais une 3ᵉ ligne — utilisé
  pour un statut toujours visible sans déplier (ex. `🏷️ 2,00€` pour un morceau en vente).
- **Panneau dépliable** (`expandable`/`expanded`/`children`) : réservé aux actions de gestion secondaires
  (Public/Privé, Supprimer, Vendre, "Donné par…") — jamais une action rapide qui devrait être un carré visible.
- Preview audio : `TrackPreviewButton` variante `square` (prop `square?: boolean`) — réutilise exactement la même
  logique play/stop que les autres variantes, jamais dupliquée.

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

### Boucle d'interaction Loki

- Une action doit former un circuit complet : **intention → action → feedback → résultat/retour**.
- Aucun bouton décoratif ou sans effet réel.
- **1 tap/clic = fonction** ; le deuxième tap/clic n'est autorisé que pour confirmer une action sensible.
- Les aides longues et textes lus une seule fois restent repliés derrière « En savoir plus ».
- Un geste (swipe, drag) accélère une fonction mais ne remplace jamais son bouton essentiel.
- Mobile et Web partagent le même comportement métier dès que la fonction est commune.

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


## 9. Référentiel multi-écrans et accessibilité — décision du 09/10/2026

**Statut : règles documentées à la demande d'Adel ; conformité du produit NON validée.**
Cette section précise les exigences à contrôler et prévaut sur les formulations ambiguës des sections précédentes. Elle ne décrit pas des corrections déjà livrées et n'autorise pas une refonte. Aucun fichier d'application, token ou contrôle CI n'est modifié par cet ajout documentaire. L'application progressive et les gardes automatiques restent à intégrer avec preuves dans le chantier existant, sans dupliquer la logique mobile/Web.

### 9.1 Unités et exigences distinctes

- Web : dimensions en **pixels CSS**, et non pixels physiques de l'écran ; texte relatif au réglage utilisateur.
- iOS : dimensions en **points logiques** et Dynamic Type ; Android : cibles en **dp**, texte adapté à l'échelle utilisateur (sp dans les APIs natives).
- Une valeur React Native doit être vérifiée sur son rendu de plateforme. Ne pas convertir une capture Retina en taille de police ni assimiler point iOS et point typographique CSS.
- WCAG 2.2 AA est la cible d'accessibilité Web du projet. Respecter quelques seuils ne suffit pas à déclarer tout le produit conforme.

### 9.2 Boutons, icônes et zones activables

- WCAG 2.2, critère 2.5.8 AA : cible au moins **24 × 24 pixels CSS**, avec exceptions normatives (espacement, lien intégré au texte, contrôle équivalent, contrôle navigateur, présentation essentielle). Ce minimum n'est PAS la cible de confort Loki.
- Loki conserve une cible Web/iOS au moins **44 × 44** dans l'unité logique de plateforme ; viser **48 × 48** pour les contrôles partagés. Sur Android, cible tactile au moins **48 × 48 dp**.
- Distinguer le dessin visible de la zone réellement activable : une icône 20–24 ou un bouton visuel compact 36 peut avoir une zone plus grande. Les zones agrandies ne doivent pas se chevaucher ni être coupées par le parent.
- Les carrés 40 × 40 et chevrons 24 × 24 historiques de TrackActionRow ne prouvent pas la taille de cible : mesurer leur zone activable avant validation.
- Espacement de confort entre contrôles : viser 8 unités logiques lorsque possible (choix produit, pas minimum universel WCAG). Les actions essentielles restent disponibles sans swipe ni survol.
- Clavier Web : Tab/Shift+Tab, activation appropriée Entrée/Espace, focus visible et non entièrement masqué par une barre fixe ou une modale. Nom accessible pour chaque icône seule.
- Ne pas étirer automatiquement un bouton à toute la largeur d'un grand écran. Adapter sa largeur au libellé et à son groupe, tout en conservant une cible confortable.

### 9.3 Écritures et agrandissement

- WCAG ne fixe pas une taille de police universelle de 16 pixels. Les tailles suivantes sont des choix de lisibilité Loki : corps **17** (base existante), secondaire **13–15**, boutons **15** ; **11** réservé aux badges/captions non essentiels. Aucun texte fonctionnel sous 11 ; prix, coûts FREE, actions et messages essentiels ne sont pas des captions décoratives.
- Sur le Web, vérifier l'agrandissement du texte à **200 %** sans perte de contenu ni de fonction (WCAG 1.4.4). Ne pas désactiver le zoom.
- Sur iOS/Android, tester les grandes tailles de texte du système : retour à la ligne, hauteur adaptable, aucun libellé essentiel coupé ou recouvert ; une limite de mise à l'échelle ne doit pas neutraliser l'accessibilité.
- WCAG 1.4.12 : le contenu doit rester utilisable quand l'utilisateur impose simultanément interligne 1,5 fois la taille de police, espace après paragraphe 2 fois, lettres 0,12 fois et mots 0,16 fois. Il s'agit d'un test de résistance, pas de l'obligation de rendre ces valeurs par défaut.
- Sur grand écran, plafonner la largeur des paragraphes (cible de confort 45–75 caractères environ, choix produit), pas grossir tous les textes proportionnellement à la fenêtre.

### 9.4 Couleur et contraste mesuré

- Texte courant, y compris aides et placeholders utiles : contraste **au moins 4,5:1** avec le fond effectivement rendu.
- Grand texte Web : **au moins 3:1** à partir de 24 pixels CSS normal, ou 18,67 pixels CSS gras (18/14 points typographiques CSS). Ne pas transposer ces points CSS aux points iOS.
- Éléments visuels nécessaires à l'identification des contrôles/états et graphiques utiles : **3:1** avec les couleurs adjacentes pertinentes (WCAG 1.4.11). Cela ne signifie pas que chaque bordure décorative doit atteindre 3:1.
- État/erreur/sélection : ajouter texte, icône ou autre indice, jamais couleur seule. Conserver GARDER menthe et PASSER corail ; choisir le texte/fond compatible sans changer leur sens.
- Le blanc sur fond sombre reste la règle produit pour le texte fonctionnel ; sur un bouton clair, un texte sombre peut être requis. La règle « blanc partout » ne doit jamais imposer un contraste insuffisant.
- Vérifier le résultat avec opacité du texte ET des parents, transparence, dégradé, pochette, hover, pressed et focus. Baisser l'opacité ne dispense jamais de mesurer le contraste. Ne pas arrondir un ratio inférieur au seuil pour le faire passer.
- Exceptions WCAG (contrôle réellement inactif, décoration, certains logos) à distinguer des textes secondaires utiles ; ne pas qualifier une fonction difficile à lire de décoration.

Calcul statique du 09/10 sur aplats opaques de la palette documentée, formule WCAG sRGB ; ce tableau n'est pas une mesure de l'application publiée :

| Texte | Fond | Ratio approximatif | Texte courant AA |
|---|---|---:|---|
| Blanc #FFFFFF | Violet #7C5CFC | 4,381:1 | Échec |
| Noir #000000 | Menthe #2DE1C2 | 12,661:1 | Réussite |
| Blanc #FFFFFF | Menthe #2DE1C2 | 1,659:1 | Échec |
| Blanc #FFFFFF | Corail #FF5C72 | 2,989:1 | Échec |
| Blanc #FFFFFF | Fond #0B0A12 | 19,693:1 | Réussite |

La prescription historique « primaire violet #7C5CFC + texte blanc 15 » doit être traitée comme un écart à corriger/tester, pas une combinaison AA validée. Aucun changement de palette n'a été appliqué par cet audit.

### 9.5 Fenêtres, téléphones et ordinateurs

- Le seuil de mise en page dépend du contenu disponible, pas du seul modèle d'appareil. Un ordinateur peut avoir une fenêtre étroite ; une tablette peut être grande et tactile. Ne pas choisir une capacité audio ou une identité utilisateur uniquement selon la largeur.
- Reflow Web (WCAG 1.4.10) : contenu ordinaire utilisable à **320 pixels CSS** sans défilement dans deux directions ; vérifier notamment 1280 pixels à zoom 400 %. Exceptions seulement pour les contenus intrinsèquement bidimensionnels.
- Matrice projet, dimensions logiques largeur × hauteur : téléphones **320×568, 375×667, 390×844, 430×932** ; tablette **768×1024, 1024×768** ; ordinateur **1280×720, 1366×768, 1440×900, 1920×1080**.
- Ajouter portrait/paysage, redimensionnement sans rechargement, écran partagé, zoom/texte agrandi, clavier ouvert, safe areas et navigateur avec barres visibles.
- Vérifier chaque écran principal et ses états vide/chargement/erreur, menus, modales, lecteur, story et tchat. Aucun bouton recouvert ; défilement accessible ; textes longs et prix complets.
- Réutiliser les contrôles existants (dual-viewport, surface visible, runtime) ; ne pas créer un deuxième produit Desktop. Le minimum historique 390/1440 reste requis mais ne suffit pas à cette matrice étendue.

### 9.6 QR et preuve de version

- Le QR autorise une session ordinateur ; il ne copie pas le bundle installé sur le téléphone et ne garantit pas une égalité des versions déployées.
- Source commune : packages/mobile, branche reconcile/claude-main-20260825. Distinguer code local non poussé, commit distant, Web publié, build natif et mise à jour OTA.
- Chaque preuve contient : date, plateforme/navigateur, dimensions/zoom/taille système, route, SHA Web servi ou version/build/runtime/OTA mobile, résultat et capture. Pour le parcours QR, vérifier aussi identité du compte et cible Web canonique sans consigner token, QR de connexion ou lien d'authentification.
- Un test Chromium à390 pixels ne constitue pas une preuve native iOS/Android du micro, audio, secousse, GPS ou push.
- Lecture statique, test automatisé, contrôle visuel et essai matériel restent des preuves distinctes. Aucun statut « conforme », « testé » ou « déployé » sans preuve correspondante.

### Sources officielles consultées le 09/10/2026

- [W3C — WCAG 2.2, cible minimum AA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C — contraste du texte](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C — contraste non textuel](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [W3C — agrandissement du texte](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- [W3C — reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [W3C — espacement du texte](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- [Apple — accessibilité](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple — conseils de conception UI](https://developer.apple.com/design/tips/)
- [Android — accessibilité](https://developer.android.com/guide/topics/ui/accessibility/apps)
