/**
 * Vérification exécutable réelle de withRetry (services/keepTrackAction.ts) :
 * fonctions qui échouent réellement N fois avant de réussir (ou jamais),
 * pas un mock -- preuve réelle du comportement retry.
 *
 * Usage: npx tsx packages/mobile/scripts/verify-retry.ts
 */
import { withRetry } from '../src/services/retry';

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

function flakyFn(failuresBeforeSuccess: number) {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls <= failuresBeforeSuccess) throw new Error(`échec transitoire #${calls}`);
    return 'ok';
  };
  return { fn, getCalls: () => calls };
}

async function main() {
  // 1. Réussit du premier coup -- pas de retry inutile.
  {
    const { fn, getCalls } = flakyFn(0);
    const result = await withRetry(fn);
    check('succès immédiat -> résultat correct', result === 'ok');
    check('succès immédiat -> un seul appel (pas de retry inutile)', getCalls() === 1);
  }

  // 2. Échoue 2 fois puis réussit -- withRetry doit persister et réussir.
  {
    const { fn, getCalls } = flakyFn(2);
    const start = Date.now();
    const result = await withRetry(fn);
    const elapsed = Date.now() - start;
    check('échoue 2x puis réussit -> résultat correct malgré les échecs', result === 'ok');
    check('échoue 2x puis réussit -> exactement 3 appels', getCalls() === 3);
    check('un vrai délai a été observé entre les tentatives (pas instantané)', elapsed >= 500 * 2 - 50);
  }

  // 3. Échoue toujours -- withRetry doit finir par abandonner et relancer l'erreur réelle.
  {
    const { fn, getCalls } = flakyFn(999);
    let thrown: Error | null = null;
    try {
      await withRetry(fn);
    } catch (e) {
      thrown = e as Error;
    }
    check('échec permanent -> l’erreur réelle est relancée (pas un succès inventé)', thrown?.message === 'échec transitoire #4');
    check('échec permanent -> exactement 4 tentatives (1 + 3 retries) puis abandon', getCalls() === 4);
  }

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
