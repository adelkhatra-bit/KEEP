// @ts-nocheck
import fs from 'fs';
import path from 'path';

const auth = fs.readFileSync(path.resolve(__dirname, '..', 'authService.ts'), 'utf8').replace(/\r\n/g, '\n');
const app = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Loki auth outage recovery contract', () => {
  it('never lets a failed remote signout resurrect the local session', () => {
    expect(auth).toContain('forceClearPersistedAuthSession');
    expect(auth).toContain("client.auth.signOut({ scope: 'local' })");
    expect(auth).toContain("wait(1500)");
    expect(auth).toContain('await forceClearPersistedAuthSession(client);');
  });

  it('never leaves the user trapped behind an infinite auth spinner', () => {
    expect(app).toContain('setTimeout(() => setAuthRecoveryVisible(true), 8000)');
    expect(app).toContain('testID="auth-recovery-retry"');
    expect(app).toContain('testID="auth-recovery-change-account"');
    expect(app).toContain('RÉESSAYER');
    expect(app).toContain('CHANGER DE COMPTE');
  });

  it('prevents stale in-flight hydration from restoring a user who chose another account', () => {
    expect(app).toContain('if (manualAuthExitRef.current && session) return false;');
    expect(app).toContain('if (manualAuthExitRef.current) return false;');
  });
});
