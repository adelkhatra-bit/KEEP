import { Router, Response } from 'express';
import { requireAdminRole, AdminAuthedRequest } from '../lib/adminAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import { getSupabaseAdminClient, createSupabaseAdminRoleChecker } from '../lib/supabaseAdmin';
import {
  deleteIntegrationSecret,
  listIntegrationSecrets,
  setIntegrationSecret,
} from '../lib/integrationSecrets';

const router = Router();
const verifier = createSupabaseTokenVerifier();
const adminClient = getSupabaseAdminClient();
const roleChecker = adminClient ? createSupabaseAdminRoleChecker(adminClient) : null;

const ALLOWED_KEYS: Record<string, string> = {
  BREVO_API_KEY: 'email',
  BREVO_SMTP_KEY: 'email',
  BREVO_SMTP_LOGIN: 'email',
  BREVO_SENDER_EMAIL: 'email',
  BREVO_SENDER_NAME: 'email',
  SPOTIFY_CLIENT_ID: 'music',
  SPOTIFY_CLIENT_SECRET: 'music',
  DEEZER_APP_ID: 'music',
  DEEZER_APP_SECRET: 'music',
  APPLE_MUSICKIT_TEAM_ID: 'music',
  APPLE_MUSICKIT_KEY_ID: 'music',
  APPLE_MUSICKIT_PRIVATE_KEY: 'music',
  AUDD_API_KEY: 'recognition',
};

async function audit(req: AdminAuthedRequest, action: string, targetId: string, after: unknown) {
  if (!adminClient) return;
  await adminClient.from('audit_logs').insert({
    actor_admin_id: req.keepUserId,
    action,
    target_type: 'integration_secret',
    target_id: targetId,
    before: null,
    after,
  });
}

if (!verifier || !adminClient || !roleChecker) {
  router.use((_req, res) => {
    res.status(503).json({ error: 'admin_backend_not_configured' });
  });
} else {
  const guard = requireAdminRole(verifier, roleChecker, ['SUPER_ADMIN', 'ADMIN', 'TECH']);

  router.get('/', guard, async (_req, res) => {
    try {
      const data = await listIntegrationSecrets();
      const indexed = new Map(data.map((row: any) => [row.key, row]));
      res.json({
        data: Object.keys(ALLOWED_KEYS).map((key) => ({
          key,
          category: ALLOWED_KEYS[key],
          configured: Boolean(indexed.get(key)?.is_configured),
          hint: indexed.get(key)?.value_hint || null,
          updatedAt: indexed.get(key)?.updated_at || null,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: 'integration_secret_list_failed', message: error?.message });
    }
  });

  router.put('/:key', guard, async (req: AdminAuthedRequest, res: Response) => {
    const key = req.params.key;
    const category = ALLOWED_KEYS[key];
    if (!category) return void res.status(400).json({ error: 'secret_key_not_allowed' });
    const value = String(req.body?.value || '').trim();
    if (!value) return void res.status(400).json({ error: 'value_required' });

    try {
      const data = await setIntegrationSecret({ key, category, value, updatedBy: req.keepUserId });
      await audit(req, 'integration_secret.updated', key, {
        key,
        category,
        configured: true,
        hint: data.value_hint,
      });
      res.json({
        data: {
          key,
          category,
          configured: true,
          hint: data.value_hint,
          updatedAt: data.updated_at,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: 'integration_secret_update_failed', message: error?.message });
    }
  });

  router.delete('/:key', guard, async (req: AdminAuthedRequest, res: Response) => {
    const key = req.params.key;
    if (!ALLOWED_KEYS[key]) return void res.status(400).json({ error: 'secret_key_not_allowed' });
    try {
      await deleteIntegrationSecret(key);
      await audit(req, 'integration_secret.deleted', key, { key, configured: false });
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: 'integration_secret_delete_failed', message: error?.message });
    }
  });
}

export default router;
