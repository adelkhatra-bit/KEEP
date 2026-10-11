// @ts-nocheck
import fs from 'fs';
import path from 'path';

const app = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');
const form = fs.readFileSync(path.resolve(__dirname, '..', 'UsernameAccountForm.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('auth reconnect resilience contract', () => {
  it('retries real profile hydration after a successful auth session even after bootstrap already settled', () => {
    expect(app).toContain('const scheduleProfileRetry = (session: KeepAuthSession)');
    expect(app).toContain('pendingProfileSession = session;');
    expect(app).not.toContain('pendingProfileSession = session;\n      setAuthReady(false);');
    expect(app).toContain('scheduleProfileRetry(session);');
    expect(app).toContain('profileRetryTimer');
  });

  it('never sends a valid auth session back to onboarding only because profile hydration is temporarily unavailable', () => {
    const authSection = app.slice(app.indexOf('const unsubscribeAuth = authService.onSessionChange'));
    expect(authSection).toContain('if (!session) {');
    expect(authSection).not.toContain('pendingProfileSession = session;\n      setAuthReady(false);');
    expect(authSection).toContain('scheduleProfileRetry');
  });

  it('keeps the login form open until the real account profile is hydrated', () => {
    expect(form).toContain('waitForHydratedAccount');
    expect(form).toContain('await finishAuthenticatedFlow(result.userId)');
    expect(form).toContain('profile_hydration_timeout');
  });

  it('preserves same-account history while isolating different accounts', () => {
    const finish = form.slice(form.indexOf('const finishAuthenticatedFlow'));
    expect(finish).toContain('SESSION_HISTORY_OWNER_KEY');
    expect(finish).toContain('switchingAccount');
    expect(finish).toContain('guestLoggingIntoExistingAccount');
    expect(finish).toContain('clearSessions()');
    expect(finish).toContain('clearStagedGuestMusic()');
  });
});
