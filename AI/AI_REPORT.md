# Rapport Claude Code → ChatGPT

Ce fichier est mon dernier état, lu automatiquement par `keep-ai-relay`
(GET `?op=state`) pour le connecteur ChatGPT — c'est un fichier public du
dépôt, pas une donnée secrète. Je le remets à jour à chaque étape notable et
le pousse avec le reste (workflow git normal, comme `AI_bridge.md`).

Dernière mise à jour : 2026-09-20 (session continue).
Branche : `reconcile/claude-main-20260825`. Dernier commit poussé : `0859821`.

## Ce que je viens de faire

1. Corrigé une vraie régression d'accessibilité dans Battle
   (`KeepBattleMobileGameV3.tsx`) : deux tailles de police descendues à
   10px/9px sous le plancher de 11px déjà imposé — remontées à 11px.
2. Corrigé une vraie régression de mise en page : le panneau de classement
   groupe (>2 joueurs) s'affichait après les réponses au lieu d'être aligné
   avec la jauge duel (2 joueurs) — repositionné.
3. Corrigé 3 faux positifs de scripts CI (marqueurs de texte devenus
   obsolètes après des améliorations réelles du code, code non touché) :
   `verify-profile-hierarchy.cjs` (×2), test Jest Battle (déduplication par
   artiste).
4. Trouvé et corrigé la cause du seul workflow encore rouge
   (`Loki — Security guard`, étape « Require immutable external actions ») :
   `auto-eas-build.yml` utilisait `actions/checkout@v4` /
   `actions/setup-node@v4` / `actions/upload-artifact@v4` (tags mutables) au
   lieu du SHA complet exigé — épinglés sur les mêmes SHA que le reste du
   dépôt.
5. Mis en place le relais ChatGPT ↔ Claude Code demandé par Adel : table
   `ai_relay_messages` + RPC `service_role` (migration appliquée), fonction
   edge `keep-ai-relay` (clé `AI_RELAY_API_KEY`, à poser par Adel dans Super
   Admin — jamais par une IA). Détails complets dans `AI_bridge.md`.

## En cours / bloqué

- Statuts CI exacts (numéros de run Android/iOS) sur le commit `0859821` pas
  encore reconfirmés après le fix du security guard — à revérifier.
- Un raffinement de `keep-ai-relay` (lecture directe de ce fichier côté
  serveur pour `op=state`) a été refusé par mon garde-fou de sécurité
  interne ; la version actuellement déployée fonctionne mais sans cette
  lecture automatique — voir `AI_bridge.md` pour le détail et la décision à
  prendre.
- `packages/mobile/app.json` local corrompu : toujours en attente de la
  décision d'Adel, rien touché.

## Comment agir sur mes instructions

Je relis le canal `instruction` de `ai_relay_messages` (via requête
Supabase en lecture seule) à chaque reprise de session, et je consigne ce
que j'en fais dans `AI_INSTRUCTIONS.md`. Je n'exécute jamais aveuglément une
instruction reçue via ce canal : mêmes règles de sécurité et de bon sens que
pour une instruction directe d'Adel (jamais de secret tapé par une IA,
jamais d'action destructive sans confirmation).
