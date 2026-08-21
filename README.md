# KEEP — Musical Recognition & Smart Playlist Management

"Tu l'aimes. KEEP la range." KEEP ne diffuse pas de musique : il reconnaît,
organise et route vers les comptes musicaux que tu possèdes déjà
(Apple Music, Spotify...).

📄 **Avant de coder quoi que ce soit ici : lis `docs/PROJECT_STATUS.md`**
(statut honnête, ce qui est testé vs. codé vs. mock) et
`docs/PLATFORM_COMPLIANCE.md` (règles Spotify/Apple/Google qui contraignent
l'architecture).

## Architecture (monorepo npm workspaces)

- `packages/mobile` — React Native/Expo (iOS + Android)
- `packages/backend` — Node.js/Express + Supabase
- `packages/admin` — Next.js Super Admin
- `packages/music` — Cœur métier provider-agnostic : `MusicProviderAdapter`,
  `MusicRecognitionProvider`, `TrackResolver`, `SmartPlaylistRouter`,
  `LibraryAnalyzer`, `MusicDNA`. Zéro dépendance runtime externe — utilisé
  par mobile ET backend, une seule source de vérité pour la logique musicale.
- `supabase/migrations` — schéma complet (identité, musique, commerce,
  événements, admin, RLS), pas encore déployé.

## Quick Start

```bash
npm install
cd packages/mobile
npx expo start --tunnel   # scanne le QR avec Expo Go (iPhone/Android)
```

Vérifier le cœur métier sans Expo (utile en environnement réseau restreint) :

```bash
npx tsx packages/music/scripts/verify.ts
```

## Documentation

- `docs/PROJECT_STATUS.md` — statut réel par fonctionnalité
- `docs/RESTE_A_FAIRE.md` — backlog priorisé
- `docs/PLATFORM_COMPLIANCE.md` — règles Spotify/Apple/Google/AudD/ACRCloud
- `docs/MUSIC_RECOGNITION_PROVIDERS.md` — comparatif fournisseurs de reconnaissance
- `docs/PRICING_STRATEGY.md` — étude de marché et grille tarifaire
- `docs/INNOVATIONS.md` — analyse concurrentielle et KEEP DNA
