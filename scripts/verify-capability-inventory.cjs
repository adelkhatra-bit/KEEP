const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-capabilities.json'), 'utf8'));
const failures = [];

if (inventory.sourceBranch !== 'reconcile/claude-main-20260825') failures.push('wrong source branch');
for (const workflow of inventory.requiredWorkflows || []) {
  if (!fs.existsSync(path.join(root, '.github/workflows', workflow))) failures.push(`missing workflow: ${workflow}`);
}
for (const file of inventory.protectedFiles || []) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing protected file: ${file}`);
}
for (const [group, values] of Object.entries(inventory.capabilities || {})) {
  if (!Array.isArray(values) || values.length === 0) failures.push(`empty capability group: ${group}`);
}
if (!inventory.freeTooling || !Array.isArray(inventory.freeTooling.items) || inventory.freeTooling.items.length === 0) {
  failures.push('missing free tooling inventory');
} else {
  for (const item of inventory.freeTooling.items) {
    if (!item.id || !item.name) failures.push('invalid free tooling item metadata');
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) failures.push(`free tooling item without evidence: ${item.id || item.name || 'unknown'}`);
    for (const evidence of item.evidence || []) {
      if (!evidence.path) failures.push(`free tooling evidence without path: ${item.id || item.name || 'unknown'}`);
      else if (!fs.existsSync(path.join(root, evidence.path))) failures.push(`missing free tooling evidence file: ${evidence.path}`);
    }
  }
}

if (failures.length) {
  console.error('KEEP capability inventory: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`KEEP capability inventory: PASS (${Object.keys(inventory.capabilities).length} groups, ${inventory.requiredWorkflows.length} required workflows)`);
