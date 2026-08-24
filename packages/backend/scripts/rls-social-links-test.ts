/**
 * Preuve réelle du bug RLS `social_links` + test de régression permanent
 * (demande explicite d'Adel du 24/08/2026 -- "prouve le comportement actuel
 * avec deux utilisateurs/profils de test" avant toute correction).
 *
 * Utilise 2 identités Supabase anonymes fraîches (même mécanisme que
 * `e2e-smoke-test.ts`) + de vraies requêtes HTTP contre le backend réel --
 * aucun mock. Couvre 3 profils :
 *   A = profil PUBLIC, avec 1 réseau PUBLIC + 1 réseau PRIVATE
 *   B = visiteur (juste un token, pas de profil nécessaire)
 *   C = profil PRIVATE, avec 1 réseau PUBLIC (cas limite : le lien est public,
 *       mais le profil qui le porte ne l'est pas)
 *
 * PASS/FAIL = observé en vrai (réponse HTTP réelle + lecture directe de la
 * table `social_links` via le client Supabase avec le token de B, pour
 * prouver la policy RLS elle-même, pas seulement le comportement de la route).
 *
 * Usage : npx ts-node scripts/rls-social-links-test.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const API_URL = process.env.KEEP_TEST_API_URL || 'http://localhost:3010';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

interface TestResult { name: string; pass: boolean; detail: string }
const results: TestResult[] = [];
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name} — ${detail}`);
}

async function freshIdentity(): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const json = (await res.json()) as { access_token?: string; user?: { id?: string } };
  if (!json.access_token || !json.user?.id) throw new Error(`freshIdentity: pas de session (HTTP ${res.status})`);
  return { token: json.access_token, userId: json.user.id };
}

async function setProfile(token: string, patch: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/api/social/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`setProfile(${JSON.stringify(patch)}): HTTP ${res.status} -- ${await res.text()}`);
}

async function setSocialLinks(token: string, links: { platform: string; url: string; visibility: 'PUBLIC' | 'PRIVATE' }[]) {
  const res = await fetch(`${API_URL}/api/social/me/social-links`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ links }),
  });
  if (!res.ok) throw new Error(`setSocialLinks: HTTP ${res.status} -- ${await res.text()}`);
}

async function getProfileAs(token: string, username: string) {
  const res = await fetch(`${API_URL}/api/social/profiles/${username}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, json: res.ok ? ((await res.json()) as any).data : null };
}

async function main() {
  console.log(`KEEP RLS social_links test -- cible ${API_URL}\n`);

  const suffix = Date.now().toString(36);
  const usernameA = `rlstest-a-${suffix}`;
  const usernameC = `rlstest-c-${suffix}`;

  const a = await freshIdentity();
  const b = await freshIdentity(); // visiteur, aucun profil nécessaire
  const c = await freshIdentity();

  // A = profil PUBLIC avec 1 lien PUBLIC + 1 lien PRIVATE
  await setProfile(a.token, { username: usernameA, is_public: true });
  await setSocialLinks(a.token, [
    { platform: 'instagram', url: 'https://instagram.com/rlstest', visibility: 'PUBLIC' },
    { platform: 'website', url: 'https://rlstest-private.example', visibility: 'PRIVATE' },
  ]);

  // C = profil PRIVATE avec 1 lien PUBLIC (cas limite)
  await setProfile(c.token, { username: usernameC, is_public: false });
  await setSocialLinks(c.token, [{ platform: 'tiktok', url: 'https://tiktok.com/@rlstest', visibility: 'PUBLIC' }]);

  // --- Baseline : le propriétaire voit TOUJOURS ses deux liens ---
  const ownView = await getProfileAs(a.token, usernameA);
  const ownerSeesBoth = ownView.status === 200 && ownView.json?.socialLinks?.length === 2;
  record('OWNER_SEES_OWN_LINKS', ownerSeesBoth, `HTTP ${ownView.status} -> ${JSON.stringify(ownView.json?.socialLinks)}`);

  // --- Le bug tel que rapporté : B (visiteur) sur le profil PUBLIC de A ---
  const visitorView = await getProfileAs(b.token, usernameA);
  const links = visitorView.json?.socialLinks ?? [];
  const seesPublic = links.some((l: any) => l.platform === 'instagram' && l.visibility === 'PUBLIC');
  const seesPrivate = links.some((l: any) => l.platform === 'website');

  record(
    'SOCIAL_LINKS_BUG_BEFORE_FIX (attendu FAIL avant migration 0021, PASS après)',
    seesPublic,
    `HTTP ${visitorView.status} -> visiteur voit ${links.length} lien(s) sur profil PUBLIC de A : ${JSON.stringify(links)}`
  );
  record('PUBLIC_PROFILE_SOCIAL_LINKS', seesPublic, seesPublic ? 'le lien PUBLIC de A est visible pour B' : 'le lien PUBLIC de A reste invisible pour B (bug RLS)');
  record('PRIVATE_LINK_NEVER_LEAKS_TO_VISITOR', !seesPrivate, !seesPrivate ? 'le lien PRIVATE de A reste invisible pour B' : 'FUITE -- B voit un lien PRIVATE de A');

  // --- Cas limite : profil PRIVATE de C, même si un de ses liens est PUBLIC ---
  const privateProfileView = await getProfileAs(b.token, usernameC);
  const profileItselfHidden = privateProfileView.status === 404;
  record('PRIVATE_PROFILE_HIDDEN_VIA_ROUTE', profileItselfHidden, `HTTP ${privateProfileView.status} (attendu 404 -- profiles_select_own_or_public)`);

  // Preuve au niveau RLS lui-même (pas seulement la route qui 404 avant
  // d'atteindre fetchSocialLinks) : B lit directement la table social_links
  // de C avec son propre token.
  const bClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${b.token}` } },
    auth: { persistSession: false },
  });
  const { data: directRead } = await bClient.from('social_links').select('platform, visibility').eq('profile_id', c.userId);
  const rlsBlocksPrivateProfileLink = !directRead || directRead.length === 0;
  record(
    'PRIVATE_PROFILE_SOCIAL_LINKS_PROTECTED (lecture RLS directe)',
    rlsBlocksPrivateProfileLink,
    `lecture directe table social_links pour le profil PRIVATE de C -> ${JSON.stringify(directRead)} (attendu : vide, même si le lien est visibility=PUBLIC)`
  );

  const crossUserPrivacy = !seesPrivate && rlsBlocksPrivateProfileLink;
  record('CROSS_USER_PRIVACY', crossUserPrivacy, crossUserPrivacy ? 'aucune fuite détectée dans les 2 scénarios' : 'FUITE détectée -- voir détails ci-dessus');

  // --- Écriture : la nouvelle policy est SELECT uniquement, INSERT/UPDATE/DELETE
  // doivent rester bloqués pour quiconque n'est pas le propriétaire (social_links_owner, inchangée) ---
  const insertAttempt = await bClient.from('social_links').insert({ profile_id: a.userId, platform: 'hijack', url: 'https://evil.example', visibility: 'PUBLIC' });
  const insertBlocked = !!insertAttempt.error;
  record('OWNER_WRITE_ACCESS -- INSERT bloqué pour non-propriétaire', insertBlocked, insertBlocked ? `rejeté : ${insertAttempt.error!.message}` : 'FAILLE -- B a pu insérer un lien sur le profil de A');

  const updateAttempt = await bClient.from('social_links').update({ url: 'https://hijacked.example' }).eq('profile_id', a.userId).eq('platform', 'instagram');
  const { data: afterUpdate } = await bClient.from('social_links').select('url').eq('profile_id', a.userId).eq('platform', 'instagram');
  const updateBlocked = !updateAttempt.error ? (afterUpdate?.[0]?.url === 'https://instagram.com/rlstest') : true;
  record('OWNER_WRITE_ACCESS -- UPDATE bloqué pour non-propriétaire', updateBlocked, updateBlocked ? 'le lien PUBLIC de A est resté inchangé' : `FAILLE -- URL modifiée par B : ${JSON.stringify(afterUpdate)}`);

  const deleteAttempt = await bClient.from('social_links').delete().eq('profile_id', a.userId).eq('platform', 'instagram');
  const { data: afterDelete } = await bClient.from('social_links').select('platform').eq('profile_id', a.userId).eq('platform', 'instagram');
  const deleteBlocked = (afterDelete?.length ?? 0) === 1;
  record('OWNER_WRITE_ACCESS -- DELETE bloqué pour non-propriétaire', deleteBlocked, deleteBlocked ? 'le lien PUBLIC de A existe toujours' : `FAILLE -- lien supprimé par B : ${JSON.stringify(deleteAttempt.error)}`);

  const ownerWriteAccess = insertBlocked && updateBlocked && deleteBlocked;
  record('OWNER_WRITE_ACCESS', ownerWriteAccess, ownerWriteAccess ? 'INSERT/UPDATE/DELETE restent réservés au propriétaire' : 'FAILLE -- écriture non-propriétaire possible, voir détails ci-dessus');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  console.log(`\n(comptes de test laissés en base, comportement identique à e2e-smoke-test.ts -- identités anonymes sans PII : ${usernameA}, ${usernameC})`);
}

main().catch((e) => {
  console.error('Échec fatal du test RLS social_links:', e);
  process.exitCode = 1;
});
