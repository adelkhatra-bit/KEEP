import fs from 'fs';
import path from 'path';

describe('Referral session guard', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'referralService.ts'), 'utf8');

  it('requires a restored bearer session before calling keep_claim_referral', () => {
    const sessionGuard = source.indexOf("if (!session?.access_token || !session.user) return false;");
    const rpc = source.indexOf("supabase.rpc('keep_claim_referral'");
    expect(source).toContain('supabase.auth.getSession()');
    expect(sessionGuard).toBeGreaterThan(-1);
    expect(rpc).toBeGreaterThan(sessionGuard);
  });
});
