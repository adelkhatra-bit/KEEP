/**
 * Suite de tests E2E KEEP (demande explicite du 24/08/2026 -- "Crée aussi
 * une suite de tests KEEP automatique"). Réutilise EXACTEMENT les mêmes
 * appels que ceux joués manuellement pendant l'audit du 24/08/2026 (session
 * anonyme fraîche, endpoints réels, `/api/dev/qa-corpus` pour la
 * reconnaissance sans dépendre d'un vrai micro) -- rien d'inventé, ce sont
 * les preuves déjà obtenues, rendues rejouables.
 *
 * Couvre ce qui est réellement testable SANS compte admin/e-mail confirmé
 * (bloqué par le rate-limit Supabase + absence de ligne `admin_users`, voir
 * docs/KEEP_REGRESSION_TESTS.md) : reconnaissance -> titre/artiste,
 * quotas, plans, config, keeps (lecture), session invité.
 *
 * PASS/FAIL = observé en vrai (réponse HTTP réelle), jamais "le code
 * compile" -- même règle que CLAUDE.md.
 *
 * Usage : npx ts-node scripts/e2e-smoke-test.ts
 */
import 'dotenv/config';

const API_URL = process.env.KEEP_TEST_API_URL || 'http://localhost:3010';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name} — ${detail}`);
}

async function freshGuestToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error(`freshGuestToken: pas de access_token (HTTP ${res.status})`);
  return json.access_token;
}

async function testGuestSession() {
  try {
    const token = await freshGuestToken();
    record('GUEST_SESSION', !!token, 'session Supabase anonyme créée avec succès, token reçu');
  } catch (e: any) {
    record('GUEST_SESSION', false, e?.message ?? String(e));
  }
}

async function testRecognitionConfig() {
  try {
    const res = await fetch(`${API_URL}/api/billing/recognition-config`);
    const json = (await res.json()) as { data?: { guestSuccessLimit: number; signupBonusSuccesses: number } };
    // 3 + 4 = 7 (funnel révisé le 24/08/2026, cf. CLAUDE.md/KEEP_DECISIONS.md) -- était 3+3=6.
    const ok = res.ok && json.data?.guestSuccessLimit === 3 && json.data?.signupBonusSuccesses === 4;
    record('RECOGNITION_CONFIG', ok, `HTTP ${res.status} -> ${JSON.stringify(json.data)}`);
  } catch (e: any) {
    record('RECOGNITION_CONFIG', false, e?.message ?? String(e));
  }
}

async function testPlans() {
  try {
    const res = await fetch(`${API_URL}/api/billing/plans`);
    const json = (await res.json()) as { data?: { code: string }[] };
    const codes = (json.data ?? []).map((p) => p.code).sort();
    const expected = ['CREATOR_PRO', 'FREE', 'PREMIUM', 'VENUE_PRO'];
    const ok = res.ok && expected.every((c) => codes.includes(c));
    record('PLANS_CATALOG', ok, `HTTP ${res.status} -> plans=[${codes.join(',')}]`);
  } catch (e: any) {
    record('PLANS_CATALOG', false, e?.message ?? String(e));
  }
}

async function testKeepsRead(token: string) {
  try {
    const res = await fetch(`${API_URL}/api/social/me/keeps`, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { data?: unknown[] };
    const ok = res.ok && Array.isArray(json.data);
    record('KEEPS_READ', ok, `HTTP ${res.status} -> ${Array.isArray(json.data) ? json.data.length : '?'} entrée(s)`);
  } catch (e: any) {
    record('KEEPS_READ', false, e?.message ?? String(e));
  }
}

async function testRecognitionQaCorpus(token: string) {
  try {
    const wavRes = await fetch(`${API_URL}/api/dev/qa-corpus/track_desert_bells.wav`);
    if (!wavRes.ok) {
      record('RECOGNITION_E2E', false, `qa-corpus indisponible (HTTP ${wavRes.status}) -- endpoint DEV uniquement, normal en production`);
      return;
    }
    const wavBuf = Buffer.from(await wavRes.arrayBuffer());
    const res = await fetch(`${API_URL}/api/recognition/identify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav' },
      body: wavBuf,
    });
    const json = (await res.json()) as { status?: string; title?: string; artist?: string };
    const ok = res.ok && json.status === 'success' && json.title === 'Desert Bells';
    record('RECOGNITION_E2E', ok, `HTTP ${res.status} -> ${JSON.stringify(json)}`);
  } catch (e: any) {
    record('RECOGNITION_E2E', false, e?.message ?? String(e));
  }
}

async function main() {
  console.log(`KEEP E2E smoke test -- cible ${API_URL}\n`);
  await testGuestSession();
  await testRecognitionConfig();
  await testPlans();

  const token = await freshGuestToken();
  await testKeepsRead(token);
  await testRecognitionQaCorpus(token);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) {
    console.log('\nÉCHECS :');
    failed.forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('Échec fatal de la suite de tests:', e);
  process.exitCode = 1;
});
