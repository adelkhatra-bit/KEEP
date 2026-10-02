// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8').replace(/\r\n/g, '\n');
const auth = read('services/authService.ts');
const app = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');
const form = read('components/UsernameAccountForm.tsx');
const profile = read('services/profileService.ts');
const dock = read('components/GlobalChatDock.tsx');
const mascot = read('components/LokiMascotVoice.tsx');

describe('Loki resilient auth and fast profile hydration contract', () => {
  it('retries only transient Supabase auth failures', () => {
    expect(auth).toContain('retryTransient');
    expect(auth).toContain('auth_temporarily_unavailable');
    expect(auth).toContain('signInWithPassword');
  });

  it('never closes login before the real profile is hydrated', () => {
    expect(form).toContain('waitForHydratedAccount');
    expect(form).toContain('profile_hydration_timeout');
    // e5640384 / e2ce13c5 : l'historique local n'est effacé qu'en cas de changement de compte
    // (ou invité -> compte existant), jamais lors d'une simple reconnexion au même compte.
    expect(form).toContain('if (switchingAccount || guestLoggingIntoExistingAccount) {');
  });

  it('retries profile hydration even after initial bootstrap already settled', () => {
    expect(app).toContain('scheduleProfileRetry');
    expect(app).toContain('pendingProfileSession = session');
    expect(app).toContain('setAuthReady(false)');
  });

  it('mounts from the real core profile, then hydrates extras asynchronously', () => {
    expect(profile).toContain('loadOwnProfileExtras');
    expect(app).toContain('profileService.loadOwnProfileExtras(session)');
    expect(app).toContain('applyingRemoteProfile');
  });

  it('contains no stale expo-speech runtime import', () => {
    expect(dock).not.toContain("import('expo-speech')");
    expect(mascot).not.toContain("import('expo-speech')");
  });
});
