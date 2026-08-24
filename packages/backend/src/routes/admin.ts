import { Router, Response } from 'express';
import { requireAdminRole, AdminAuthedRequest, AdminRole } from '../lib/adminAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import { getSupabaseAdminClient, createSupabaseAdminRoleChecker } from '../lib/supabaseAdmin';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { supabaseUserClient } from '../lib/supabaseUserClient';

/**
 * Routes Plans/Prix/Entitlements/Quotas/Utilisateurs/Grant réécrites le
 * 24/08/2026 pour utiliser le jeton de l'ADMIN LUI-MÊME + RLS (is_admin(),
 * voir migrations 0014/0019) au lieu de `adminClient` (service_role) --
 * MÊME cause déjà trouvée pour la page Utilisateurs (SUPABASE_SERVICE_ROLE_KEY
 * toujours un placeholder non-null, donc CONFIGURED=true à tort et chaque
 * requête service_role échoue silencieusement en 401). Le reste de ce
 * fichier (feature-flags/remote-config/promotions/operating-costs/
 * analytics/recognition-stats) reste sur l'ancien chemin service_role,
 * hors périmètre de cette passe -- pas touché.
 */
const keepTokenVerifier = createSupabaseTokenVerifier();
const requireAdminRLS = requireKeepAuth(keepTokenVerifier!);

async function isRequestingUserAdmin(req: KeepAuthedRequest): Promise<boolean> {
  const client = supabaseUserClient(req.keepAccessToken!);
  const { data } = await client.rpc('is_admin', { check_uid: req.keepUserId });
  return data === true;
}

async function logAdminAction(
  req: KeepAuthedRequest,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown
) {
  const client = supabaseUserClient(req.keepAccessToken!);
  await client.rpc('log_admin_action', {
    p_action: action, p_target_type: targetType, p_target_id: targetId, p_before: before, p_after: after,
  });
}

/**
 * API Super Admin réelle -- prix, plans, quotas, entitlements par plan,
 * promotions, coûts, feature flags, remote_config (durée de silence de
 * session incluse), utilisateurs, analytics. Toute mutation passe par le
 * service role (RLS bypass volontaire, voir supabase/migrations/0008) et
 * écrit une ligne `audit_logs` -- jamais d'écriture silencieuse.
 *
 * STATUT HONNÊTE : écrit et cohérent avec le schéma réel
 * (supabase/migrations/), pas encore exécuté contre un vrai projet
 * Supabase (aucun n'existe encore, voir docs/PROJECT_STATUS.md). Tant que
 * SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY ne sont pas
 * renseignées, toutes ces routes répondent honnêtement 503.
 */
const router = Router();
const tokenVerifier = createSupabaseTokenVerifier();
const adminClient = getSupabaseAdminClient();
const roleChecker = adminClient ? createSupabaseAdminRoleChecker(adminClient) : null;
const CONFIGURED = !!(tokenVerifier && adminClient && roleChecker);

// ---- PLANS, PRIX, ENTITLEMENTS, QUOTAS, UTILISATEURS, GRANT (RLS, voir plus haut) ----
router.get('/plans', requireAdminRLS, async (req: KeepAuthedRequest, res: Response) => {
  if (!(await isRequestingUserAdmin(req))) return void res.status(403).json({ error: 'not_admin' });
  const client = supabaseUserClient(req.keepAccessToken!);
  const { data, error } = await client
    .from('plans')
    .select('*, plan_prices(*), usage_limits(*), plan_entitlements(is_enabled, features(code, name, description))')
    .order('code');
  if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
  res.json({ data });
});

