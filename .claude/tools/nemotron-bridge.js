/**
 * Nemotron/KEEP bridge -- outillage d'orchestration (`.claude/tools/`, pas
 * une fonctionnalite de l'app KEEP elle-meme). Claude reste l'unique
 * executeur reel de chaque outil ; Nemotron ne fait que DEMANDER via
 * function-calling, jamais d'acces disque/shell direct. Aucun outil
 * d'ecriture -- `propose_patch` retourne du texte, n'ecrit jamais sur
 * disque (Adel, 24/08/2026 : "Claude reste l'orchestrateur, controle les
 * changements avant ecriture"). Reutiliser ce fichier, jamais en
 * reconstruire un second.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.nvidia.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const key = process.env.NVIDIA_BUILD_API_KEY;
const REPO_ROOT = require('path').resolve(__dirname, '../..');
const CHUNK_SIZE = 4000;
const MAX_TOOL_CALLS = 40;
const MAX_REPEAT_SAME_CALL = 2;

function inRepo(relPath) {
  const abs = path.resolve(REPO_ROOT, relPath);
  return abs.startsWith(path.resolve(REPO_ROOT)) ? abs : null;
}

// ---- Outils reels (lecture seule + commandes fixes, jamais de shell arbitraire) ----

const toolImpls = {
  list_directory(args) {
    const abs = inRepo(args.path || '.');
    if (!abs) return { error: 'refused: outside repo' };
    try {
      const entries = fs.readdirSync(abs, { withFileTypes: true })
        .filter((e) => !['node_modules', '.git', '.expo'].includes(e.name))
        .map((e) => (e.isDirectory() ? e.name + '/' : e.name));
      return { entries };
    } catch (e) { return { error: `cannot list: ${args.path}` }; }
  },

  search_repo(args) {
    // BUG RÉEL trouvé le 24/08/2026 : `rg` (ripgrep) n'est pas installé dans
    // ce shell -- chaque appel échouait silencieusement en `(aucun resultat)`,
    // faisant croire à Nemotron qu'aucune recherche ne trouvait rien, l'a
    // fait insister sur cet outil cassé au lieu de conclure. `git grep`
    // fonctionne toujours dans un vrai repo git, aucune dépendance externe.
    try {
      const glob = args.glob ? `-- "${args.glob}"` : '';
      const ctx = Number(args.context) > 0 ? `-C ${Math.min(Number(args.context), 15)}` : '';
      const out = execSync(`git grep -n -i --max-count=30 ${ctx} "${args.query.replace(/"/g, '\\"')}" ${glob}`, {
        cwd: REPO_ROOT, encoding: 'utf-8', timeout: 15000,
      });
      return { matches: out.slice(0, 5000) };
    } catch (e) {
      if (e.status === 1) return { matches: '(aucun resultat reel -- terme absent du repo)' };
      return { matches: `erreur outil: ${String(e.stderr || e.message).slice(0, 300)}` };
    }
  },

  read_file_chunk(args) {
    const abs = inRepo(args.path);
    if (!abs) return { error: 'refused: outside repo' };
    let full;
    try { full = fs.readFileSync(abs, 'utf-8'); } catch { return { error: `not found: ${args.path}` }; }
    const offset = Number(args.offset) || 0;
    const chunk = full.slice(offset, offset + CHUNK_SIZE);
    return {
      chunk,
      offset,
      chunk_length: chunk.length,
      total_length: full.length,
      has_more: offset + CHUNK_SIZE < full.length,
      next_offset: offset + CHUNK_SIZE < full.length ? offset + CHUNK_SIZE : null,
    };
  },

  git_status() {
    return { output: execSync('git status --short', { cwd: REPO_ROOT, encoding: 'utf-8' }).slice(0, 3000) };
  },
  git_diff(args) {
    const target = args.path ? `-- ${args.path}` : '';
    return { output: execSync(`git diff ${target}`, { cwd: REPO_ROOT, encoding: 'utf-8' }).slice(0, 5000) };
  },
  git_log(args) {
    return { output: execSync(`git log --oneline -${Number(args.limit) || 15}`, { cwd: REPO_ROOT, encoding: 'utf-8' }) };
  },
  git_blame(args) {
    if (!inRepo(args.path)) return { error: 'refused: outside repo' };
    try {
      return { output: execSync(`git blame --line-porcelain -L ${Number(args.start) || 1},+${Math.min(Number(args.lines) || 30, 60)} "${args.path}"`, { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 10000 }).slice(0, 4000) };
    } catch (e) { return { error: `blame failed: ${String(e.message).slice(0, 200)}` }; }
  },

  /** Memoire projet reelle a la demande -- reutilise les docs/KEEP_*.md deja existants, aucun doublon. CLAUDE.md est deja dans le preambule systeme, inutile de le redemander. */
  read_project_memory(args) {
    const map = {
      spec: 'docs/KEEP_MASTER_SPEC.md',
      checklist: 'docs/KEEP_MASTER_CHECKLIST.md',
      decisions: 'docs/KEEP_DECISIONS.md',
      design_system: 'docs/KEEP_DESIGN_SYSTEM.md',
      tests: 'docs/KEEP_REGRESSION_TESTS.md',
      modals_audit: 'docs/KEEP_MODALS_AUDIT.md',
    };
    const key = String(args.topic || '').toLowerCase();
    const rel = map[key];
    if (!rel) return { error: `topic inconnu -- utilise l'un de : ${Object.keys(map).join(', ')}` };
    try {
      return { content: fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8').slice(0, 8000), source: rel };
    } catch { return { error: `fichier introuvable: ${rel}` }; }
  },

  /** npm audit reel -- securite/dependances, jamais de secrets impliques (juste les versions de packages publiques). */
  run_dependency_audit(args) {
    const allowed = ['mobile', 'backend', 'music', 'admin'];
    if (!allowed.includes(args.package)) return { error: `package must be one of ${allowed.join(',')}` };
    try {
      const out = execSync('npm audit --json', { cwd: path.join(REPO_ROOT, 'packages', args.package), encoding: 'utf-8', timeout: 30000 });
      return { output: out.slice(0, 4000) };
    } catch (e) {
      // npm audit sort avec un code non-zero des qu'il trouve une vulnerabilite -- c'est un RESULTAT, pas une erreur d'execution.
      return { output: String(e.stdout || e.message).slice(0, 4000) };
    }
  },

  /** Ajoute au 24/08/2026 (demande explicite -- Nemotron propose un patch en TEXTE, jamais d'ecriture disque). Ne touche RIEN -- capture juste la proposition dans le transcript pour que Claude la lise et l'applique lui-meme apres revue. */
  propose_patch(args) {
    console.log(`\n    [PATCH PROPOSE par Nemotron -- ${args.path}]\n${'-'.repeat(50)}\n${args.reasoning || ''}\n\n${args.patch}\n${'-'.repeat(50)}`);
    return { received: true, note: 'Patch enregistre dans le transcript pour revue par Claude -- AUCUNE ecriture disque effectuee.' };
  },

  run_typecheck(args) {
    const allowed = ['mobile', 'backend', 'music', 'admin'];
    if (!allowed.includes(args.package)) return { error: `package must be one of ${allowed.join(',')}` };
    try {
      execSync(`npx tsc --noEmit -p packages/${args.package}`, { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 90000 });
      return { result: 'PASS -- aucune erreur de type' };
    } catch (e) { return { result: 'FAIL', output: String(e.stdout || e.message).slice(0, 3000) }; }
  },

  run_smoke_test() {
    try {
      const out = execSync('npx ts-node scripts/e2e-smoke-test.ts', {
        cwd: path.join(REPO_ROOT, 'packages/backend'), encoding: 'utf-8', timeout: 60000,
        env: { ...process.env, KEEP_TEST_API_URL: 'https://grad-lottery-nor-traveling.trycloudflare.com' },
      });
      return { output: out.slice(0, 3000) };
    } catch (e) { return { output: String(e.stdout || e.message).slice(0, 3000) }; }
  },

  /** Reutilise la vraie suite Playwright deja construite (packages/mobile/e2e/) -- commande FIXE, jamais un script arbitraire. */
  run_playwright_test(args) {
    try {
      const grep = args.pattern ? `-g "${args.pattern.replace(/"/g, '\\"')}"` : '';
      const out = execSync(`npx playwright test --config=e2e/playwright.config.ts ${grep}`, {
        cwd: path.join(REPO_ROOT, 'packages/mobile'), encoding: 'utf-8', timeout: 120000,
      });
      return { output: out.slice(0, 3000) };
    } catch (e) { return { output: String(e.stdout || e.message).slice(0, 3000) }; }
  },

  read_recognition_traces() {
    try {
      const out = execSync('curl -s https://grad-lottery-nor-traveling.trycloudflare.com/api/dev/traces', { encoding: 'utf-8', timeout: 15000 });
      return { traces: out.slice(0, 5000) };
    } catch (e) { return { error: e.message }; }
  },
};

