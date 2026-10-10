import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8');

describe('Web companion QR contract', () => {
  const onboarding = read('..', '..', 'screens', 'onboarding', 'OnboardingScreen.tsx');
  const chatHost = read('..', '..', 'components', 'ChatDockHost.tsx');
  const pairing = read('..', '..', 'services', 'webPairingService.ts');
  const lifecycle = read('..', '..', 'components', 'WebPairingLifecycle.tsx');
  const account = read('..', '..', 'components', 'AccountActionsPanel.tsx');
  const edge = read('..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-web-pairing', 'index.ts');

  it('desktop onboarding is QR-only and never auto-enters guest mode', () => {
    // Seule exception (Adel 06/10/2026) : un lien partagé ouvre le profil en invité ; sans lien, le web reste QR uniquement.
    expect(onboarding).toContain("if (Platform.OS === 'web' && !isWebShareVisit()) return;");
    expect(onboarding).toContain("if (Platform.OS === 'web' && !isWebShareVisit()) {\n    return <WebCompanionPairingScreen />;");
  });

  it('uses one shared mobile/web runtime and a native deep link for approval', () => {
    expect(edge).toContain("keep://pair?pairing_id=");
    expect(pairing).toContain("approveDesktopPairing");
    expect(lifecycle).toContain("Linking.addEventListener('url'");
    expect(chatHost).toContain('<WebPairingLifecycle />');
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
    expect(lifecycle).toContain('createAuthService(client).signOut()');
  });
  it('un scan n\'approuve jamais seul : demande explicite Approuver / Annuler, refus = annulation serveur', () => {
    expect(lifecycle).toContain("'Connecter cet ordinateur ?'");
    expect(lifecycle).toContain("text: 'Oui, c’est moi'");
    expect(lifecycle).toContain("text: 'Non, ce n’est pas moi'");
    expect(lifecycle).toContain('mot de passe');
    expect(lifecycle).toContain('previewDesktopPairing');
    expect(lifecycle).toContain('cancelDesktopPairing');
    // L'appel d'approbation ne doit exister qu'a l'interieur de la decision explicite.
    expect(lifecycle).not.toMatch(/void approveDesktopPairing\(pendingApproval/);
    expect(pairing).toContain("action: 'cancel'");
    expect(edge).toContain('action === "cancel"');
    expect(edge).toContain('pairing_state_changed');
  });

  it('QR expiré : l\'ordinateur le verrouille jusqu\'au bouton Rafraîchir, le téléphone explique sans toucher à la session', () => {
    const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'components', f), 'utf8');
    const screen = read('WebCompanionPairingScreen.tsx');
    const lifecycle = read('WebPairingLifecycle.tsx');
    expect(screen).toContain('loki-web-qr-locked');
    expect(screen).toContain('RAFRAÎCHIR LE QR');
    expect(lifecycle).toContain('PairingUnusableError');
    expect(lifecycle).toContain('QR code expiré');
  });

  it('écran QR PC : défilable, QR adapté à la hauteur visible, plus de minHeight 100vh (texte coupé, 10/10/2026)', () => {
    const screen = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'WebCompanionPairingScreen.tsx'), 'utf8');
    expect(screen).toContain('<ScrollView');
    expect(screen).toContain('pairingQrSize(');
    expect(screen).not.toContain("minHeight: '100vh'");
    expect(screen).toContain('size={qrSize}');
  });

  it('le QR survit à un rechargement du PC : approbation jamais perdue (10/10/2026)', () => {
    const screen = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'WebCompanionPairingScreen.tsx'), 'utf8');
    const svc = fs.readFileSync(path.join(__dirname, '..', 'webPairingService.ts'), 'utf8');
    expect(screen).toContain('loadDesktopChallenge()');
    expect(screen).toContain('saveDesktopChallenge(next)');
    expect(screen).toContain('void create(false)');
    expect(svc).toContain('sessionStorage');
    expect(svc).not.toMatch(/refresh_token/);
  });
});