router.patch('/plans/:id', requireAdminRLS, async (req: KeepAuthedRequest, res: Response) => {
  if (!(await isRequestingUserAdmin(req))) return void res.status(403).json({ error: 'not_admin' });
  const client = supabaseUserClient(req.keepAccessToken!);
  const { id } = req.params;
  const { data: before } = await client.from('plans').select('*').eq('id', id).maybeSingle();
  if (!before) return void res.status(404).json({ error: 'not_found' });

  const patch = pick(req.body, ['name', 'description', 'is_active', 'trial_days']);
  const { data: after, error } = await client.from('plans').update(patch).eq('id', id).select().single();
  if (error) return void res.status(500).json({ error: 'update_failed', message: error.message });

  await logAdminAction(req, 'plan.updated', 'plan', id, before, after);
  res.json({ data: after });
});

router.patch('/plan-prices/:id', requireAdminRLS, async (req: KeepAuthedRequest, res: Response) => {
  if (!(await isRequestingUserAdmin(req))) return void res.status(403).json({ error: 'not_admin' });
  const client = supabaseUserClient(req.keepAccessToken!);
  const { id } = req.params;
  const { data: before } = await client.from('plan_prices').select('*').eq('id', id).maybeSingle();
  if (!before) return void res.status(404).json({ error: 'not_found' });

  const patch = pick(req.body, ['amount', 'is_active']);
  const { data: after, error } = await client.from('plan_prices').update(patch).eq('id', id).select().single();
  if (error) return void res.status(500).json({ error: 'update_failed', message: error.message });

  await logAdminAction(req, 'plan_price.updated', 'plan_price', id, before, after);
  res.json({ data: after });
});

router.patch('/usage-limits/:planId/:limitKey', requireAdminRLS, async (req: KeepAuthedRequest, res: Response) => {
  if (!(await isRequestingUserAdmin(req))) return void res.status(403).json({ error: 'not_admin' });
  const client = supabaseUserClient(req.keepAccessToken!);
  const { planId, limitKey } = req.params;
  const { limit_value } = req.body ?? {};
  const { data: before } = await client.from('usage_limits').select('*').eq('plan_id', planId).eq('limit_key', limitKey).maybeSingle();

  const { data: after, error } = await client
    .from('usage_limits')
    .upsert({ plan_id: planId, limit_key: limitKey, limit_value: limit_value ?? null })
    .select()
    .single();
  if (error) return void res.status(500).json({ error: 'upsert_failed', message: error.message });

  await logAdminAction(req, 'usage_limit.updated', 'usage_limit', `${planId}:${limitKey}`, before ?? null, after);
  res.json({ data: after });
});

router.patch('/plan-entitlements/:planId/:featureId', requireAdminRLS, async (req: KeepAuthedRequest, res: Response) => {
  if (!(await isRequestingUserAdmin(req))) return void res.status(403).json({ error: 'not_admin' });
  const client = supabaseUserClient(req.keepAccessToken!);
  const { planId, featureId } = req.params;
  const { is_enabled } = req.body ?? {};
  if (typeof is_enabled !== 'boolean') return void res.status(400).json({ error: 'is_enabled_required' });

  const { data: before } = await client.from('plan_entitlements').select('*').eq('plan_id', planId).eq('feature_id', featureId).maybeSingle();
  const { data: after, error } = await client
    .from('plan_entitlements')
    .upsert({ plan_id: planId, feature_id: featureId, is_enabled })
    .select()
    .single();
  if (error) return void res.status(500).json({ error: 'upsert_failed', message: error.message });

  await logAdminAction(req, 'plan_entitlement.updated', 'plan_entitlement', `${planId}:${featureId}`, before ?? null, after);
  res.json({ data: after });
});

