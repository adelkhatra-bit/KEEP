# Audit UX Loki Music — funnel complet et cohérence Design System

Date : 24/09/2026

## Résumé

Le socle visuel actuel est cohérent : fond sombre, violet primaire, menthe GARDER/succès, corail PASSER/danger, cartes arrondies. Le principal risque UX n’est plus la palette mais la densité et la duplication d’information.

## Écouter
**État : bon.**
- CTA clair.
- Micro et waveform visibles.
- PASSER / GARDER / ARRÊTER explicites.
- Swipe facultatif.
- À conserver comme référence de simplicité.

## Découvertes
**État : fonctionnel mais trop de réglages avant la personne.**
- La carte profil est forte.
- Distance, recherche et explications occupent trop de hauteur.
- Cible : profil d’abord, filtres compacts en second.

## Playlists
**État : riche mais trop technique pour un utilisateur novice.**
- Musiques / Vibes / Artistes + analyses + visibilité + vente = beaucoup de concepts.
- Le moteur Smart Albums existe déjà.
- Cible : Styles / Playlists / Artistes, avec Styles en premier.
- Les sections Mes découvertes / Mes reprises restent visibles.

## Soirées
**État : bon après refonte.**
- Hero événement vendeur.
- RSVP clair.
- Lobby/Classement/Playlist compréhensible.
- Proposition uniquement visuelle : renommer l’étiquette Playlist en “Ambiance” sans changer la source de données.

## Profil propriétaire
**État : trop long.**
- Beaucoup d’éléments utiles mais ils se concurrencent verticalement.
- La grille par genre existe déjà mais reste derrière un choix Tout/Par genre.
- Cible : styles directement visibles.
- Ajouter dans le hero un accès direct `INVITER/PARTAGER` + `VENDRE/GÉRER MES VENTES`.
- Garder la liste brute comme vue secondaire.

## Profil visité
**État : commerce partiellement bien exposé, mais architecture encore double.**
- Offre “En vente” déjà remontée.
- Longue liste encore principale.
- Dossiers verrouillés déjà présents plus bas.
- `publicVibes` est chargé mais n’est pas rendu.
- Risque réel : les dossiers verrouillés utilisent actuellement `saleOffers[0]` ; plusieurs offres peuvent donc être représentées par le mauvais prix/offre.
- Cible : une seule grille Styles mêlant gratuit et payant, chaque dossier payant lié à sa vraie offre.

## Vente
**État : fondation fonctionnelle.**
- Preview masquée correcte : RPC renvoie seulement trackId + previewUrl.
- Pas de titre/artiste/jaquette dans l’aperçu.
- Gestion vendeur disponible mais trop loin du profil.
- Cible : vente accessible directement depuis le profil.

## Inscription
**État : faible friction, bonne base.**
- Essai automatique déjà en place.
- Compte proposé ensuite.
- Choix de genres après création.
- Cible : rendre explicite le bénéfice du choix de styles : “Loki range automatiquement tes découvertes”.

## Super Admin
**État : doit piloter les règles de monétisation/visibilité.**
Contrôles à vérifier :
- marketplace_enabled ;
- seuil vente ;
- prix autorisés ;
- Smart Albums autoCreate / rename ;
- protection preview ;
- plans autorisés ;
- textes remote_config ;
- flags iOS/App Store.

## Règle de cohérence
Un utilisateur doit retrouver le même langage visuel partout :
- grosse action violette = prochaine action principale ;
- menthe = garder/succès/débloqué ;
- corail = passer/refuser/danger ;
- cadenas = payant ou privé ;
- carte style = porte d’entrée vers un ensemble musical.

## Risques à corriger avant finalisation
1. Plusieurs offres sur un profil : ne jamais utiliser la première offre comme proxy global.
2. Ne pas afficher deux fois la même Vibe/Smart Album en gratuit et en payant.
3. Ne pas laisser une longue liste redevenir la vue principale sur gros comptes.
4. Ne pas créer un nouveau moteur genre : réutiliser Smart Albums/Vibes + enrichissement existants.
5. Ne pas casser l’attribution sociale “Découvert par”.
6. Ne pas activer les achats externes sur iOS sans conformité IAP.
