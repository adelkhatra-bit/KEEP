const { runAgentTask } = require('./.claude/tools/nemotron-bridge.js');
const task = `AUDIT (lecture seule, aucune modification, ne propose PAS de patch via propose_patch pour l'instant -- juste un rapport) -- animation micro réactive de KEEP.

CONTEXTE RÉEL (déjà vérifié par Claude, ne le re-vérifie pas) : le pipeline mic->capture->backend fonctionne (preuve : trace serveur réelle avec peak=0.1434, 958508 octets capturés). Le niveau micro réel EST déjà câblé de bout en bout : micCapture.ts calcule un niveau réel par chunk (onaudioprocess web / metering expo-av natif), useSessionStore.ts l'expose via 'micLevel' dans le store (voir set({micLevel: level}) ligne ~485), HomeScreen.tsx le passe à <SessionPulse level={...}>, SessionPulse.tsx applique déjà une courbe sqrt() pour amplifier les niveaux réalistes faibles (0.03-0.06) en mouvement visible.

Objectif : Adel (le fondateur) a testé en vrai sur son ordinateur et ne considère PAS l'animation comme terminée. Il veut EXACTEMENT ce comportement :
1. MIC OFF -> animation au repos (aucune activité)
2. MIC ON + SILENCE -> respiration très légère (pas complètement figée, pas non plus active)
3. MIC ON + VOIX/MUSIQUE -> animation réactive en temps réel, plus le niveau sonore augmente, plus l'animation réagit
4. CAPTURE TERMINÉE -> transition claire vers un état "analyse/recherche" (visuellement différent de l'écoute)
5. MATCH -> animation de succès + résultat affiché
6. NO MATCH -> message propre + possibilité de recommencer

Lis en entier packages/mobile/src/components/SessionPulse.tsx (tout le fichier, pas juste des extraits) et packages/mobile/src/screens/HomeScreen.tsx (la partie qui utilise SessionPulse et gère les états recognizing/tracks/error/guestLimitReached). Rapporte précisément, avec numéros de ligne réels :
- Combien d'états visuels SessionPulse gère-t-il RÉELLEMENT aujourd'hui (regarde les props 'active'/'isLive'/'level' et toute la logique interne) ?
- Lequel des 6 comportements demandés par Adel EXISTE déjà, PARTIELLEMENT, ou N'EXISTE PAS DU TOUT ?
- Pour "MIC ON + SILENCE -> respiration légère" : le code actuel produit-il ce résultat quand level=0 mais isLive=true, ou l'animation reste-t-elle strictement figée à ce moment (regarde le useEffect qui pilote waveBars) ?
- Pour "CAPTURE TERMINÉE -> transition vers analyse/recherche" et "MATCH -> succès" et "NO MATCH -> propre+recommencer" : existe-t-il un prop/state pour un mode "analyzing" ou "success" ou "no_match" dans SessionPulse ou ailleurs, ou est-ce totalement absent aujourd'hui ?
- Propose UNE solution minimale (pas une réécriture complète) pour combler les manques réels trouvés, avec les changements précis (quel fichier, quelle ligne, quel changement) -- mais n'applique rien, juste la proposition écrite.

Sois exhaustif et précis avec les lignes réelles du code, pas des suppositions.`;

runAgentTask(task, 40).then((result) => {
  console.log('\n=== RESULT ===\n');
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}).catch((e) => {
  console.error('BRIDGE ERROR:', e);
  process.exitCode = 1;
});