router.get('/users', requireAdminRLS, async (req: KeepAuthedRequest, res: Response) => {
  if (!(await isRequestingUserAdmin(req))) return void res.status(403).json({ error: 'not_admin' });
  const client = supabaseUserClient(req.keepAccessToken!);
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  let query = client
    .from('profiles')
    .select('id, username, display_name, country_code, kind, created_at, subscriptions(plan_id, status, source, current_period_end, plans(code))', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (search) query = query.ilike('username', `%${search}%`);

  const { data, error, count } = await query;
  if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
  res.json({ data, count });
});

/**
 * Recherche par e-mail (cf. demande explicite du 24/08/2026 -- "tu dois
 * pouvoir rechercher : Adresse e-mail : artiste@email.com"). `GET /users`
 * ci-dessus ne cherche que par username -- `profiles` ne stocke jamais
 * l'email (voir 0001_core_identity.sql), il vit uniquement dans `auth.users`,
 * inaccessible directement même à un admin -- d'où la RPC SECURITY DEFINER
 * dédiée (migration 0023) plutôt qu'une jointure PostgREST classique.
 */
router.get('/users/search', requireAdminRLS, async (req: KeepAuthedRequest, res: Response) => {
  if (!(await isRequestingUserAdmin(req))) return void res.status(403).json({ error: 'not_admin' });
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return void res.status(400).json({ error: 'query_required' });
  const client = supabaseUserClient(req.keepAccessToken!);
  const { data, error } = await client.rpc('admin_search_profiles', { search_term: q });
  if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
  res.json({ data });
});

/**
 * Offre un plan gratuitement à un utilisateur (cf. demande explicite du
 * 24/08/2026 -- durées prédéfinies ou illimité, sans paiement). Réutilise
 * `subscriptions` telle quelle (source='admin_grant', voir migration 0014)
 * -- pointe vers le plan_price réel du plan choisi (jamais de charge
 * déclenchée, quel que soit `channel`). N'annule PAS un abonnement payant
 * existant -- si une subscription ACTIVE existe déjà pour ce profil, elle
 * est remplacée par le nouveau grant (un seul plan actif à la fois).
 */
router.post('/grant', requireAdminRLS, async (req: KeepAuthedRequest, res: Response) => {
  if (!(await isRequestingUserAdmin(req))) return void res.status(403).json({ error: 'not_admin' });
  const client = supabaseUserClient(req.keepAccessToken!);
  const { targetProfileId, planCode, durationMonths, reason } = req.body ?? {};
  if (!targetProfileId || !planCode) return void res.status(400).json({ error: 'target_and_plan_required' });

  const { data: plan } = await client.from('plans').select('id').eq('code', planCode).maybeSingle();
  if (!plan) return void res.status(404).json({ error: 'plan_not_found' });

  const { data: price } = await client
    .from('plan_prices').select('id, currency_code').eq('plan_id', plan.id).eq('period', 'MONTHLY').eq('is_active', true).maybeSingle();
  if (!price) return void res.status(404).json({ error: 'plan_price_not_found' });

  const periodEnd = durationMonths ? new Date(Date.now() + Number(durationMonths) * 30 * 24 * 3600 * 1000).toISOString() : null;

  const { data: after, error } = await client
    .from('subscriptions')
    .insert({
      profile_id: targetProfileId,
      plan_id: plan.id,
      plan_price_id: price.id,
      channel: 'WEB',
      status: 'ACTIVE',
      country_code: 'FR',
      currency_code: price.currency_code,
      current_period_end: periodEnd,
      source: 'admin_grant',
      granted_by: req.keepUserId,
      grant_reason: reason ?? null,
    })
    .select()
    .single();
  if (error) return void res.status(500).json({ error: 'grant_failed', message: error.message });

  await logAdminAction(req, 'subscription.admin_grant', 'subscription', after.id, null, after);
  res.status(201).json({ data: after });
});

const WRITE_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN'];
const FINANCE_WRITE_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'FINANCE'];
const MARKETING_WRITE_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'MARKETING'];

async function writeAudit(
  req: AdminAuthedRequest,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown
) {
  if (!adminClient) return;
  await adminClient.from('audit_logs').insert({
    actor_admin_id: req.keepUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    before,
    after,
  });
}

function anyAdmin() {
  return requireAdminRole(tokenVerifier!, roleChecker!);
}
function writeAdmin(roles: AdminRole[] = WRITE_ROLES) {
  return requireAdminRole(tokenVerifier!, roleChecker!, roles);
}

