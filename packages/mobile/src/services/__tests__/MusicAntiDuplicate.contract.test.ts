import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8');

describe('Loki anti-doublon music contract', () => {
  const sessionStore = read('..', '..', 'store', 'useSessionStore.ts');
  const keepAction = read('..', 'keepTrackAction.ts');
  const saleService = read('..', 'playlistSaleService.ts');
  const migration = read('..', '..', '..', '..', '..', 'supabase', 'migrations', '20261004030000_marketplace_no_duplicate_track_purchase.sql');

  it('deduplicates recognition against the complete active session', () => {
    expect(sessionStore).toContain('get().tracks.find((entry) => sameTrack(entry.track, track))');
    expect(sessionStore).not.toContain('const last = get().tracks[0];\n  if (last && sameTrack(last.track, track))');
  });

  it('keeps GARDER idempotent before any FREE debit', () => {
    const duplicateCheck = keepAction.indexOf('const existing = await checkOwnKeepLibrary(track)');
    const creditCheck = keepAction.indexOf('if (consumesCredit) await ensureDownloadCreditAvailable()');
    expect(duplicateCheck).toBeGreaterThan(-1);
    expect(creditCheck).toBeGreaterThan(duplicateCheck);
    expect(keepAction).toContain('alreadyKept: true');
    expect(keepAction).toContain("if (existing === null) throw new Error('KEEP_DUPLICATE_CHECK_UNAVAILABLE')");
  });

  it('prevents 3 FREE debit for an equivalent track from another provider', () => {
    const atomic = read('..', '..', '..', '..', '..', 'supabase', 'migrations', '20261011185000_keep_atomic_cross_provider_dedup.sql');
    const lock = atomic.indexOf('pg_advisory_xact_lock');
    const match = atomic.indexOf('keep_tracks_same_content(kd.track_id,p_track_id)');
    const debit = atomic.indexOf('keep_consume_download_credit_for_source');
    expect(lock).toBeGreaterThan(-1);
    expect(match).toBeGreaterThan(lock);
    expect(debit).toBeGreaterThan(match);
    expect(atomic).toContain("'charged',0");
    expect(atomic).toContain("'trackId',v_existing.track_id");
  });

  it('blocks marketplace payment when equivalent music is already owned', () => {
    expect(migration).toContain('keep_playlist_sale_assert_no_owned_tracks');
    expect(migration).toContain('keep_tracks_same_content');
    expect(migration).toContain('DUPLICATE_TRACK_PURCHASE_BLOCKED');
    expect(migration).toContain('before insert on public.playlist_sale_payments');
    expect(migration).toContain('before insert on public.playlist_sale_bundle_payment_items');
  });

  it('surfaces duplicate purchase counts to the shared Mobile/Web UI', () => {
    expect(saleService).toContain('DUPLICATE_TRACK_PURCHASE_BLOCKED');
    expect(saleService).toContain('marketplaceRpcError');
  });
});
