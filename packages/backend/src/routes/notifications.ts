import { Router, Response } from 'express';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import { getSupabaseAdminClient } from '../lib/supabaseAdmin';

/**
 * Enregistrement des tokens push (demande explicite du 26/08/2026 -- boucle
 * notifications complète). `notifications`/`notification_preferences` déjà
 * réels côté client (notificationService.ts, lecture/écriture directe
 * Supabase) -- cette route est le seul morceau qui devait passer par le
 * backend : `push_tokens` n'a pas de policy INSERT côté client par design
 * (jamais un profil qui écrit un token pour un autre), le serveur vérifie le
 * VRAI utilisateur via son jeton Loki avant d'écrire.
 */
const router = Router();
const tokenVerifier = createSupabaseTokenVerifier();
const adminClient = getSupabaseAdminClient();
const CONFIGURED = !!(tokenVerifier && adminClient);

// BUG REEL trouve en testant reellement (crash serveur reproduit) : passer
// "tokenVerifier!" directement a requireKeepAuth() alors que tokenVerifier
// peut être null (config manquante) crashe TOUT le processus au premier appel
// (jamais juste une 503 propre) -- requireKeepAuth() ne sait pas gerer un
// verifier null, il l'appelle sans garde. Si CONFIGURED est faux, on monte un
// 503 propre pour TOUTES les routes de ce router, jamais le vrai middleware.
if (!CONFIGURED) {
  router.use((_req, res) => {
    res.status(503).json({ error: 'not_configured', message: 'Notifications backend non configuré (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY manquants).' });
  });
}

router.post('/push-token', requireKeepAuth(tokenVerifier ?? { verify: async () => null }), async (req: KeepAuthedRequest, res: Response) => {
  const { token, platform } = req.body ?? {};
  if (!token || typeof token !== 'string') return void res.status(400).json({ error: 'token_required' });

  const { data, error } = await adminClient!
    .from('push_tokens')
    .upsert(
      { profile_id: req.keepUserId, token, platform: typeof platform === 'string' ? platform : 'unknown', updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,token' }
    )
    .select()
    .single();
  if (error) return void res.status(500).json({ error: 'upsert_failed', message: error.message });

  res.status(201).json({ data });
});

router.delete('/push-token', requireKeepAuth(tokenVerifier ?? { verify: async () => null }), async (req: KeepAuthedRequest, res: Response) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') return void res.status(400).json({ error: 'token_required' });

  const { error } = await adminClient!.from('push_tokens').delete().eq('profile_id', req.keepUserId).eq('token', token);
  if (error) return void res.status(500).json({ error: 'delete_failed', message: error.message });

  res.status(204).send();
});

export default router;
