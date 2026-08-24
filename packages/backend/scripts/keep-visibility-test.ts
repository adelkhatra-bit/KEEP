/**
 * Preuve réelle du toggle partager/masquer par morceau (demande explicite
 * d'Adel du 24/08/2026) + test de régression permanent pour le bug RLS
 * jumeau de social_links trouvé en le construisant (migration
 * 0022_keep_decisions_public_read.sql) : `keep_decisions_owner` bloquait
 * TOUTE lecture non-propriétaire, y compris `visibility='PUBLIC'` -- aucun
 * visiteur n'a jamais pu voir un seul morceau "découvert" sur AUCUN profil,
 * même public, avant ce correctif.
 *
 * Utilise le vrai endpoint que le toggle mobile appelle
 * (PATCH /api/social/me/keeps/:id/visibility) + 2 identités anonymes
 * réelles -- aucun mock. PASS/FAIL = observé en vrai (réponses HTTP réelles).
 *
 * Usage : npx ts-node scripts/keep-visibility-test.ts
 */
import 'dotenv/config';

const API_URL = process.env.KEEP_TEST_API_URL || 'http://localhost:3010';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

interface TestResult { name: string; pass: boolean; detail: string }
const results: TestResult[] = [];
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name} — ${detail}`);
}

async function freshIdentity(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error(`freshIdentity: pas de session (HTTP ${res.status})`);
  return json.access_token;
}

async function setProfile(token: string, patch: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/api/social/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`setProfile: HTTP ${res.status} -- ${await res.text()}`);
}

async function createKeep(token: string, title: string): Promise<{ id: string; visibility: string }> {
  const res = await fetch(`${API_URL}/api/social/me/keeps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, artist: 'Test Artist', decision: 'KEPT' }),
  });
  if (!res.ok) throw new Error(`createKeep: HTTP ${res.status} -- ${await res.text()}`);
  const json = (await res.json()) as { data: { id: string; visibility: string } };
  return json.data;
}

async function getProfileKeeps(token: string, username: string): Promise<{ status: number; titles: string[] }> {
  const res = await fetch(`${API_URL}/api/social/profiles/${username}/keeps`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { status: res.status, titles: [] };
  const json = (await res.json()) as { data: { tracks: { title: string } }[] };
  return { status: res.status, titles: json.data.map((k) => k.tracks.title) };
}

async function main() {
  console.log(`KEEP visibility toggle test -- cible ${API_URL}\n`);
  const suffix = Date.now().toString(36);

  const owner = await freshIdentity();
  const visitor = await freshIdentity();
  const usernameA = `keeptest-a-${suffix}`;
  await setProfile(owner, { username: usernameA, is_public: true });
  const keep = await createKeep(owner, `Visibility Test Track ${suffix}`);
  record('CREATE_KEEP_DEFAULT_PUBLIC', keep.visibility === 'PUBLIC', `visibility créée = ${keep.visibility}`);

  const before = await getProfileKeeps(visitor, usernameA);
  record('VISITOR_SEES_PUBLIC_KEEP', before.titles.length === 1, `visiteur voit ${before.titles.length} morceau(x) : ${JSON.stringify(before.titles)}`);

  const patchRes = await fetch(`${API_URL}/api/social/me/keeps/${keep.id}/visibility`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility: 'PRIVATE' }),
  });
  record('PATCH_VISIBILITY_PRIVATE', patchRes.status === 204, `HTTP ${patchRes.status}`);

  const after = await getProfileKeeps(visitor, usernameA);
  record('VISITOR_NO_LONGER_SEES_HIDDEN_KEEP', after.titles.length === 0, `visiteur voit ${after.titles.length} morceau(x) après masquage`);

  const ownerKeepsRes = await fetch(`${API_URL}/api/social/me/keeps`, { headers: { Authorization: `Bearer ${owner}` } });
  const ownerKeeps = (await ownerKeepsRes.json()) as { data: { id: string; visibility: string }[] };
  const stillInMyMusic = ownerKeeps.data.some((k) => k.id === keep.id && k.visibility === 'PRIVATE');
  record('OWNER_KEEPS_TRACK_IN_MES_MUSIQUES', stillInMyMusic, 'masquer ne retire jamais le morceau de Mes musiques, seule la visibilité change');

  // Défense en profondeur : profil PRIVATE avec un morceau PUBLIC reste totalement invisible.
  const privateOwner = await freshIdentity();
  const usernameC = `keeptest-c-${suffix}`;
  await setProfile(privateOwner, { username: usernameC, is_public: false });
  await createKeep(privateOwner, 'Private Profile Track');
  const privView = await getProfileKeeps(visitor, usernameC);
  record('PRIVATE_PROFILE_KEEPS_HIDDEN', privView.status === 404, `HTTP ${privView.status} (attendu 404, même si le morceau est visibility=PUBLIC)`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
}

main().catch((e) => {
  console.error('Échec fatal du test de visibilité KEEP:', e);
  process.exitCode = 1;
});
