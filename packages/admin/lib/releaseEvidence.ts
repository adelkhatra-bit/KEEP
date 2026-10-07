// Métier lecture seule : aucune identité/message de signalement dans un export public.
export const REPOSITORY = 'adelkhatra-bit/KEEP';
export const CANONICAL_BRANCH = 'reconcile/claude-main-20260825';
export const VERSION_URL = 'https://adelkhatra-bit.github.io/KEEP/version.json';
const REPO_URL = `https://github.com/${REPOSITORY}`;
export const LEDGER_URL = `${REPO_URL}/blob/${CANONICAL_BRANCH}/docs/ERROR_LEDGER.md`;

export type SiteVersion = { repository: string; branch: string; sha: string; builtAt: string };
export type FixEvidence = {
  id: string; screen: string | null; status: string; fixed_in_sha: string | null;
  regression_test_path: string | null; resolved_at: string | null;
};
export type ReportOverview = {
  open_count: number; fixed_count: number; documented_count: number; fixes_limit: number;
  latest_app: { app_version: string | null; build_sha: string | null; platform: string; created_at: string } | null;
  fixes: FixEvidence[];
};

export function validSha(value: unknown): value is string {
  return typeof value === 'string' && value.length === 40 && /^[a-f0-9]{40}$/i.test(value);
}
export function validTestPath(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && !value.includes('..') &&
    /^(packages\/([A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.test\.(ts|tsx|js|cjs)|scripts\/([A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.test\.cjs|scripts\/verify-[a-z0-9-]+\.cjs)$/.test(value);
}
export function commitLink(sha: unknown): string | null {
  return validSha(sha) ? `${REPO_URL}/commit/${sha.toLowerCase()}` : null;
}
export function testLink(sha: unknown, path: unknown): string | null {
  return validSha(sha) && validTestPath(path) ? `${REPO_URL}/blob/${sha.toLowerCase()}/${path}` : null;
}
export function parseSiteVersion(value: unknown): SiteVersion {
  const v = value as Partial<SiteVersion> | null;
  if (!v || v.repository !== REPOSITORY || v.branch !== CANONICAL_BRANCH ||
      !validSha(v.sha) || typeof v.builtAt !== 'string' || !Number.isFinite(Date.parse(v.builtAt))) {
    throw new Error('Provenance version.json invalide.');
  }
  return { repository: v.repository, branch: v.branch, sha: v.sha.toLowerCase(), builtAt: v.builtAt };
}
export async function readSiteVersion(): Promise<SiteVersion> {
  const response = await fetch(`${VERSION_URL}?observed=${Date.now()}`, {
    cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Version du site inaccessible (HTTP ${response.status}).`);
  return parseSiteVersion(await response.json());
}
export function parseOverview(value: unknown): ReportOverview {
  const v = value as ReportOverview | null;
  if (!v || !['open_count', 'fixed_count', 'documented_count'].every(key =>
    Number.isSafeInteger(v[key as keyof ReportOverview]) && Number(v[key as keyof ReportOverview]) >= 0) ||
    v.fixes_limit !== 100 || !Array.isArray(v.fixes) || v.fixes.length > 100 ||
    v.documented_count > v.fixed_count || v.fixes.length > v.fixed_count ||
    !v.fixes.every(f => f && typeof f.id === 'string' && typeof f.status === 'string' &&
      ['FIXED', 'NEEDS_UPDATE'].includes(f.status) &&
      (f.screen === null || typeof f.screen === 'string') &&
      (f.fixed_in_sha === null || typeof f.fixed_in_sha === 'string') &&
      (f.regression_test_path === null || typeof f.regression_test_path === 'string') &&
      (f.resolved_at === null || (typeof f.resolved_at === 'string' && Number.isFinite(Date.parse(f.resolved_at))))) ||
    (v.latest_app !== null && (!v.latest_app || !['ios', 'android'].includes(v.latest_app.platform) ||
      typeof v.latest_app.created_at !== 'string' || !Number.isFinite(Date.parse(v.latest_app.created_at)) ||
      ![v.latest_app.app_version, v.latest_app.build_sha].every(x => x === null || typeof x === 'string')))) {
    throw new Error('Rapport serveur invalide ; compteurs indisponibles.');
  }
  return v;
}
export function evidenceState(fix: FixEvidence, site: SiteVersion | null): string {
  if (!validSha(fix.fixed_in_sha) || !validTestPath(fix.regression_test_path)) return 'Preuve incomplète';
  if (site?.sha === fix.fixed_in_sha.toLowerCase()) return 'SHA du site · test à vérifier';
  return 'Documenté · livraison à vérifier';
}