const tools = [
  { type: 'function', function: { name: 'list_directory', description: 'Liste fichiers/dossiers a un chemin du repo KEEP.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'search_repo', description: 'Recherche texte/symbole dans tout le repo (git grep). Passe context>0 pour voir les lignes autour de chaque match (utile pour comprendre un module, pas juste une ligne isolee).', parameters: { type: 'object', properties: { query: { type: 'string' }, glob: { type: 'string', description: 'optionnel, ex *.ts' }, context: { type: 'number', description: 'lignes de contexte avant/apres, 0-15' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'read_file_chunk', description: 'Lit un fichier par morceaux (les fichiers de moins de 4000 caracteres reviennent ENTIERS en un seul appel, has_more=false). Rappelle has_more/next_offset pour continuer -- ne redemande JAMAIS le meme offset deux fois de suite.', parameters: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number', description: '0 par defaut' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'git_status', description: 'git status --short reel du repo (montre AUSSI les fichiers non suivis/untracked).', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'git_diff', description: 'git diff reel, optionnellement pour un fichier precis.', parameters: { type: 'object', properties: { path: { type: 'string' } } } } },
  { type: 'function', function: { name: 'git_log', description: 'git log --oneline reel.', parameters: { type: 'object', properties: { limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'git_blame', description: 'git blame reel sur une plage de lignes d\'un fichier -- qui a modifie quoi, quand, pourquoi (via le message de commit).', parameters: { type: 'object', properties: { path: { type: 'string' }, start: { type: 'number' }, lines: { type: 'number', description: 'max 60' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'run_typecheck', description: 'Lance tsc --noEmit reel sur un package (mobile|backend|music|admin).', parameters: { type: 'object', properties: { package: { type: 'string' } }, required: ['package'] } } },
  { type: 'function', function: { name: 'run_smoke_test', description: 'Lance la vraie suite e2e-smoke-test.ts (API backend) contre le backend live.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'run_playwright_test', description: 'Lance la vraie suite Playwright (navigateur reel) sur packages/mobile/e2e. Optionnellement filtree par un motif de nom de test.', parameters: { type: 'object', properties: { pattern: { type: 'string' } } } } },
  { type: 'function', function: { name: 'read_recognition_traces', description: 'Lit les vraies traces serveur recentes de reconnaissance (/api/dev/traces) -- capture reelle mic->backend->AudD.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'read_project_memory', description: 'Recupere un document de reference reel du projet KEEP (spec/checklist/decisions/design_system/tests/modals_audit) -- appelle ceci AVANT toute mission plutot que de redemander a l\'utilisateur d\'expliquer KEEP.', parameters: { type: 'object', properties: { topic: { type: 'string', enum: ['spec', 'checklist', 'decisions', 'design_system', 'tests', 'modals_audit'] } }, required: ['topic'] } } },
  { type: 'function', function: { name: 'run_dependency_audit', description: 'npm audit reel sur un package (mobile|backend|music|admin) -- vulnerabilites de dependances connues, aucun secret implique.', parameters: { type: 'object', properties: { package: { type: 'string' } }, required: ['package'] } } },
  { type: 'function', function: { name: 'propose_patch', description: 'Propose un correctif textuel pour un fichier (diff ou description precise) -- N\'ECRIT JAMAIS sur le disque, Claude lit la proposition et l\'applique lui-meme apres revue. Utilise ceci plutot que de decrire un patch en texte libre.', parameters: { type: 'object', properties: { path: { type: 'string' }, reasoning: { type: 'string', description: 'pourquoi ce changement' }, patch: { type: 'string', description: 'le patch propose (diff ou avant/apres clair)' } }, required: ['path', 'patch'] } } },
];

async function callNemotron(messages) {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      messages, tools, tool_choice: 'auto',
      max_tokens: 2500,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  return res.json();
}

/** Memoire projet reelle -- reutilise CLAUDE.md, jamais un deuxieme systeme. */
function projectMemoryPreamble() {
  const claudeMd = fs.readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf-8');
  return `Tu travailles sur KEEP (repo reel, acces en lecture seule via des outils que Claude Code execute pour toi -- tu ne touches jamais le disque toi-meme). Voici le protocole obligatoire du projet (CLAUDE.md) que TOUT agent doit suivre :\n\n${claudeMd}\n\nTu as des outils : list_directory, search_repo (+contexte), read_file_chunk (pagine), git_status, git_diff, git_log, git_blame, run_typecheck, run_smoke_test, run_playwright_test, read_recognition_traces, read_project_memory (spec/checklist/decisions/design_system/tests -- appelle-le AVANT de commencer une mission), run_dependency_audit, propose_patch. AUCUN outil d'ecriture n'existe -- tu ne peux que lire/chercher/tester, jamais modifier. Si tu veux proposer un changement, ecris-le en texte, Claude l'appliquera apres revue.\n\nIMPORTANT sur les chemins : la RACINE du repo EST directement "packages/", "docs/", "CLAUDE.md", etc. -- PAS de prefixe "KEEP/" (bug reel constate le 24/08/2026 : un agent a suppose a tort un sous-dossier "KEEP/" et enchaine des echecs sans jamais se corriger malgre list_directory(".") montrant la vraie racine). Exemple de chemin CORRECT : "packages/mobile/src/store/useSessionStore.ts". Si un chemin echoue, appelle list_directory sur son dossier parent AVANT de reessayer une variante -- ne devine jamais un deuxieme chemin sans verifier.`;
}

async function runAgentTask(taskPrompt, maxTurns = 25) {
  let messages = [
    { role: 'system', content: projectMemoryPreamble() },
    { role: 'user', content: taskPrompt },
  ];
  const callCounts = new Map();
  let toolCallsUsed = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 4; // "appels sans progression" -- bug reel du 24/08/2026 (confusion de chemin "KEEP/" jamais corrigee malgre des arguments differents a chaque fois, donc invisible a la detection de boucle exacte).

  for (let turn = 0; turn < maxTurns; turn++) {
    const json = await callNemotron(messages);
    const msg = json.choices?.[0]?.message;
    if (!msg) { console.log('ERREUR API:', JSON.stringify(json).slice(0, 500)); return; }
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // BUG RÉEL constaté le 24/08/2026 (2 tâches sur 4 touchées) : après
      // plusieurs lectures de fichier, le modèle renvoie parfois `content`
      // vide sans tool_calls -- un "silence" qui n'est PAS une vraie
      // conclusion. Ne jamais l'accepter tel quel -- relancer une fois avec
      // une demande explicite avant d'abandonner.
      if (!msg.content || !msg.content.trim()) {
        console.log('[REPONSE VIDE -- relance explicite]');
        messages.push({ role: 'user', content: 'Ta reponse precedente etait vide. Donne ta conclusion reelle maintenant, en texte, meme partielle si tu manques d\'informations.' });
        continue;
      }
      console.log('\n=== REPONSE FINALE ===\n');
      console.log(msg.content);
      return;
    }

    for (const call of msg.tool_calls) {
      toolCallsUsed++;
      if (toolCallsUsed > MAX_TOOL_CALLS) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'LIMITE_OUTILS_ATTEINTE: conclus maintenant avec ce que tu as.' }) });
        continue;
      }
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
      const sig = `${call.function.name}:${JSON.stringify(args)}`;
      const repeatCount = (callCounts.get(sig) || 0) + 1;
      callCounts.set(sig, repeatCount);

      if (repeatCount > MAX_REPEAT_SAME_CALL) {
        console.log(`>>> [BOUCLE BLOQUEE] ${call.function.name}(${JSON.stringify(args)}) demande ${repeatCount}x`);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: `BOUCLE_DETECTEE: tu as deja demande exactement ceci ${repeatCount} fois. Change de strategie (autre offset/outil) ou conclus avec ce que tu as deja.` }) });
        continue;
      }

      console.log(`>>> ${call.function.name}(${JSON.stringify(args).slice(0, 100)})`);
      const impl = toolImpls[call.function.name];
      const result = impl ? impl(args) : { error: 'outil inconnu' };
      const preview = JSON.stringify(result).slice(0, 150);
      console.log(`    -> ${preview}${preview.length >= 150 ? '...' : ''}`);

      if (result && result.error) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.log(`\n[FALLBACK CLAUDE] ${consecutiveErrors} echecs consecutifs sans progression -- Nemotron n'avance pas, Claude reprend la main.`);
          return { stuck: true, reason: `${consecutiveErrors} echecs consecutifs`, lastError: result.error };
        }
      } else {
        consecutiveErrors = 0; // un succes reel repart de zero, seule une SUITE d'echecs declenche le fallback.
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  console.log(`\n[ARRET] ${maxTurns} tours atteints sans reponse finale.`);
  return { stuck: true, reason: 'max_turns' };
}

