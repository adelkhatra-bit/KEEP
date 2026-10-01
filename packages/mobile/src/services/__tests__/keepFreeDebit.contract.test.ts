// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki FREE debit contract', () => {
  const client = read(__dirname, '..', 'keepTrackAction.ts');
  const core = read(__dirname, '..', '..', '..', '..', 'supabase', 'functions', 'keep-music-core', 'index.ts');

  it('charges every new manual KEEP regardless of social/profile origin', () => {
    expect(client).toContain("const consumesCredit = !userState.isDemoMode && options?.consumeCredit !== false;");
    expect(client).not.toContain('&& !isSocialCopy &&');
    expect(core).toContain('if (decision === "KEPT") {');
    expect(core).not.toContain('if (decision === "KEPT" && !socialSource)');
  });

  it('deduplicates before the debit so an already-owned track remains free', () => {
    const dedupe = core.indexOf('const current = await existingKeptDecision(userId, trackId)');
    const debit = core.indexOf('const credit = await consumeKeepCredit(token)');
    expect(dedupe).toBeGreaterThan(-1);
    expect(debit).toBeGreaterThan(dedupe);
  });

  it('keeps the product rule explicit: listen is free, manual KEEP is paid', () => {
    expect(client).toContain('écouter/reconnaître/PASS = 0 FREE');
    expect(client).toContain('Tout nouveau GARDER');
  });
});
