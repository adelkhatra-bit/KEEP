// Règle unique du mot de passe Loki Music (Adel, 25/10/2026) : 8 caractères minimum partout
// (création de compte, changement, lien de réinitialisation). Aucune autre valeur ne doit être codée en dur.
// La connexion n'applique PAS ce minimum : un compte existant créé avec l'ancienne règle (6) doit pouvoir se connecter.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const PASSWORD_TOO_SHORT_MESSAGE = `Choisis au moins ${MIN_PASSWORD_LENGTH} caractères.`;

export function isValidNewPassword(password: string): boolean {
  const length = String(password ?? '').length;
  return length >= MIN_PASSWORD_LENGTH && length <= MAX_PASSWORD_LENGTH;
}
