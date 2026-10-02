// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Loki auth priority under backend load', () => {
  const client = read(__dirname, '..', 'supabaseClient.ts');
  const auth = read(__dirname, '..', 'authService.ts');
  const battle = read(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx');
  const parties = read(__dirname, '..', '..', 'screens', 'PartiesScreen.tsx');

  it('reserves the network lane for the complete login/bootstrap path', () => {
    expect(client).toContain("url.includes('/auth/v1/')");
    expect(client).toContain("url.includes('/functions/v1/keep-username-auth')");
    expect(client).toContain("url.includes('/functions/v1/keep-auth-email')");
    expect(client).toContain("url.includes('/functions/v1/keep-profile-bootstrap')");
    expect(client).toContain('if (keepAuthPriorityActive > 0) return;');
  });

  it('never leaves an explicit login request without a deadline', () => {
    expect(auth).toContain("client.functions.invoke('keep-username-auth'");
    expect(auth).toContain('9500');
    expect(auth).toContain('client.auth.signInWithPassword');
    expect(auth).toContain('3500');
    expect(auth).toContain('auth_temporarily_unavailable');
  });

  it('does not hammer Battle RPCs fast enough to starve auth', () => {
    expect(battle).toContain('setInterval(() => { void tick(); }, 5000)');
    expect(battle).not.toContain('setInterval(() => { void tick(); }, 650)');
    expect(parties.match(/setInterval\(poll, 8000\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(parties).not.toContain('setInterval(poll, 2000)');
  });
});
