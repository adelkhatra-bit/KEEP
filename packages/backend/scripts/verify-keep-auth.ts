/**
 * Vérification exécutable réelle du middleware d'auth KEEP
 * (src/lib/keepAuth.ts) : exécute le middleware avec de faux req/res
 * Express et un TokenVerifier injecté (pas de mock du framework, juste des
 * objets minimalistes qui implémentent la forme utilisée par le
 * middleware) -- preuve réelle du comportement, pas une supposition.
 *
 * Usage: npx tsx packages/backend/scripts/verify-keep-auth.ts
 */
import { requireKeepAuth, KeepAuthedRequest, TokenVerifier } from '../src/lib/keepAuth';

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

function fakeReq(authHeader?: string): KeepAuthedRequest {
  return { headers: { authorization: authHeader } } as unknown as KeepAuthedRequest;
}

function fakeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function main() {
  const acceptingVerifier: TokenVerifier = { async verify(token) { return token === 'valid-token' ? { userId: 'user-1' } : null; } };
  const alwaysRejectingVerifier: TokenVerifier = { async verify() { return null; } };

  // 1. Pas d'en-tête Authorization -> 401, next() jamais appelé.
  {
    let nextCalled = false;
    const req = fakeReq(undefined);
    const res = fakeRes();
    await requireKeepAuth(acceptingVerifier)(req, res, () => { nextCalled = true; });
    check('sans en-tête Authorization -> 401', res.statusCode === 401);
    check('sans en-tête Authorization -> next() jamais appelé', !nextCalled);
  }

  // 2. En-tête mal formé (pas de préfixe "Bearer ") -> 401.
  {
    let nextCalled = false;
    const req = fakeReq('valid-token'); // sans "Bearer "
    const res = fakeRes();
    await requireKeepAuth(acceptingVerifier)(req, res, () => { nextCalled = true; });
    check('en-tête sans préfixe Bearer -> 401', res.statusCode === 401);
    check('en-tête sans préfixe Bearer -> next() jamais appelé', !nextCalled);
  }

  // 3. Token présent mais rejeté par le verifier (invalide/expiré) -> 401.
  {
    let nextCalled = false;
    const req = fakeReq('Bearer un-token-quelconque');
    const res = fakeRes();
    await requireKeepAuth(alwaysRejectingVerifier)(req, res, () => { nextCalled = true; });
    check('token rejeté par le verifier -> 401', res.statusCode === 401);
    check('token rejeté par le verifier -> next() jamais appelé', !nextCalled);
  }

  // 4. Token valide -> next() appelé, req.keepUserId renseigné avec le vrai userId.
  {
    let nextCalled = false;
    const req = fakeReq('Bearer valid-token');
    const res = fakeRes();
    await requireKeepAuth(acceptingVerifier)(req, res, () => { nextCalled = true; });
    check('token valide -> next() appelé', nextCalled);
    check('token valide -> res.status jamais appelé (pas de rejet)', res.statusCode === 200);
    check('token valide -> req.keepUserId = userId renvoyé par le verifier', req.keepUserId === 'user-1');
  }

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