if (!CONFIGURED) {
  router.use((_req, res) => {
    res.status(503).json({
      error: 'admin_backend_not_configured',
      message:
        'Super Admin backend non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY manquants).',
    });
  });
} else {
  // ---- FEATURE FLAGS ----
  router.get('/feature-flags', anyAdmin(), async (_req, res) => {
    const { data, error } = await adminClient!.from('feature_flags').select('*').order('key');
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    res.json({ data });
  });

  router.patch('/feature-flags/:key', writeAdmin(), async (req: AdminAuthedRequest, res: Response) => {
    const { key } = req.params;
    const { data: before } = await adminClient!.from('feature_flags').select('*').eq('key', key).maybeSingle();
    if (!before) return void res.status(404).json({ error: 'not_found' });

    const patch = pick(req.body, ['is_enabled_globally', 'enabled_countries', 'enabled_plans', 'rollout_percent', 'min_app_version']);
    const { data: after, error } = await adminClient!
      .from('feature_flags')
      .update({ ...patch, updated_by: req.keepUserId, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select()
      .single();
    if (error) return void res.status(500).json({ error: 'update_failed', message: error.message });

    await writeAudit(req, 'feature_flag.updated', 'feature_flag', key, before, after);
    res.json({ data: after });
  });

  // ---- REMOTE CONFIG (réglages génériques : durée de silence de session, etc.) ----
  router.get('/remote-config', anyAdmin(), async (_req, res) => {
    const { data, error } = await adminClient!.from('remote_config').select('*').order('key');
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    res.json({ data });
  });

  router.put('/remote-config/:key', writeAdmin(), async (req: AdminAuthedRequest, res: Response) => {
    const { key } = req.params;
    const { value, description } = req.body ?? {};
    if (value === undefined) return void res.status(400).json({ error: 'value_required' });

    const { data: before } = await adminClient!.from('remote_config').select('*').eq('key', key).maybeSingle();
    const { data: after, error } = await adminClient!
      .from('remote_config')
      .upsert({ key, value, description, updated_by: req.keepUserId, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) return void res.status(500).json({ error: 'upsert_failed', message: error.message });

    await writeAudit(req, 'remote_config.updated', 'remote_config', key, before ?? null, after);
    res.json({ data: after });
  });

  // ---- PROMOTIONS ----
  router.get('/promotions', anyAdmin(), async (_req, res) => {
    const { data, error } = await adminClient!.from('promotions').select('*, promo_codes(*)').order('starts_at', { ascending: false });
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    res.json({ data });
  });

  router.post('/promotions', writeAdmin(MARKETING_WRITE_ROLES), async (req: AdminAuthedRequest, res: Response) => {
    const patch = pick(req.body, ['name', 'description', 'plan_id', 'discount_percent', 'starts_at', 'ends_at', 'is_active']);
    const { data: after, error } = await adminClient!.from('promotions').insert(patch).select().single();
    if (error) return void res.status(500).json({ error: 'insert_failed', message: error.message });

    await writeAudit(req, 'promotion.created', 'promotion', after.id, null, after);
    res.status(201).json({ data: after });
  });

  router.patch('/promotions/:id', writeAdmin(MARKETING_WRITE_ROLES), async (req: AdminAuthedRequest, res: Response) => {
    const { id } = req.params;
    const { data: before } = await adminClient!.from('promotions').select('*').eq('id', id).maybeSingle();
    if (!before) return void res.status(404).json({ error: 'not_found' });

    const patch = pick(req.body, ['name', 'description', 'discount_percent', 'starts_at', 'ends_at', 'is_active']);
    const { data: after, error } = await adminClient!.from('promotions').update(patch).eq('id', id).select().single();
    if (error) return void res.status(500).json({ error: 'update_failed', message: error.message });

    await writeAudit(req, 'promotion.updated', 'promotion', id, before, after);
    res.json({ data: after });
  });

  // ---- COÛTS OPÉRATIONNELS ----
  router.get('/operating-costs', anyAdmin(), async (_req, res) => {
    const { data, error } = await adminClient!.from('operating_costs').select('*').order('recorded_at', { ascending: false });
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    res.json({ data });
  });

  router.post('/operating-costs', writeAdmin(FINANCE_WRITE_ROLES), async (req: AdminAuthedRequest, res: Response) => {
    const patch = pick(req.body, ['category', 'label', 'amount', 'currency_code', 'period']);
    const { data: after, error } = await adminClient!
      .from('operating_costs')
      .insert({ ...patch, created_by: req.keepUserId })
      .select()
      .single();
    if (error) return void res.status(500).json({ error: 'insert_failed', message: error.message });

    await writeAudit(req, 'operating_cost.created', 'operating_cost', after.id, null, after);
    res.status(201).json({ data: after });
  });

  // ---- ANALYTICS (agrégats réels -- même logique que packages/admin/lib/aggregate.ts, sur vraies données) ----
  router.get('/analytics', anyAdmin(), async (_req, res) => {
    const [{ data: subs, error: subsErr }, { data: costs, error: costsErr }, { count: userCount, error: userErr }] = await Promise.all([
      adminClient!.from('subscriptions').select('status, currency_code, plan_prices(amount)'),
      adminClient!.from('operating_costs').select('amount, currency_code, period'),
      adminClient!.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    if (subsErr || costsErr || userErr) {
      return void res.status(500).json({ error: 'query_failed', message: (subsErr ?? costsErr ?? userErr)?.message });
    }

    // Agrégats groupés par devise -- jamais de somme cross-devise (cf. règle du schéma commerce).
    const mrrByCurrency: Record<string, number> = {};
    for (const s of subs ?? []) {
      if (s.status !== 'ACTIVE') continue;
      const amount = (s as any).plan_prices?.amount ?? 0;
      mrrByCurrency[s.currency_code] = (mrrByCurrency[s.currency_code] ?? 0) + Number(amount);
    }
    const costsByCurrency: Record<string, number> = {};
    for (const c of costs ?? []) {
      const monthly = c.period === 'YEARLY' ? Number(c.amount) / 12 : Number(c.amount);
      costsByCurrency[c.currency_code] = (costsByCurrency[c.currency_code] ?? 0) + monthly;
    }

    res.json({
      data: {
        totalUsers: userCount ?? 0,
        activeSubscriptions: (subs ?? []).filter((s) => s.status === 'ACTIVE').length,
        mrrByCurrency,
        costsByCurrency,
      },
    });
  });

  // ---- RECOGNITION MONITORING (cf. demande explicite du 23/08/2026 -- schéma voir
  // supabase/migrations/0002_recognition_events.sql) : le mobile n'écrit pas encore dans
  // recognition_events (journal réel encore local, voir useRecognitionTelemetryStore.ts côté
  // mobile) -- cet endpoint renvoie donc honnêtement des agrégats à zéro tant que ce pont
  // n'est pas branché, jamais des chiffres inventés.
  router.get('/recognition-stats', anyAdmin(), async (_req, res) => {
    const { data, error } = await adminClient!
      .from('recognition_events')
      .select('provider_id, source, outcome, latency_ms')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });

    const rows = data ?? [];
    const byOutcome: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    let latencySum = 0;
    let latencyCount = 0;
    for (const r of rows) {
      byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
      byProvider[r.provider_id] = (byProvider[r.provider_id] ?? 0) + 1;
      if (r.latency_ms > 0) {
        latencySum += r.latency_ms;
        latencyCount += 1;
      }
    }
    const total = rows.length;
    res.json({
      data: {
        totalCalls: total,
        byOutcome,
        byProvider,
        avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0,
        successRate: total > 0 ? Math.round(((byOutcome.success ?? 0) / total) * 100) : 0,
        quotaErrors: byOutcome.quota_error ?? 0,
      },
    });
  });
}

function pick<T extends Record<string, unknown>>(body: unknown, keys: string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  if (body && typeof body === 'object') {
    for (const k of keys) if (k in (body as any)) out[k] = (body as any)[k];
  }
  return out as Partial<T>;
}

export default router;
