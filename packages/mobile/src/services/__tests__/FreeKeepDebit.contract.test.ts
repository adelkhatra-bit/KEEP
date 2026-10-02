// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki FREE debit contract', () => {
  const action = read(__dirname, '..', 'keepTrackAction.ts');
  const publicProfile = read(__dirname, '..', '..', 'screens', 'PublicUserProfileScreen.tsx');
  const sessionStore = read(__dirname, '..', '..', 'store', 'useSessionStore.ts');
  const core = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-music-core', 'index.ts');
  const dailySpend = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001211000_free_spent_today_ledger_source.sql');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('charges every new manual KEEP, including a keep copied from another profile', () => {
    expect(core).toContain('if (decision === "KEPT") {');
    expect(core).toContain("scoped.rpc(\"keep_commit_paid_decision\"");
    expect(core).not.toContain('if (decision === "KEPT" && !socialSource)');
    expect(action).toContain("const consumesCredit = !userState.isDemoMode && options?.consumeCredit !== false;");
    expect(action).not.toContain('!isSocialCopy && options?.consumeCredit !== false');
  });

  it('uses the same commitKeep path for public-profile and listening-session keeps', () => {
    expect(publicProfile).toContain("source: 'public_profile'");
    expect(publicProfile).toContain("source: 'public_profile_swipe'");
    expect(publicProfile).toContain('await commitKeep(');
    expect(publicProfile).not.toContain('consumeCredit: false');
    expect(sessionStore).toContain('await commitKeep(');
  });

  it('keeps duplicate ownership idempotent and free', () => {
    expect(action).toContain('alreadyKept: true');
    expect(core).toContain("deduplicated: Boolean((committed as any).deduplicated)");
  });

  it('never reports a real KEEP as successful without server-confirmed debit + decision', () => {
    expect(action).toContain("throw new Error('KEEP_SERVER_NOT_CONFIRMED')");
    expect(action).toContain("throw new Error('KEEP_SERVER_NOT_CONFIRMED')");
    expect(action).not.toContain("if (e?.message === 'CREDITS_EXHAUSTED') throw e;\n    profileSyncFailed = true;");
  });

  it('counts daily FREE spend from the authoritative debit ledger with a 02:00 local boundary', () => {
    expect(dailySpend).toContain('from public.keep_free_spend_events e');
    expect(dailySpend).toContain("e.reason='KEEP_PROFILE'");
    expect(dailySpend).toContain("interval '2 hours'");
    expect(dailySpend).toContain('count(*)::integer');
  });

  it('locks the final product rule in the canonical contract', () => {
    expect(contract.creditRules.KEEP).toBe(-3);
    expect(contract.creditRules.keepAppliesToSources).toEqual(
      expect.arrayContaining(['listen', 'profile', 'public_profile_swipe', 'loki_pulse']),
    );
    expect(contract.creditRules.alreadyOwnedDuplicate).toBe(0);
    expect(contract.profileOwner.freeDetailsPanel.socialProfileKeepsAlsoDebit).toBe(true);
    expect(contract.profileOwner.freeDetailsPanel.alreadyOwnedDuplicateNeverDebits).toBe(true);
    expect(contract.profileOwner.freeDetailsPanel.dailySpendCountsAuthoritativeLedgerEvents).toBe(true);
  });
});
