# KEEP / Loki Music — Cahier des charges maître

Version : **2026-09-30.1**  
Statut : **SOURCE DE VÉRITÉ PRODUIT**  
Repository : `adelkhatra-bit/KEEP`  
Branche produit unique : `reconcile/claude-main-20260825`

Ce document est la référence fonctionnelle et visuelle à lire avant toute modification. Une nouvelle demande validée par Adel peut modifier ce cahier des charges ; dans ce cas, le code, ce fichier et les guards automatiques doivent rester cohérents.

## 1. Dépôt et environnement

- Ne jamais travailler sur `main`.
- Ne jamais créer une seconde version de l'application pour contourner un bug.
- Mobile, web public et TestFlight restent issus de la branche canonique.
- Supabase KEEP uniquement : `rrhqsqzcplvmwxizqnla.supabase.co`.
- Ne jamais mélanger KEEP/Loki avec Inside Dombe.
- Ne pas modifier `packages/mobile/App.tsx`, `packages/mobile/src/navigation/Navigation.tsx`, la barre des 5 onglets, `.env`, `.p8` ou `eas.json` pour un correctif local sauf demande explicite.

## 2. Crédits — règle immuable

- listen = 0
- recognize = 0
- PASS = 0
- KEEP = -1

Une refonte UI n'a jamais le droit de modifier ces valeurs.

## 3. Navigation principale

Ordre des 5 onglets :
1. Loki Music
2. Découvertes
3. Playlists
4. Soirées
5. Profil

Ils restent visibles et utilisables sur téléphone et navigateur. Aucun flux critique ne doit exiger un swipe caché.

## 4. Responsive

Tailles de contrôle minimales : 390×844, 430×932, 768×700, 900×700, 1440×900.

- Réduire puis agrandir la fenêtre ne doit jamais produire un écran noir.
- Ouvrir/fermer les DevTools ne doit pas changer la disponibilité des écrans.
- `html`, `body` et `#root` gardent une hauteur viewport valide.
- Les 5 onglets restent visibles.
- Aucun débordement horizontal critique.

## 5. Écouter

Source : `HomeScreenCompact.tsx`.

- démarrer le micro ;
- animation visible pendant l'écoute ;
- Arrêter/Terminer coupe immédiatement `Audio.Recording` ;
- ressource micro libérée ;
- retour état inactif ;
- PASSER, GARDER, ARRÊTER et morceau courant accessibles sans swipe obligatoire.

## 6. Découvertes

Source : `DiscoverScreen.tsx`.

- carte compacte ;
- GPS affine mais ne bloque pas la découverte ;
- profil visité = `PublicUserProfileScreen.tsx` ;
- visite d'un utilisateur connecté peut notifier le propriétaire via la logique serveur existante.

## 7. Playlists / Ma musique

Source : `MyMusicScreen.tsx`.

- une seule bibliothèque ;
- un seul moteur de classement ;
- une seule logique Collections ;
- aucun second workspace caché de vente/collection.

## 8. Soirées / Battle

Source : `PartiesScreen.tsx`.

- Battle ouvre directement le vrai Battle ;
- classement Battle séparé/repliable ;
- événements, RSVP, participants, playlist et lobby restent dans la même architecture.

## 9. Profil propriétaire — disposition verrouillée

Source : `ProfilePublicScreen.tsx`.

Zone identité :
1. avatar ;
2. pseudo + certification ;
3. type Utilisateur / Créateur / DJ / Artiste / Producteur / Établissement ;
4. **FREE immédiatement à droite du badge de type, sur la même ligne** ;
5. Battle dans la même zone identité, à droite ;
6. ville / pays dessous.

Barre suivante : **PLUS | Abonnés | Reprises**.

Interdictions :
- pas de FREE dans la barre PLUS/Abonnés/Reprises ;
- pas de second FREE ;
- ne pas déplacer type/FREE pour corriger un autre module.

## 10. Hamburger profil

Le hamburger donne accès aux fonctions profil, communauté, musique et aide.

Il ne contient pas de second chemin Compte / connexion / déconnexion. La session est gérée dans `ProfileSettingsMobileScreen.tsx`.

## 11. Profil persistant

Sources : `ProfileSettingsMobileScreen.tsx`, `profileService.ts`, Storage.

Doivent survivre au reload :
- pseudo ;
- bio ;
- avatar ;
- ville ;
- pays ;
- date de naissance ;
- genre ;
- réseaux sociaux ;
- site web.

## 12. Localisation

- bouton « Utiliser ma position » ;
- GPS ;
- préremplissage ville + pays ;
- modification manuelle ensuite ;
- aucune coordonnée GPS précise affichée publiquement.

## 13. Réseaux sociaux

Instagram, TikTok, Snapchat, YouTube, X, Facebook.

- lien présent → ouverture directe ;
- lien absent → message « Cette personne ne partage pas ce réseau » ;
- persistance serveur pour un compte réel.

## 14. Retours / réglages

- Retour revient au contexte attendu ;
- Playlists revient réellement à l'onglet Playlists ;
- aucune déconnexion nécessaire pour sortir d'un écran ;
- pas de doublon de réglage.

## 15. Onboarding

Le mini-tour reste attaché au vrai écran Loki Music et ne doit jamais créer une page noire séparée.

## 16. Profil visité

Source : `PublicUserProfileScreen.tsx`.

- même langage visuel que le profil propriétaire ;
- jamais de contenu privé/payant exposé ;
- données Battle/suivi/reprises réelles ;
- premier découvreur conservé.

## 17. Données

Durable = Supabase, pas un state React isolé. Réutiliser les tables/services existants avant de créer quoi que ce soit.

## 18. Super Admin

Source : `packages/admin`.

- pas de second admin ;
- Remote Config UTF-8 ;
- secrets serveur ;
- feature flags/intégrations dans les briques existantes.

## 19. Tests avant validation

- branche canonique ;
- contrat UI ;
- TypeScript mobile ;
- moteur musique ;
- tests ciblés ;
- rendu 390×844 ;
- rendu desktop ;
- export iOS/build natif lorsque nécessaire.

Ne jamais annoncer PASS sans preuve.

## 20. Protocole anti-régression pour toutes les IA

Avant toute modification :
1. lire ce fichier ;
2. lire `docs/KEEP_CAHIER_DES_CHARGES_UI.md` ;
3. lire `docs/CODE_GPS.md` ;
4. lire `docs/ERROR_LEDGER.md` ;
5. lire `docs/INTEGRATION_CHECKLIST.md` ;
6. vérifier le HEAD ;
7. chercher l'implémentation existante.

Après une nouvelle règle validée :
- incrémenter la version ;
- modifier la règle ici ;
- mettre à jour `config/keep-ui-baseline.json` si automatisable ;
- mettre à jour le guard/test correspondant ;
- ne jamais conserver deux règles contradictoires actives.

Le dernier cahier des charges validé remplace les anciennes consignes contradictoires.
