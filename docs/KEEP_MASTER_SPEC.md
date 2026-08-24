# KEEP — Spécification produit

Créé le 24/08/2026. Décrit CE QU'EST KEEP aujourd'hui (architecture réelle,
pas une aspiration). Pour les règles qui ne doivent pas changer sans
validation explicite, voir `KEEP_DECISIONS.md`. Pour ce qui reste à faire,
voir `KEEP_MASTER_CHECKLIST.md`.

## Le produit en une phrase

KEEP écoute un son, l'identifie, et connecte cette identité au profil
musical de l'utilisateur et à ses plateformes de streaming — sans jamais
héberger l'audio lui-même.

```
SON ENTENDU → RECONNAISSANCE → IDENTITÉ DU MORCEAU → KEEP → PROFIL MUSICAL
→ SPOTIFY / APPLE MUSIC / YOUTUBE / AUTRES → PROPAGATION ENTRE UTILISATEURS
```

## Monorepo

- `packages/mobile` — Expo/React Native (fonctionne aussi en web via
  `expo start --web`, port 8081). App principale utilisateur.
- `packages/admin` — Next.js, Super Admin (port 3001 en local).
- `packages/backend` — Node/Express (port 3010 en local, voir `.env` PORT).
- `packages/music` — logique métier partagée (providers de reconnaissance,
  résolution multi-plateforme, router).
- `supabase/migrations/` — schéma + RLS, appliqué via Management API PAT
  (jamais la clé service_role, jamais le mot de passe DB directement).

## Reconnaissance musicale — chaîne réelle

Deux providers chaînés par `RecognitionRouter` (`packages/music`), essayés
dans l'ordre :

1. **AcoustID** (gratuit, primaire) — transport SERVEUR : audio → backend
   KEEP (`POST /api/recognition/identify`) → `fpcalc` (Chromaprint, binaire
   externe, `FPCALC_PATH` dans `.env`) → fingerprint → `api.acoustid.org`
   (clé `ACOUSTID_API_KEY`, backend uniquement). Couverture limitée (base
   MusicBrainz, plus petite que les services commerciaux) — un `no_match`
   propre est un résultat NORMAL, pas une erreur.
2. **AudD** (payant, fallback, meilleure couverture) — transport CLIENT
   DIRECT : le mobile appelle `api.audd.io` directement avec
   `EXPO_PUBLIC_AUDD_API_KEY` (clé exposée côté client par design — c'est un
   provider tiers, pas une clé KEEP). Free tier 300 requêtes à vie, ensuite
   payant ~$5/1000 (voir `docs/MUSIC_RECOGNITION_PROVIDERS.md`).

Le quota Guest/Free (voir `KEEP_DECISIONS.md`) est vérifié CÔTÉ BACKEND,
avant tout traitement audio, sur la route AcoustID uniquement — un
compteur unique par `auth.uid()` (`recognitionAttemptCounts` en mémoire
process, remis à zéro à chaque redémarrage backend).

## Auth & identité

- Supabase Auth. Trois états : Guest (session anonyme réelle,
  `is_anonymous:true`), Compte réel, Mode Démo (données fictives locales,
  jamais mélangé avec le mode réel).
- Guest → Compte réel : voir méthode sûre dans `KEEP_DECISIONS.md`
  (`updateUser`+`verifyOtp(email_change)`, préserve `auth.uid()`).
- Écran d'entrée (`OnboardingScreen.tsx`, non connecté) : Google (pas
  branché) / e-mail (seul flux réel) / "Essayer sans compte" (guest).
- Conversion guest (`OnboardingScreen` en mode `embedded`, ouvert via la
  route `CreateAccount` depuis `HomeScreen`/`ProfileScreen`) : va
  directement à l'étape e-mail, jamais l'écran d'entrée complet.
- Emails transactionnels : Supabase Auth "Send Email Hook"
  (`packages/backend/src/routes/authEmailHook.ts`) intercepte l'envoi et le
  redirige vers Brevo (branding KEEP) au lieu du mailer Supabase par
  défaut. Supabase reste l'identité/session ; seul l'envoi d'email change.

## Écrans mobile (onglets principaux)

- **Session KEEP** (`HomeScreen`) — capture/reconnaissance en continu,
  historique de session.
- **Découvrir** (`DiscoverScreen`).
- **Mes musiques** (`MyMusicScreen`) — sessions, morceaux gardés, albums
  calculés depuis l'historique LOCAL (`useSessionHistoryStore`, persisté
  AsyncStorage, PAR APPAREIL/NAVIGATEUR — pas encore synchronisé compte).
- **Profil** (`ProfileScreen`) — identité, réseaux sociaux, services
  musicaux connectés, KEEP DNA, bannière de conversion Guest→Compte.

## Stockage — ce qui est réellement synchronisé vs local uniquement

| Donnée | Stockage | Portée |
|---|---|---|
| Profil (bio, ville, réseaux, genres...) | Supabase (`profiles`) | Par compte, synchronisé |
| KEEP écrits via `/api/social/me/keeps` | Supabase (`keep_decisions`) | Par compte, synchronisé |
| Likes | Supabase (`track_likes`) | Par compte, synchronisé |
| Historique de session / "Mes musiques" | AsyncStorage local | Par appareil/navigateur uniquement — PAS encore migré vers `/me/keeps` côté UI |
| Playlists affichées | Dérivées du provider connecté (Spotify/Apple) | Vide tant qu'aucun service n'est connecté (garde anti-fausses-données) |

Point d'attention actif : `/api/social/me/keeps` existe et fonctionne
(vérifié par test réel le 24/08/2026) mais n'est encore consommé par AUCUN
écran mobile — "Mes musiques" lit toujours l'historique local. Brancher
ceci est un chantier séparé, pas fait à la volée.

## Super Admin

- Recherche utilisateur + octroi de plan gratuit (durée fixe ou illimitée),
  via RLS + fonctions `SECURITY DEFINER` (`is_admin()`,
  `get_my_admin_role()`) plutôt que `service_role` (jamais configuré avec
  une vraie clé à ce jour — voir `KEEP_MASTER_CHECKLIST.md`).
- Configuration des quotas (`remote_config`) sans déploiement.
