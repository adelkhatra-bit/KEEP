import fs from 'fs';
import path from 'path';
const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Loki QR : les découvertes PC/iPhone se synchronisent', () => {
  it('la migration protège chaque session par le compte', () => {
    const sql = read('supabase/migrations/20261010201458_keep_cross_device_session_snapshots_private.sql');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('keep_sync_device_session');
    expect(sql).toContain('WHERE public.keep_device_sessions.deleted_at IS NULL');
  });
  it('chaque session micro ou import social reçoit un propriétaire réel', () => {
    const sync = read('packages/mobile/src/services/sessionCloudSyncService.ts');
    const listen = read('packages/mobile/src/store/useSessionStore.ts');
    const external = read('packages/mobile/src/services/externalRecognitionIngest.ts');
    expect(sync).toContain('s.ownerUserId === userId');
    expect(sync).toContain('client.auth.getSession()');
    expect(sync).toContain(".from('keep_device_sessions')");
    expect(sync).toContain("client.rpc('keep_sync_device_session'");
    expect(listen).toContain('ownerUserId: identity.user');
    expect(external).toContain('ownerUserId: identity.user');
  });
  it('le pont vit sur téléphone et web, jamais de suppression sur panne', () => {
    const life = read('packages/mobile/src/components/WebPairingLifecycle.tsx');
    const sync = read('packages/mobile/src/services/sessionCloudSyncService.ts');
    expect(life).toContain('return startCrossDeviceSessionSync(user.id);');
    expect(sync).toContain('!useSessionHistoryStore.persist.hasHydrated()');
    expect(sync).toContain('const PULL_EVERY_MS = 12000');
    expect(sync).toContain('tombstones');
    expect(sync).not.toContain('clearSessions()');
  });
});