module.exports = { runAgentTask };

// Execution directe si lance en CLI avec un argument de tache
if (require.main === module) {
  const taskArg = process.argv[2];
  if (taskArg === 'large-file-test') {
    runAgentTask("Lis packages/mobile/src/screens/ProfileScreen.tsx EN ENTIER en utilisant read_file_chunk avec pagination (suis has_more/next_offset). Une fois le fichier complet lu, dis-moi son nombre total de lignes approximatif et confirme que tu l'as lu integralement, en 2 phrases.", 20);
  } else if (taskArg === 'recognition-audit') {
    runAgentTask("Audit en LECTURE SEULE de la chaine de reconnaissance musicale KEEP : micro -> capture audio -> fichier audio -> backend -> AudD -> parsing -> resultat -> sauvegarde -> affichage. Utilise tes outils (search_repo, read_file_chunk, read_recognition_traces, git_log) pour trouver le VRAI point de rupture actuel dans cette chaine, si il y en a un. Ne suppose rien -- verifie avec les vrais fichiers et les vraies traces serveur recentes. Cherche d'abord packages/mobile/src/store/useSessionStore.ts (la boucle de capture), packages/music/src/RecognitionRouter.ts, packages/music/src/providers/AudDRecognitionProvider.ts, et packages/backend/src/routes/recognition.ts. Conclus avec : le point de rupture exact trouve (fichier+ligne si possible), ou confirmation qu'aucun point de rupture reel n'existe dans le code (auquel cas le probleme est ailleurs, precise ou).", 30);
  }
}
