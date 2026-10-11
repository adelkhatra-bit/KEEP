const fs = require('fs');
const path = require('path');

function read(...parts: string[]) {
  return fs.readFileSync(path.join(...parts), 'utf8');
}

describe('profile account security contract', () => {
  const profile = read(__dirname, '..', 'ProfileSettingsMobileScreen.tsx');
  const panel = read(__dirname, '..', '..', 'components', 'AccountEmailPanel.tsx');
  const auth = read(__dirname, '..', '..', 'services', 'authService.ts');
  const accountEmail = read(__dirname, '..', '..', 'services', 'accountEmailService.ts');

  it('keeps account security directly in profile settings', () => {
    expect(profile).toContain("import AccountEmailPanel from '../components/AccountEmailPanel'");
    expect(profile).toContain('Compte & sécurité');
    expect(profile).toContain('<AccountEmailPanel');
  });

  it('lets the user change and confirm their email', () => {
    expect(panel).toContain('Changer l’adresse e-mail');
    expect(panel).toContain('Envoyer l’e-mail de validation');
    expect(panel).toContain('Valider le code');
    expect(accountEmail).toContain("action: 'request'");
    expect(accountEmail).toContain("action: 'confirm'");
  });

  it('lets the authenticated user change their password', () => {
    expect(panel).toContain('CHANGER LE MOT DE PASSE');
    expect(panel).toContain('passwordConfirm');
    expect(panel).toContain('updatePassword(password)');
    expect(auth).toContain('client.auth.updateUser({ password })');
  });

  it('tests the real password-recovery email without changing the password', () => {
    expect(panel).toContain('TESTER L’E-MAIL MOT DE PASSE OUBLIÉ');
    expect(panel).toContain('requestPasswordReset(status.email)');
    expect(panel).toContain('Aucun mot de passe ne change tant que tu n’utilises pas le lien reçu.');
    expect(auth).toContain("action: 'recovery'");
  });
});
