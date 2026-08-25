const { runAgentTask } = require('./.claude/tools/nemotron-bridge.js');
const task = `AUDIT (lecture seule, aucune modification) -- écran Profil KEEP, design réel signalé cassé par Adel (le fondateur) après un test sur son vrai ordinateur : "design de merde, mal aligné, tout collé, pas digne d'un professionnel, on va se faire recaler par l'Apple Store".

Lis en entier packages/mobile/src/screens/ProfileScreen.tsx (le fichier complet, plusieurs read_file_chunk si besoin) et packages/mobile/src/components/PublicProfilePreview.tsx. Compare précisément contre docs/KEEP_DESIGN_SYSTEM.md (lis-le via read_project_memory topic "design_system") -- c'est la source de vérité validée du projet (tokens spacing/radius/typography, tailles boutons 48px, jaquettes 48x48, règle "aucune valeur arbitraire").

Cherche spécifiquement et RAPPORTE avec les numéros de ligne réels :
1. Toute valeur de style en dur (px, marges, paddings) qui N'UTILISE PAS les tokens spacing/radius/typography de theme/spacing.ts -- liste chaque occurrence trouvée.
2. Zones où plusieurs éléments s'enchaînent sans marginBottom/gap explicite (risque réel de "tout collé").
3. Boutons (ex. "Créer mon compte gratuit", "Partager mon KEEP", "QR Profil", "Voir mon profil comme un visiteur", "Partager pour comparer", "Comparer nos KEEP", "Quitter (invité)") -- tailles/hauteurs cohérentes entre eux ? Alignement (row/column, gap) cohérent avec le Design System ?
4. La bannière "Créer ton compte gratuit" -- style cohérent avec le reste de l'écran ou visuellement en rupture ?
5. Toute incohérence de hiérarchie visuelle (tailles de texte, couleurs) entre sections.

Ne propose PAS de patch pour l'instant, juste un rapport précis et honnête (si le code respecte réellement déjà le Design System malgré le ressenti visuel d'Adel, dis-le aussi -- ne cherche pas des problèmes qui n'existent pas juste pour avoir quelque chose à rapporter).`;

runAgentTask(task, 40).then((result) => {
  console.log('\n=== RESULT ===\n');
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}).catch((e) => {
  console.error('BRIDGE ERROR:', e);
  process.exitCode = 1;
});
