# KEEP — Contexte technique

## Stack et versions clés

| Domaine | Technologie | Version déclarée |
|---|---|---|
| Application utilisateur | Expo | `^54.0.0` |
| UI | React | `19.1.0` |
| Mobile | React Native | `0.81.5` |
| Web partagé | React Native Web | `^0.21.2` |
| Langage mobile | TypeScript | `~5.9.2` |
| Données/Auth | `@supabase/supabase-js` | mobile `^2.43.4` |
| État client | Zustand | `^4.4.1` |
| Navigation | React Navigation | v6 |
| Audio actuel | `expo-av` | `~16.0.8` (déprécié, migration future) |
| Super Admin | Next.js | `^16.0.0` |
| Backend | Node.js + Express | Express `^4.18.2` |

Projet Supabase canonique : `rrhqsqzcplvmwxizqnla`.

## Commandes courantes

Depuis la racine :

```bash
npm install
npm run dev:mobile
npm run dev:mobile:tunnel
npm run dev:backend
npm run dev:admin
npm run type-check
npm test
node scripts/verify-source-of-truth.cjs
```

Web Expo :

```bash
npm --workspace packages/mobile run start:web
npm --workspace packages/mobile run type-check
npm --workspace packages/mobile test
cd packages/mobile && npx expo export --platform web --output-dir dist-web
```

## Variables d'environnement importantes

Noms uniquement — ne jamais inscrire leurs valeurs secrètes dans `.context/` :

- Client public : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_AUTH_REDIRECT_URL`, `EXPO_PUBLIC_ENVIRONMENT`, `EXPO_PUBLIC_BUILD_ID`, `EXPO_PUBLIC_BUILD_SHA`, `EXPO_PUBLIC_DEMO_MODE`, `EXPO_PUBLIC_KEEP_PREVIEW`, `EXPO_PUBLIC_KEEP_REAL_RECOGNITION`, `EXPO_PUBLIC_KEEP_SHOW_DEMO`.
- Supabase/serveur : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`.
- Stripe : `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Apple : `APPLE_TEAM_ID`, `APPLE_MUSICKIT_TEAM_ID`, `APPLE_MUSICKIT_KEY_ID`, `APPLE_MUSICKIT_PRIVATE_KEY`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_ROOT_CA_G3_B64`, `APPLE_TOKEN_LIFETIME_SEC`.
- Fournisseurs musique : `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `DEEZER_APP_ID`, `DEEZER_APP_SECRET`, `YOUTUBE_API_KEY`.

## Web, build et déploiement

- Entrée utilisateur : `packages/mobile/index.js`.
- Racine React : `packages/mobile/App.tsx`.
- Navigation : `packages/mobile/src/navigation/Navigation.tsx`.
- Export Expo assemblé et publié par `.github/workflows/web-preview-pages.yml`.
- URL canonique : `https://adelkhatra-bit.github.io/KEEP/`.
- GitHub Pages nécessite des shells de routes et un `404.html` de restauration SPA ; conserver la chaîne existante.
- État PWA actuel : métadonnées mobile présentes, mais pas de manifest/service worker applicatif durable. Le script d'export purge les anciens service workers et caches lors d'un changement de build.

## Validation minimale

- Documentation seule : `git diff --check` et `node scripts/verify-source-of-truth.cjs`.
- Mobile/web modifié : typecheck mobile, tests concernés, export Expo et test navigateur réel.
- Admin/backend modifié : typecheck/build/tests du workspace concerné.
- Web critique : Chromium et Firefox desktop, Chromium Android et WebKit iPhone.
