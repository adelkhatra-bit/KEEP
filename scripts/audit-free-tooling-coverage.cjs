const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-capabilities.json'), 'utf8'));
const tooling = inventory.freeTooling || {};
const items = Array.isArray(tooling.items) ? tooling.items : [];
const target = Number(tooling.coverageTargetPercent || 100);
const outDir = path.join(root, 'artifacts', 'free-tooling-audit');
fs.mkdirSync(outDir, { recursive: true });

function checkEvidence(entry) {
  const fullPath = path.join(root, entry.path);
  if (!fs.existsSync(fullPath)) {
    return { ok: false, reason: `missing file: ${entry.path}` };
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const contains = Array.isArray(entry.contains) ? entry.contains : [];
  for (const token of contains) {
    if (!content.includes(token)) {
      return { ok: false, reason: `missing token "${token}" in ${entry.path}` };
    }
  }
  return { ok: true, reason: `evidence OK: ${entry.path}` };
}

const results = items.map((item) => {
  const evidence = (item.evidence || []).map((entry) => ({
    ...entry,
    ...checkEvidence(entry),
  }));
  const passed = evidence.every((entry) => entry.ok);
  return {
    id: item.id,
    name: item.name,
    category: item.category || 'unknown',
    passed,
    evidence,
  };
});

const passedCount = results.filter((item) => item.passed).length;
const coverage = results.length ? Math.round((passedCount / results.length) * 100) : 0;

const lines = [
  '# Audit exploitation GitHub + modules gratuits',
  '',
  `- Branche source produit : \`${inventory.sourceBranch}\``,
  `- Cible de couverture : **${target}%**`,
  `- Couverture observée : **${coverage}%** (${passedCount}/${results.length})`,
  '',
  '## Résultats',
  '',
];

for (const item of results) {
  lines.push(`### ${item.passed ? '✅' : '❌'} ${item.name}`);
  lines.push(`- id : \`${item.id}\``);
  lines.push(`- catégorie : \`${item.category}\``);
  for (const evidence of item.evidence) {
    lines.push(`- ${evidence.ok ? 'OK' : 'KO'} — \`${evidence.path}\`${evidence.contains?.length ? ` → ${evidence.contains.join(' ; ')}` : ''}`);
  }
  lines.push('');
}

if (coverage < target) {
  lines.push('## Gaps');
  lines.push('');
  for (const item of results.filter((entry) => !entry.passed)) {
    lines.push(`- \`${item.id}\` — ${item.name}`);
    for (const evidence of item.evidence.filter((entry) => !entry.ok)) {
      lines.push(`  - ${evidence.reason}`);
    }
  }
  lines.push('');
}

fs.writeFileSync(path.join(outDir, 'report.md'), `${lines.join('\n')}\n`);
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({
  target,
  coverage,
  passedCount,
  totalCount: results.length,
  results,
}, null, 2));

console.log(`FREE TOOLING COVERAGE: ${coverage}% (${passedCount}/${results.length})`);
if (coverage < target) {
  console.error(`Coverage below target ${target}%`);
  process.exit(1);
}
