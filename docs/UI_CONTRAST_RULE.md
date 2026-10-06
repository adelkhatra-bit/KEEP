# KEEP — règle stricte de contraste des actions

Cette règle s’applique à tous les écrans Mobile KEEP.

- Un élément cliquable actif ne doit jamais être gris sur fond gris.
- Action principale : fond violet KEEP (`#5B3F8C` / `#8B5CF6`) + texte blanc.
- Action secondaire positive : fond vert sombre (`#123D2C`) + contour vert (`#38D990`) + texte blanc/vert clair.
- Un bouton en contour doit avoir un contour coloré et un texte blanc lisible.
- Le gris est réservé aux états réellement désactivés ou aux textes non interactifs.
- Les libellés de la barre des 5 onglets restent blancs.
- Les actions importantes doivent conserver un contraste lisible sur mobile 390×844.

Toute nouvelle action doit respecter cette règle avant validation QA.


## Règle lisibilité et taille humaine — obligatoire

Références produit : Apple Human Interface Guidelines et WCAG 2.2.

- Cible tactile Loki : **44 × 44 pt minimum** sur iPhone/iPad et **44 × 44 CSS px de référence** sur Web pour toutes les actions fréquentes.
- Texte courant : viser **17 pt**.
- Texte secondaire : **13–15 pt**.
- Minimum absolu : **11 pt**, uniquement pour badges/captions non essentiels.
- Aucun texte fonctionnel, bouton, réglage, notification, aide active ou statut important sous **11 pt**.
- Dynamic Type / agrandissement système doit rester exploitable.
- Toute action doit avoir un état pressé/focus et un retour visuel immédiat.
- Fond sombre : texte fonctionnel blanc/très clair ; contraste normal >= **4.5:1**.
- Les zones tactiles peuvent être plus grandes que leur icône visible : ne jamais forcer une petite cible pour préserver le dessin.
- Les anciens styles non conformes doivent être corrigés lors de leur prochaine modification ; aucune nouvelle exception n'est autorisée.

## Règle de boucle d'interaction

Tout contrôle doit fermer son circuit :
**intention → action → feedback → résultat ou retour**.

- Aucun bouton sans action réelle.
- 1 clic/tap doit ouvrir ou exécuter la fonction visée.
- Le 2e clic/tap est réservé aux confirmations sensibles.
- Une aide lue rarement doit être repliée derrière « En savoir plus ».
- Un swipe peut accélérer une action, jamais la rendre obligatoire.
