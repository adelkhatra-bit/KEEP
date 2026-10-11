// Règle pure (sans dépendance) : un compte peut-il utiliser stories + suggestions d'amis ? (Adel, 05/10/2026)
export function isStoryAccountEligible(user: { email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null; is_anonymous?: boolean } | null | undefined): boolean {
  if (!user) return false;
  if (user.is_anonymous) return false;
  if (!String(user.email ?? '').trim()) return false;
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

