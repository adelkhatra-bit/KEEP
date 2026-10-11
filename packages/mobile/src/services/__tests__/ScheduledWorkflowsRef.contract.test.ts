import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const workflowsDir = path.join(root, '.github', 'workflows');
const CANONICAL = 'reconcile/claude-main-20260825';

// Incident 11/10/2026 : « Mobile + Desktop Guardian » et « Human Guardian » rouges à chaque cron (le cron lit la branche par défaut).
describe('Workflows planifiés : toujours la branche canonique', () => {
  const scheduled = fs.readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => ({ name, text: fs.readFileSync(path.join(workflowsDir, name), 'utf8') }))
    .filter(({ text }) => /^\s*schedule:/m.test(text));

  it('il existe des workflows planifiés à contrôler', () => {
    expect(scheduled.length).toBeGreaterThan(0);
  });

  it.each(scheduled.map(({ name, text }) => [name, text]))('%s : chaque actions/checkout impose ref: %s', (_name, text) => {
    const lines = String(text).split('\n');
    lines.forEach((line, index) => {
      if (!/uses:\s*actions\/checkout@/.test(line)) return;
      const window = lines.slice(index, index + 6).join('\n');
      expect(window).toContain(`ref: ${CANONICAL}`);
    });
  });
});
