// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Loki account recovery contracts', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const usernameForm = fs.readFileSync(path.join(repoRoot, 'packages/mobile/src/components/UsernameAccountForm.tsx'), 'utf8');
  const accountGateModal = fs.readFileSync(path.join(repoRoot, 'packages/mobile/src/components/AccountGateModal.tsx'), 'utf8');
  const accountEmailPanel = fs.readFileSync(path.join(repoRoot, 'packages/mobile/src/components/AccountEmailPanel.tsx'), 'utf8');
  const profileSettings = fs.readFileSync(path.join(repoRoot, 'packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx'), 'utf8');
  const accountEmailFn = fs.readFileSync(path.join(repoRoot, 'supabase/functions/keep-account-email/index.ts'), 'utf8');
  const authEmailFn = fs.readFileSync(path.join(repoRoot, 'supabase/functions/keep-auth-email/index.ts'), 'utf8');

  it('centre les formulaires compte sur iPhone et laisse le clavier remonter le contenu', () => {
    expect(usernameForm).toContain('automaticallyAdjustKeyboardInsets');
    expect(usernameForm).toContain("mode === 'login' ? s.centeredContainer : null");
    expect(accountGateModal).toContain('KeyboardAvoidingView');
    expect(accountGateModal).toContain("justifyContent: 'center'");
    expect(profileSettings).toContain('modalKeyboardWrap');
  });

  it('garde le panneau e-mail défilable quand le clavier est ouvert', () => {
    expect(accountEmailPanel).toContain('automaticallyAdjustKeyboardInsets');
    expect(accountEmailPanel).toContain('keyboardShouldPersistTaps="handled"');
    expect(accountEmailPanel).toContain('Connexion possible avec {username}');
  });

  it('essaie Brevo puis Mailjet pour les e-mails compte et récupération', () => {
    expect(accountEmailFn).toContain('sendMailjetCode');
    expect(accountEmailFn).toContain('await sendBrevoCode');
    expect(accountEmailFn).toContain('await sendMailjetCode');
    expect(authEmailFn).toContain('const brevo = await sendBrevo');
    expect(authEmailFn).toContain('const mailjet = await sendMailjet');
  });
});
