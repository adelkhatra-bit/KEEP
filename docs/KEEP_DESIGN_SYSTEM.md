# KEEP — Design System (audit du 24/08/2026)

**Source de vérité UI du projet, validée par Adel le 24/08/2026.** Tout
agent (Claude Code ou autre) travaillant sur `packages/mobile`/`packages/admin`
doit lire ce fichier avant toute modification visuelle — au même titre que
les autres fichiers `docs/KEEP_*.md` listés dans `CLAUDE.md`.

Demande explicite d'Adel : "Fais un audit écran par écran et définis un
Design System KEEP unique... Ensuite seulement applique-le progressivement."

Ce document est le résultat de l'AUDIT réel (grep sur tout `packages/mobile/src/screens`
et `components`, pas une supposition) + les règles UNIFIÉES à appliquer
PROGRESSIVEMENT (jamais un gros bloc d'un coup — voir méthode en bas).

## Règles obligatoires (validées le 24/08/2026, ne pas contourner)

1. **Aucune valeur UI arbitraire.** Tout nouveau composant doit utiliser les
   tokens existants (`colors.*`, `spacing.*`, `radius.*`, `typography.*`,
   `minTouchTarget`). Une valeur en dur (couleur hex, pixel magique) n'est
   acceptable QUE si elle est mathématiquement dérivée d'un token ou d'une
   contrainte réelle (ex. `radius: width/2` pour un cercle parfait) --
   justifiée en commentaire, jamais silencieuse.
2. **Jamais de doublon de composant.** Avant toute modification visuelle,
   vérifier que le composant/pattern n'existe pas déjà ailleurs sous une
   autre forme (grep sur le nom probable + les patterns visuels proches --
   ex. avant de créer un nouveau "badge", vérifier `VerifiedBadge.tsx`,
   `smartBadgeBg`, `demoBadgeBg`). Réutiliser/étendre, ne jamais recréer.

## Ce qui existe déjà et fonctionne bien (ne pas casser)

`packages/mobile/src/theme/colors.ts` + `theme/spacing.ts` sont une vraie
base de tokens, déjà largement respectée :
- **0 couleur hexadécimale en dur** trouvée dans les écrans (100% via `colors.*`).
- **Seulement 2 `borderRadius` en dur** sur tout le code, et les deux sont
  des exceptions légitimes (avatars ronds, `width/2` — pourrait migrer vers
  `radius.pill` pour une cohérence totale, voir plus bas).
- **1 seul `padding` en dur** sur tout le code.

Conclusion : le système de tokens lui-même n'est PAS le problème. Les
incohérences viennent de l'USAGE (des valeurs différentes choisies pour la
même chose sur des écrans différents), pas de couleurs/espacements inventés.

## Incohérences réelles trouvées (preuves, pas des impressions)

| Élément | Valeurs trouvées | Où | Décision |
|---|---|---|---|
| Hauteur de bouton | `48` (5 endroits), `46` (1), `40` (1) | `minTouchTarget=48` déjà défini dans spacing.ts ; `OnboardingScreen.tsx:342` utilise 46 ; `ProfileScreen.tsx:911` utilise 40 (boutons compacts, changement volontaire du 24/08/2026 suite à la demande "boutons trop gros") | **Deux tailles officielles, pas une erreur à corriger partout** : `48` = bouton principal (CTA plein, un seul par écran) ; `40` = bouton secondaire/compact (actions multiples groupées, ex. Profil). `46` (Onboarding) doit migrer vers `48` — aucune raison qu'il soit différent, c'est un CTA principal. |
| Jaquette/artwork en liste | `52×52` (`TrackRow.tsx`, l'écran principal Session) vs `44×44` (`MyMusicScreen`/`ProfileScreen`, listes "en attente de sync") | | **Incohérence réelle, à corriger** : une seule taille pour "jaquette en ligne de liste" = `48×48` (aligné sur `minTouchTarget`, cohérent avec le reste). `TrackRow` descend de 52 à 48, les écrans "waiting" montent de 44 à 48. |
| Avatar rond | `radius: width/2` (calculé) | `ProfileScreen.tsx:804` (110px), `DiscoverScreen.tsx:299` (44px) | Pattern légitime (rayon = moitié de la largeur pour un cercle parfait, plus lisible qu'un `radius.pill` qui suppose implicitement "assez grand") — **garder tel quel**, ne pas forcer `radius.pill` ici. |
| Cartes (`backgroundCard`) | 20 usages, cohérents | Toutes les écrans | **Déjà cohérent, rien à changer.** |

## Échelle unifiée KEEP (référence pour tout nouveau composant)

**Boutons**
- CTA principal (1 par écran, action centrale) : `minHeight: 48`, `borderRadius: radius.md` ou `radius.pill` selon forme, `typography.button`.
- Bouton secondaire/compact (actions multiples groupées) : `minHeight: 40`, pill (`radius.pill`), fond `colors.smartBadgeBg` (déjà la convention "cliquable" établie sur Profil/Discover le 24/08/2026 — jamais la même couleur qu'une carte d'info passive).
- Jamais de 3e taille sans raison documentée ici.

**Jaquettes (artwork)**
- Ligne de liste (Session/Mes musiques/tout écran avec une liste de morceaux) : `48×48`, `radius.sm`.
- Grille/vitrine profil (futur, voir section Profil) : à définir avec la refonte visuelle, pas encore construit.

**Cartes**
- Fond `colors.backgroundCard`, bordure `colors.border` 1px, `radius.md` (12px) par défaut.

**Typographie**
- `typography.h1/h2/h3` pour les titres d'écran/section, `body`/`bodyBold` pour le contenu, `caption` pour le texte secondaire/métadonnées. Déjà cohérent, continuer à l'utiliser tel quel.

**Modales**
- 4 écrans utilisent `<Modal>` (`Discover`, `Home`, `MyMusic`, `Profile`) — pas encore audité en détail composant par composant (prochaine passe). Règle immédiate : fond `colors.backgroundElevated`, jamais `colors.background` (doit se distinguer visuellement de l'arrière-plan).

**Navigation**
- Tab bar : icônes + labels déjà cohérents sur les 4 onglets (Session KEEP/Découvrir/Mes musiques/Profil) — pas de changement identifié nécessaire ici.

## Méthode d'application (jamais un gros bloc d'un coup)

Par écran, dans cet ordre (celui où le trafic/usage est le plus élevé
d'abord) :
1. `HomeScreen`/`TrackRow` (52→48 sur l'artwork) — écran le plus vu.
2. `MyMusicScreen`/`ProfileScreen` (44→48 sur l'artwork "waiting").
3. `OnboardingScreen` (46→48 sur le bouton CTA email).

Chaque changement : appliqué seul, `tsc --noEmit`, vérifié dans le
navigateur, PUIS le suivant — jamais plusieurs écrans en un seul commit
(cf. règle anti-régression de `CLAUDE.md`).

## Ce qui reste explicitement hors de cet audit (P2, après stabilisation)

- Refonte visuelle complète du profil (grille "albums" façon Instagram,
  demandée mais pas commencée — voir `KEEP_DECISIONS.md`).
- Détail des 4 modales composant par composant.
- Jaquettes en grille (format/densité) — dépend de la refonte profil ci-dessus.
