// @ts-nocheck
import fs from 'fs';
import path from 'path';

const app = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('auth bootstrap never-black-screen contract', () => {
  it('uses the local identity only as a transient outage fallback without treating it as a hydrated profile', () => {
    expect(app).toContain('if (active && hydrated) {');
    expect(app).toContain('setAuthReady(true);');
    expect(app).toContain('authReady ? (user ? <Navigation /> : <OnboardingScreen />)');
    expect(app).toContain('getCachedWebRealUserSnapshot()');
    expect(app).toContain('profileLoadedFor reste null');
    expect(app).toContain('if (!sameVisibleAccount) setAuthReady(false);');
  });

  it('retries transient Supabase bootstrap failures instead of getting stuck forever', () => {
    expect(app).toContain('const scheduleBootstrapRetry = () => {');
    expect(app).toContain('Math.min(5000, 600 * (2 ** Math.min(bootstrapRetryAttempt, 3)))');
    expect(app).toContain('.catch(() => scheduleBootstrapRetry())');
    expect(app).toContain('if (!initialBootstrapSettled && !session) return;');
    expect(app).toContain('degradedBootstrapTimer = setTimeout(() => {');
    expect(app).toContain('}, 3600);');
  });

  it('renders a visible recovery state rather than an empty black surface', () => {
    expect(app).toContain('testID="auth-bootstrap-recovery"');
    expect(app).toContain('Connexion à ton compte…');
    expect(app).toContain('<ActivityIndicator');
  });
});
