// @ts-nocheck
import fs from 'fs';
import path from 'path';

const app = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');
const form = fs.readFileSync(path.resolve(__dirname, '..', 'UsernameAccountForm.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('auth reconnect resilience contract', () => {
  it('retries real profile hydration after a successful auth session even after bootstrap already settled', () => {
    expect(app).toContain('const scheduleProfileRetry = (session: KeepAuthSession)');
    expect(app).toContain('pendingProfileSession = session;');
    expect(app).toContain('setAuthReady(false);');
    expect(app).toContain('scheduleProfileRetry(session);');
    expect(app).toContain('profileRetryTimer');
  });

  it('never sends a valid auth session back to onboarding only because profile hydration is temporarily unavailable', () => {
    const authSection = app.slice(app.indexOf('const unsubscribeAuth = authService.onSessionChange'));
    expect(authSection).toContain('if (!session) {');
    expect(authSection).toContain('setAuthReady(false);');
    expect(authSection).toContain('scheduleProfileRetry');
  });

  it('does not erase session history on a normal successful login', () => {
    const finish = form.slice(form.indexOf('const finishAuthenticatedFlow'));
    expect(finish).not.toContain('clearSessions()');
    expect(finish).toContain('clearStagedGuestMusic()');
  });
});
