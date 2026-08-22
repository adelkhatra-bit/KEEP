/**
 * Vérification exécutable réelle de authService.ts (pas un mock du SDK
 * Supabase entier -- un faux client minimal qui n'implémente que la
 * surface réellement appelée, avec un comportement observable).
 *
 * Usage: npx tsx packages/mobile/scripts/verify-auth-service.ts
 */
import { createAuthService, KeepAuthSession } from '../src/services/authService';

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

function makeFakeClient() {
  let session: { user: { id: string; email: string } } | null = null;
  let signOutCalled = false;
  let lastOtpEmail: string | null = null;
  let lastVerify: { email: string; token: string } | null = null;
  let otpShouldFail = false;
  let verifyShouldFail = false;
  const changeListeners: Array<(event: string, session: typeof session) => void> = [];

  return {
    client: {
      auth: {
        async signInWithOtp({ email }: { email: string; options?: unknown }) {
          lastOtpEmail = email;
          if (otpShouldFail) return { error: { message: 'invalid email' } };
          return { error: null };
        },
        async verifyOtp({ email, token }: { email: string; token: string; type: string }) {
          lastVerify = { email, token };
          if (verifyShouldFail) return { error: { message: 'invalid code' } };
          session = { user: { id: 'user-otp-verified', email } };
          changeListeners.forEach((cb) => cb('SIGNED_IN', session));
          return { error: null };
        },
        async getSession() {
          return { data: { session } };
        },
        async signOut() {
          signOutCalled = true;
          session = null;
          changeListeners.forEach((cb) => cb('SIGNED_OUT', null));
        },
        onAuthStateChange(cb: (event: string, session: typeof session) => void) {
          changeListeners.push(cb);
          return { data: { subscription: { unsubscribe: () => {
            const idx = changeListeners.indexOf(cb);
            if (idx >= 0) changeListeners.splice(idx, 1);
          } } } };
        },
      },
    },
    setSession: (s: typeof session) => { session = s; changeListeners.forEach((cb) => cb('SIGNED_IN', s)); },
    setOtpShouldFail: (v: boolean) => { otpShouldFail = v; },
    setVerifyShouldFail: (v: boolean) => { verifyShouldFail = v; },
    getLastOtpEmail: () => lastOtpEmail,
    getLastVerify: () => lastVerify,
    wasSignOutCalled: () => signOutCalled,
  };
}

async function main() {
  // 1. requestEmailCode -- succès
  {
    const fake = makeFakeClient();
    const service = createAuthService(fake.client as any);
    const { error } = await service.requestEmailCode('adel@example.com');
    check('requestEmailCode succès -> error=null', error === null);
    check('requestEmailCode transmet le bon e-mail au client', fake.getLastOtpEmail() === 'adel@example.com');
  }

  // 2. requestEmailCode -- échec propagé (pas un succès inventé)
  {
    const fake = makeFakeClient();
    fake.setOtpShouldFail(true);
    const service = createAuthService(fake.client as any);
    const { error } = await service.requestEmailCode('bad');
    check('requestEmailCode échec -> message d’erreur propagé (pas null)', error === 'invalid email');
  }

  // 2b. verifyEmailCode -- code correct ouvre une session
  {
    const fake = makeFakeClient();
    const service = createAuthService(fake.client as any);
    const { error } = await service.verifyEmailCode('adel@example.com', '123456');
    check('verifyEmailCode code correct -> error=null', error === null);
    check('verifyEmailCode transmet email+code au client', JSON.stringify(fake.getLastVerify()) === JSON.stringify({ email: 'adel@example.com', token: '123456' }));
    const session = await service.getCurrentSession();
    check('verifyEmailCode réussi -> session ouverte ensuite', session?.email === 'adel@example.com');
  }

  // 2c. verifyEmailCode -- code incorrect n'ouvre PAS de session
  {
    const fake = makeFakeClient();
    fake.setVerifyShouldFail(true);
    const service = createAuthService(fake.client as any);
    const { error } = await service.verifyEmailCode('adel@example.com', '000000');
    check('verifyEmailCode code incorrect -> erreur propagée', error === 'invalid code');
    const session = await service.getCurrentSession();
    check('verifyEmailCode code incorrect -> aucune session ouverte (pas de faux succès)', session === null);
  }

  // 3. getCurrentSession -- aucune session -> null
  {
    const fake = makeFakeClient();
    const service = createAuthService(fake.client as any);
    const session = await service.getCurrentSession();
    check('getCurrentSession sans session -> null', session === null);
  }

  // 4. getCurrentSession -- session active -> userId/email corrects
  {
    const fake = makeFakeClient();
    fake.setSession({ user: { id: 'user-42', email: 'adel@example.com' } });
    const service = createAuthService(fake.client as any);
    const session = await service.getCurrentSession();
    check('getCurrentSession avec session -> userId correct', session?.userId === 'user-42');
    check('getCurrentSession avec session -> email correct', session?.email === 'adel@example.com');
  }

  // 5. onSessionChange -- notifié à la connexion et à la déconnexion
  {
    const fake = makeFakeClient();
    const service = createAuthService(fake.client as any);
    const events: (KeepAuthSession | null)[] = [];
    const unsubscribe = service.onSessionChange((s) => events.push(s));

    fake.setSession({ user: { id: 'user-7', email: 'x@y.com' } });
    check('onSessionChange notifié à la connexion', events.length === 1 && events[0]?.userId === 'user-7');

    await service.signOut();
    check('signOut() appelle bien le client sous-jacent', fake.wasSignOutCalled());
    check('onSessionChange notifié à la déconnexion (session=null)', events.length === 2 && events[1] === null);

    unsubscribe();
    fake.setSession({ user: { id: 'user-99', email: 'z@z.com' } });
    check('unsubscribe() arrête bien les notifications', events.length === 2);
  }

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
