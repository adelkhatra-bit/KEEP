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

if (failures.length) {
  console.error('KEEP capability inventory: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`KEEP capability inventory: PASS (${Object.keys(inventory.capabilities).length} groups, ${inventory.requiredWorkflows.length} required workflows)`);
