/**
 * Vérification exécutable réelle du gate Super Admin (src/lib/adminAuth.ts) :
 * faux TokenVerifier + faux AdminRoleChecker injectés, faux req/res Express
 * -- même convention que scripts/verify-keep-auth.ts.
 *
 * Usage: npx tsx packages/backend/scripts/verify-admin-auth.ts
 */
import { requireAdminRole, AdminAuthedRequest, AdminRole } from '../src/lib/adminAuth';
import { TokenVerifier } from '../src/lib/keepAuth';

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL ${label}`);
  }
}

function fakeReq(authHeader?: string): AdminAuthedRequest {
  return { headers: { authorization: authHeader } } as unknown as AdminAuthedRequest;
}
function fakeRes() {
  const res: any = { statusCode: 200, body: undefined, status(c: number) { res.statusCode = c; return res; }, json(p: unknown) { res.body = p; return res; } };
  return res;
}

const validTokenVerifier: TokenVerifier = { async verify(token) { return token === 'valid' ? { userId: 'user-1' } : null; } };

function roleCheckerReturning(role: AdminRole | null) {
  return { async checkAdminRole() { return role; } };
}

async function main() {
  // 1. Pas de token -> 401 (avant même de vérifier le rôle)
  {
    let nextCalled = false;
    const req = fakeReq(undefined);
    const res = fakeRes();
    await requireAdminRole(validTokenVerifier, roleCheckerReturning('SUPER_ADMIN'))(req, res, () => { nextCalled = true; });
    check('sans token -> 401', res.statusCode === 401);
    check('sans token -> next() jamais appelé', !nextCalled);
  }

  // 2. Token valide mais pas admin -> 403 not_admin
  {
    let nextCalled = false;
    const req = fakeReq('Bearer valid');
    const res = fakeRes();
    await requireAdminRole(validTokenVerifier, roleCheckerReturning(null))(req, res, () => { nextCalled = true; });
    check('session valide mais pas admin -> 403', res.statusCode === 403);
    check('403 -> erreur "not_admin" précise', res.body.error === 'not_admin');
    check('pas admin -> next() jamais appelé', !nextCalled);
  }

  // 3. Admin actif, aucun rôle restreint requis -> passe
  {
    let nextCalled = false;
    const req = fakeReq('Bearer valid');
    const res = fakeRes();
    await requireAdminRole(validTokenVerifier, roleCheckerReturning('SUPPORT'))(req, res, () => { nextCalled = true; });
    check('admin actif sans restriction de rôle -> next() appelé', nextCalled);
    check('req.adminRole renseigné', req.adminRole === 'SUPPORT');
  }

  // 4. Admin actif mais rôle insuffisant pour cette route -> 403 insufficient_role
  {
    let nextCalled = false;
    const req = fakeReq('Bearer valid');
    const res = fakeRes();
    await requireAdminRole(validTokenVerifier, roleCheckerReturning('SUPPORT'), ['SUPER_ADMIN', 'ADMIN'])(req, res, () => { nextCalled = true; });
    check('rôle SUPPORT sur route réservée SUPER_ADMIN/ADMIN -> 403', res.statusCode === 403);
    check('403 -> erreur "insufficient_role" précise', res.body.error === 'insufficient_role');
    check('rôle insuffisant -> next() jamais appelé', !nextCalled);
  }

  // 5. Admin avec rôle autorisé explicitement -> passe
  {
    let nextCalled = false;
    const req = fakeReq('Bearer valid');
    const res = fakeRes();
    await requireAdminRole(validTokenVerifier, roleCheckerReturning('SUPER_ADMIN'), ['SUPER_ADMIN', 'ADMIN'])(req, res, () => { nextCalled = true; });
    check('rôle SUPER_ADMIN sur route restreinte -> next() appelé', nextCalled);
  }

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
