# Loki Music — contrat durable de l'expérience ordinateur
Date : 10/10/2026. Branche unique : `reconcile/claude-main-20260825`.
Statut : architecture et première étape de déploiement progressif, à valider par tests réels.

## Principe
Un seul backend Supabase, un seul compte et les mêmes achats, découvertes, playlists, profils, stories, tarifs, notifications et sessions QR. Deux présentations réellement différentes selon la largeur disponible : iPhone mobile (390 × 844) et poste de travail (1366 × 768, 1536 × 864, 1920 × 1080, 2560 × 1440). Ne jamais dupliquer la base de données ni l'application. Pas de retouche aux cinq onglets, à Navigation.tsx ni à App.tsx pour le responsive mobile.

## Source
StatCounter, relevé septembre 2026, desktop : 1920 × 1080 (28,07 %), 1536 × 864 (10 %), 1366 × 768 (7,95 %). https://gs.statcounter.com/screen-resolution-stats/desktop

## Règles verrouillées
- Déterminer la largeur CSS effective du viewport ; ne pas supposer qu'un PC est forcément en 16:9 (fenêtre redimensionnée, zoom système, ultra-wide).
- Mobile < 768 : une colonne, gestes et actions accessibles au pouce ; aucun redesign de la barre cinq onglets.
- Tablette/fenêtre 768–1099 : deux zones au maximum et repli autonome.
- Desktop 1100–1699 : navigation latérale fixe / barre d'actions, contenu principal fluide, zone contextuelle facultative ; pas de grossissement global à 120 %.
- Wide >= 1700 : trois régions pour musique, découvertes ou profil/boutique, largeur utile max 1600–1760, gouttières 24–32 ; pas de zoom à 140 %.
- Chaque zone dispose de son scroll indépendant quand nécessaire ; ne jamais cacher le bouton d'arrêt micro, les offres ou un paiement sous la ligne de flottaison sans accès.
- Les panneaux desktop exploitent la largeur mais conservent des lignes de texte lisibles, pas de texte étiré sur 1900 px.
- Profil propriétaire et profil visiteur : en tête avec avatar/stories + identité, activités et progression, contenu musical, boutique visible avec prix/aperçus. Même SellerBoutique, deux organisations visuelles.
- Boutique desktop : 3 à 4 cartes par rangée selon le viewport (grille), filtres toujours visibles ; mobile : cartes empilées/carrousel existant, achat selon règles Apple.
- QR : panneau central et valeur ajoutée desktop, statut explicite « non jumelé / en attente / approuvé / connecté », boutons de partage des cinq sections après connexion, aucun compte créé par PC.
- Synchronisation : le QR est une authentification ; l'historique découvert/non gardé doit être enregistré séparément dans Supabase. Ne pas confondre état local du micro et données de compte.
- Challenge « Défi Loki · Ma progression » (ancien « Mon oreille ») : panneau visible hors menu, jalons découverte, écoute, garde, partages, stories gratuites et collections à vendre selon permissions. Ne pas promettre de FREE si aucun crédit serveur prévu. Inciter à raconter ses trouvailles en story pour nourrir la communauté.
- Mobile et desktop doivent conserver les mêmes permissions, confidentialité, masquage des morceaux avant achat et historique des paiements.
- Super Admin : nouvelle section « Apparence ordinateur » : seuils, colonnes boutique, visibilité du panneau progression, textes pédagogiques story, activation progressive par remote_config. Toutes les configurations doivent avoir valeurs par défaut stables et être publiées après validation.
- Aucun déploiement marqué réussi sans CI, tests de chemin QR réel, navigation, achat, reconnexion, 390 × 844, 1366 × 768, 1536 × 864, 1920 × 1080 et contrôle post-refresh.

## Étapes, dans l'ordre
1. Poser ce contrat et renommer l'entrée cachée du challenge dans le menu. Aucun changement destructif.
2. Construire un shell desktop autonome dans un composant de présentation, avec breakpoints CSS, en réutilisant les cinq routes et stores existants.
3. Créer une page QR orientée ordinateur et la zone de raccourcis, vérifier que la session QR actuelle ne se déconnecte pas.
4. Adapter SellerBoutique pour 3/4 colonnes sur desktop, conserver mobile inchangé et tester le profil visiteur.
5. Rendre « Défi Loki » visible sur le profil, ajouter objectifs de stories/partage et cartes pédagogiques depuis remote_config.
6. Exposer les réglages dans Super Admin, sécuriser leur portée et ajouter des tests de régression.
7. Valider la synchronisation des découvertes entre téléphone et ordinateur, les CI et les parcours E2E. Ne pas fusionner ni publier une étape échouée.
