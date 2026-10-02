// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki FREE debit contract', () => {
  const client = read(__dirname, '..', 'keepTrackAction.ts');
  const core = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-music-core', 'index.ts');
  const atomic = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001211000_atomic_keep_credit_decision.sql');

  it('charges every new manual KEEP regardless of social/profile origin', () => {
    expect(client).toContain("const consumesCredit = !userState.isDemoMode && options?.consumeCredit !== false;");
    expect(client).not.toContain('&& !isSocialCopy &&');
    expect(core).toContain('if (decision === "KEPT") {');
    expect(core).toContain('scoped.rpc("keep_commit_paid_decision"');
  });

  it('deduplicates inside the atomic server transaction before any FREE debit', () => {
    const dedupe = atomic.indexOf('select * into v_existing');
    const duplicateReturn = atomic.indexOf("'deduplicated',true");
    // indexOf depuis duplicateReturn : on cherche l'appel du débit, pas la déclaration de la fonction en tête de migration.
    const debit = atomic.indexOf('keep_consume_download_credit_for_source', duplicateReturn);
    expect(dedupe).toBeGreaterThan(-1);
    expect(duplicateReturn).toBeGreaterThan(dedupe);
    expect(debit).toBeGreaterThan(duplicateReturn);
    expect(atomic).toContain("'charged',0");
  });

  it('keeps the product rule explicit: listen is free, manual KEEP is paid', () => {
    expect(client).toContain('écouter/reconnaître/PASS = 0 FREE');
    expect(client).toContain('Tout nouveau GARDER');
  });
});
