import fs from 'fs';
import path from 'path';

// Lot n°5 (05/10/2026) : notifications maîtrisées. Le worker lit l'interrupteur
// « promos », plafonne les alertes téléphone (8/jour) sans jamais plafonner les
// messages directs ni l'argent, et la base accepte le statut CAPPED_IN_APP.
const root = path.join(__dirname, '..', '..', '..', '..', '..');
const worker = fs.readFileSync(path.join(root, 'supabase', 'functions', 'keep-push-worker', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261005050000_push_cap_and_instant_kick.sql'), 'utf8');
const otaWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'eas-update-production.yml'), 'utf8');

describe('politique du worker push', () => {
  it('reads marketing_enabled for promotional notifications', () => {
    expect(worker).toContain('marketing_enabled');
    expect(worker).toContain('if (isMarketingNotification(notification)) return "marketing";');
    expect(worker).toContain('category === "marketing" ? data.marketing_enabled !== false');
  });

  it('caps phone alerts at 8/day but never AGORA_DIRECT nor money', () => {
    expect(worker).toContain('const DEFAULT_PUSH_DAILY_CAP = 8;');
    expect(worker).toContain('"push_daily_cap"');
    expect(worker).toMatch(/type === "AGORA_DIRECT" \|\| notificationCategory\(notification\) === "money"/);
    expect(worker).toContain('"CAPPED_IN_APP"');
    // en cas d'erreur de comptage on livre : jamais de perte silencieuse
    expect(worker).toContain('if (error) return false;');
  });

  it('every status written by the worker is accepted by the database constraint', () => {
    const written = [...worker.matchAll(/push_delivery_status: "([A-Z_]+)"/g)].map((m) => m[1]);
    for (const status of new Set(written)) expect(migration).toContain(`'${status}'::text`);
  });

  it('instant kick never blocks notification creation and never destroys data', () => {
    expect(migration).toContain('for each statement');
    expect(migration).toContain('exception when others then');
    expect(migration).not.toMatch(/\b(drop table|truncate|delete from)\b/i);
  });
});

describe('garde OTA liée au build iOS réussi', () => {
  it('waits for the iOS build of the same release and compares with the last successful build', () => {
    expect(otaWorkflow).toContain('actions: read');
    expect(otaWorkflow).toContain('auto-eas-build.yml/runs');
    expect(otaWorkflow).toContain('completed success');
    expect(otaWorkflow).not.toContain('baseline="$(git log -1 --format=%H -- packages/mobile/.eas-build-trigger');
  });
});
