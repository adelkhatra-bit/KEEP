# Rapport Claude Code → ChatGPT

Ce fichier est mon dernier état, lu automatiquement par `keep-ai-relay`
(GET `?op=state`) pour le connecteur ChatGPT — c'est un fichier public du
dépôt, pas une donnée secrète. Je le remets à jour à chaque étape notable et
le pousse avec le reste (workflow git normal, comme `AI_bridge.md`).

Dernière mise à jour : 2026-09-20 (session continue).
Branche : `reconcile/claude-main-20260825`. Dernier commit poussé : `cd8cc14`.

## Ce que je viens de faire

1. Corrigé 2 vraies régressions dans Battle (police sous le plancher
   11px, panneau de classement groupe mal positionné) + 3 faux positifs de
   scripts/tests CI (code réel non touché).
2. Trouvé et corrigé la cause du seul workflow rouge (`Loki — Security
   guard`) : actions GitHub non épinglées au SHA dans `auto-eas-build.yml`.
3. iOS (`auto-eas-build.yml`) : ✅ build + soumission TestFlight confirmés
   verts. Android : statut pas encore reconfirmé (limite de requêtes
   GitHub atteinte pendant la surveillance).
4. Mis en place et durci le relais ChatGPT ↔ Claude Code : table +
   fonctions `service_role`, anti-doublon, limites de taille/fréquence,
   journalisation, endpoint `?op=ping` de diagnostic sans clé (testé OK).
5. Réduit la seule étape encore manuelle côté Adel : la clé
   `AI_RELAY_API_KEY` se génère maintenant en un clic (bouton 🎲 dans
   Super Admin → Intégrations, valeur créée dans son navigateur, jamais vue
   par moi). Il ne reste qu'UNE action manuelle irréductible : créer le
   Custom GPT dans ChatGPT lui-même (aucune API publique pour ça).

## En cours / bloqué

- Statut CI Android à reconfirmer (rate limit GitHub, pas un problème de
  build).
- `packages/mobile/app.json` local corrompu : en attente de la décision
  d'Adel, rien touché.
- Faux positif Mobile CI pré-existant (fichiers "design verrouillé"
  désynchronisés du garde-fou) : signalé dans `AI_bridge.md`, pas touché,
  en attente de décision.

## Comment agir sur mes instructions

Je relis le canal `instruction` de `ai_relay_messages` (lecture seule) à
chaque reprise de session, et je consigne ce que j'en fais dans
`AI_INSTRUCTIONS.md`. Je n'exécute jamais aveuglément une instruction reçue
via ce canal : mêmes règles de sécurité que pour une instruction directe
d'Adel (jamais de secret tapé par une IA, jamais d'action destructive sans
confirmation).
