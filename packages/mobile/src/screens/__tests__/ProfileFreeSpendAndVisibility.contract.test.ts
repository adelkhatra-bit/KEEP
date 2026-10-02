// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('profile FREE daily spend + visibility protection', () => {
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const music = read(__dirname, '..', 'MyMusicScreen.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));
  const spendMigration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001222500_profile_daily_free_spend.sql');
  const privacyMigration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001221000_protect_active_sale_tracks_from_bulk_public.sql');

  it('keeps the FREE balance in the metrics bar but replaces the duplicate expanded balance with daily spend', () => {
    expect(profile).toContain('s.topMetricFreeItemValue');
    expect(profile).toContain('freeSpentToday');
    expect(profile).toContain('dépensés aujourd’hui');
    expect(profile).toContain('freeSpentKeepCount');
    expect(profile).toContain('journée 02:00 → 01:59');
    expect(contract.profileOwner.freeDetailsPanel.availableBalanceMustNotRepeatInExpandedPanel).toBe(true);
  });

  it('tracks actual positive download-credit debits and exposes the 02:00 daily RPC', () => {
    expect(spendMigration).toContain('trg_keep_log_download_credit_spend');
    expect(spendMigration).toContain('keep_free_spent_today');
    expect(spendMigration).toContain("interval '2 hours'");
    expect(spendMigration).toContain("amount integer not null check (amount > 0)");
  });

  it('opens a clear visibility popup and keeps active sale tracks protected from TOUT PUBLIC', () => {
    expect(music).toContain('visibilityIntroOpen');
    expect(music).toContain('GÉRER MA VISIBILITÉ');
    expect(music).toContain('COLLECTION EN VENTE');
    expect(music).toContain('TOUT PUBLIC');
    expect(privacyMigration).toContain("pso.is_active=true");
    expect(privacyMigration).toContain("p_visibility='PUBLIC'");
    expect(contract.marketplacePurchases.bulkPublicMustNeverExposeActiveSaleTracks).toBe(true);
  });
});
