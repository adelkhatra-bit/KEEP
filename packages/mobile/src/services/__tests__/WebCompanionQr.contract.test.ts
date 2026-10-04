import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8');

describe('Web companion QR contract', () => {
  const onboarding = read('..', '..', 'screens', 'onboarding', 'OnboardingScreen.tsx');
  const app = read('..', '..', '..', 'App.tsx');
  const pairing = read('..', '..', 'services', 'webPairingService.ts');
  const lifecycle = read('..', '..', 'components', 'WebPairingLifecycle.tsx');
  const account = read('..', '..', 'components', 'AccountActionsPanel.tsx');
  const edge = read('..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-web-pairing', 'index.ts');

  it('desktop onboarding is QR-only and never auto-enters guest mode', () => {
    expect(onboarding).toContain("if (Platform.OS === 'web') return;");
    expect(onboarding).toContain("return <WebCompanionPairingScreen />;");
  });

  it('uses one shared mobile/web runtime and a native deep link for approval', () => {
    expect(pairing).toContain("keep://pair?pairing_id=");
    expect(pairing).toContain("approveDesktopPairing");
    expect(lifecycle).toContain("Linking.addEventListener('url'");
    expect(app).toContain('<WebPairingLifecycle />');
  });

  it('stores no refresh token in the pairing backend and uses one-time magic-link auth', () => {
    expect(edge).toContain("type: \"magiclink\"");
    expect(edge).toContain("action_link");
    expect(edge).not.toContain("refresh_token");
    expect(edge).not.toContain("password");
  });

  it('supports remote desktop sign-out from account settings', () => {
    expect(account).toContain('<WebCompanionSessionsPanel />');
    expect(lifecycle).toContain('getWebCompanionSessionStatus');
    expect(lifecycle).toContain('createAuthService(supabase).signOut()');
  });
});
