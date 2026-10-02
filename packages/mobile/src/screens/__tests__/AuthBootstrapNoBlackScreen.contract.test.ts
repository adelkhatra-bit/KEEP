// @ts-nocheck
import fs from 'fs';
import path from 'path';

const app = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('auth bootstrap never-black-screen contract', () => {
  it('keeps authenticated content gated until the real Supabase profile is hydrated', () => {
    expect(app).toContain('if (active && hydrated) {');
    expect(app).toContain('setAuthReady(true);');
    expect(app).toContain('authReady ? (user ? <Navigation /> : <OnboardingScreen />)');
    expect(app).not.toContain('cachedWebRealUser()');
  });

  it('retries transient Supabase bootstrap failures instead of getting stuck forever', () => {
    expect(app).toContain('const scheduleBootstrapRetry = () => {');
    expect(app).toContain('Math.min(5000, 600 * (2 ** Math.min(bootstrapRetryAttempt, 3)))');
    expect(app).toContain('.catch(() => scheduleBootstrapRetry())');
    expect(app).toContain('if (!initialBootstrapSettled && !session) return;');
  });

  it('renders a visible recovery state rather than an empty black surface', () => {
    expect(app).toContain('testID="auth-bootstrap-recovery"');
    expect(app).toContain('Connexion à ton compte…');
    expect(app).toContain('<ActivityIndicator');
  });
});
