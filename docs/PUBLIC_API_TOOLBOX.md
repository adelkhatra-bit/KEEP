# KEEP — Public API Toolbox

Date : 30/09/2026  
Branche : `reconcile/claude-main-20260825`

## But

Donner à ChatGPT, Claude Code et aux développeurs un point d'entrée unique pour chercher des APIs publiques utiles sans ajouter des millions de dépendances au runtime.

Le dépôt GitHub `public-apis/public-apis` est un **catalogue**, pas une API magique à installer dans l'application. KEEP l'utilise donc comme index de découverte côté développement.

## Utilisation

```bash
npm run public-api:search -- music
npm run public-api:search -- geocoding
npm run public-api:search -- events
```

Le script `scripts/public-api-search.mjs` lit le README du catalogue depuis GitHub et filtre les entrées. Aucun package supplémentaire n'est installé.

## Règles avant intégration d'une API

Une API trouvée dans le catalogue n'entre jamais automatiquement en production. Avant de l'utiliser :

1. vérifier HTTPS, disponibilité et limites de débit ;
2. vérifier CGU/licence et droit d'usage commercial ;
3. vérifier les données envoyées au fournisseur et l'impact confidentialité/RGPD ;
4. mettre toute clé/secrète côté serveur ou Supabase Edge Function, jamais dans le mobile ;
5. ajouter timeout, gestion d'erreur et cache lorsque pertinent ;
6. prévoir un fallback pour une fonction critique ;
7. ajouter la source dans `config/public-api-registry.json`.

## APIs publiques déjà utilisées par KEEP

- iTunes Search : enrichissement musique, pochette et preview en fallback serveur ;
- Deezer Search : métadonnées et preview en fallback serveur ;
- BigDataCloud : reverse geocoding web ;
- Nominatim / OpenStreetMap : fallback géocodage et résolution d'adresse.

Le catalogue sert à découvrir d'autres briques ; il ne remplace pas les services existants et ne doit pas créer de doublon.
