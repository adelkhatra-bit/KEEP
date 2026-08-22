# KEEP — Déploiement backend (Render)

Dernière mise à jour : 22/08/2026.

## Pourquoi Render (choisi sans arbitrage demandé, décision réversible)

- **Render** a un vrai tier gratuit (aucune carte bancaire requise pour
  démarrer) : suffisant pour valider Apple Music/Super Admin avant tout
  lancement public. Seul compromis : le service gratuit se met en veille
  après 15 min d'inactivité (redémarrage ~30-50s au réveil) — sans
  incidence pour du test, à surveiller si ça gêne en usage réel.
- **Railway** (l'alternative envisagée) facture dès le départ (~5$/mois
  minimum) — pas le "moins cher" demandé.
- Render supporte nativement les monorepos npm workspaces (build command
  personnalisable) et le déploiement par Blueprint (`render.yaml`, déjà
  écrit à la racine du repo) pour séparer proprement **staging** et
  **production** sans dupliquer la configuration à la main.

## Ce qui est déjà prêt (fait, sans intervention propriétaire)

- `render.yaml` : deux services web (`keep-backend-production`,
  `keep-backend-staging`), build/start commands corrects pour le monorepo
  (`npm install` à la racine pour résoudre les workspaces, puis build/lance
  uniquement `packages/backend`), health check sur `/health` (déjà
  implémenté dans `packages/backend/src/index.ts`).
- Variables d'env déclarées mais `sync: false` (jamais commitées, à
  renseigner toi-même dans le dashboard Render une fois les services créés).

## Ce qui reste — 2 actions, réservées à toi (compte/identité)

**ACTION REQUISE**
Service : Render (compte gratuit)
Lien exact : https://dashboard.render.com/register
Ce que je dois faire :
1. Créer un compte (email ou GitHub).
2. Connecter le dépôt GitHub `adelkhatra-bit/keep` (une fois qu'il sera
   poussable — voir statut push dans PROJECT_STATUS.md).
3. New → Blueprint → sélectionner le repo → Render détecte `render.yaml`
   automatiquement et propose de créer les 2 services.
4. Pour chaque service, dans Environment → ajouter les variables déjà
   déclarées dans `render.yaml` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `APPLE_MUSICKIT_*`) — mêmes valeurs que
   dans tes fichiers `.env` locaux, jamais collées dans le chat.
Temps estimé : 10 minutes.

**Une fois fait**, dis-moi "Render fait" et je récupère les URLs générées
(`https://keep-backend-production.onrender.com`,
`https://keep-backend-staging.onrender.com`) pour les poser dans
`EXPO_PUBLIC_API_URL` côté mobile.

## Ce qui se passera automatiquement ensuite

Chaque push sur `main` redéploiera automatiquement les deux services
(Render surveille le repo GitHub). Pas de commande à taper.
