import fs from 'fs';
import path from 'path';
import { isValidNewPassword, MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT_MESSAGE } from '../../config/passwordPolicy';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Règle unique du mot de passe (8 caractères minimum partout)', () => {
  it('accepte 8 caractères et refuse 7', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(isValidNewPassword('1234567')).toBe(false);
    expect(isValidNewPassword('12345678')).toBe(true);
    expect(isValidNewPassword('x'.repeat(129))).toBe(false);
    expect(PASSWORD_TOO_SHORT_MESSAGE).toContain('8 caractères');
  });

  it('aucun écran ne code en dur une autre longueur de mot de passe', () => {
    for (const rel of [
      'src/components/UsernameAccountForm.tsx',
      'src/components/AccountEmailPanel.tsx',
      'src/components/AuthEmailLinkLifecycle.tsx',
      'src/services/authService.ts',
    ]) {
      const source = read(rel);
      expect(source).not.toMatch(/password\.length\s*<\s*\d+/);
      expect(source).toContain('passwordPolicy');
    }
  });

  it('la connexion d’un ancien compte n’est pas bloquée par le minimum de création', () => {
    const form = read('src/components/UsernameAccountForm.tsx');
    expect(form).toContain("mode === 'create' && !isValidNewPassword(password)");
  });

  it('le serveur keep-auth-email applique le même minimum à l’inscription', () => {
    const server = fs.readFileSync(path.resolve(root, '../../supabase/functions/keep-auth-email/index.ts'), 'utf8');
    expect(server).toContain('password.length < 8');
  });
});
