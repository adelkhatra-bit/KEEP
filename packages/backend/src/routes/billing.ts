/**
 * Routes plans/abonnement côté UTILISATEUR (pas Super Admin -- voir admin.ts
 * pour la gestion). Créé le 24/08/2026 (demande explicite -- "transforme les
 * badges décoratifs en vrai système d'abonnement... les prix doivent venir
 * du backend"). AUDIT FAIT AVANT D'ÉCRIRE CE FICHIER : le schéma
 * (plans/plan_prices/plan_entitlements/usage_limits/subscriptions) existait
 * déjà en entier (0003_commerce.sql), aucune route backend ne l'exposait
 * encore côté utilisateur -- rien ici ne duplique admin.ts (lecture seule,
 * jamais d'écriture -- l'écriture reste Super Admin ou, plus tard, le
 * webhook de paiement réel).
 */
import { Router, Response } from 'express';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import { supabaseUserClient } from '../lib/supabaseUserClient';
import { getNumericConfig } from '../lib/remoteConfig';

const router = Router();
const tokenVerifier = createSupabaseTokenVerifier();
const auth = requireKeepAuth(tokenVerifier!);

/**
 * Quota MARKETING (morceaux réellement révélés), distinct du plafond
 * anti-abus backend (voir recognition.ts, migration 0020) -- cf. bug réel du
 * 24/08/2026 : "l'UI doit être pilotée par le nombre RÉEL de morceaux
 * reconnus, jamais par une session en cours". Public (pas besoin d'être
 * connecté -- l'écran d'accueil doit savoir combien de morceaux un invité
 * peut voir avant même d'avoir de session).
 */
router.get('/recognition-config', async (_req, res: Response) => {
  const [guestSuccessLimit, signupBonusSuccesses] = await Promise.all([
    getNumericConfig('guest_success_limit', 3),
    getNumericConfig('signup_bonus_successes', 3),
  ]);
  res.json({ data: { guestSuccessLimit, signupBonusSuccesses } });
});

/**
 * Catalogue complet — public, pas besoin d'être connecté pour voir les
 * offres (cf. demande explicite -- écran "Choisir mon offre"). Utilise la
 * clé anon directement (mêmes policies RLS publiques que plans/plan_prices
 * déjà vérifiées en lecture ouverte, voir migration 0003 -- aucune n'a
 * jamais restreint le SELECT sur ces tables).
 */
router.get('/plans', async (_req, res: Response) => {
  const client = supabaseUserClient(process.env.SUPABASE_ANON_KEY!);
  const { data, error } = await client
    .from('plans')
    .select('id, code, name, description, trial_days, is_active, plan_prices(currency_code, period, amount, is_active), usage_limits(limit_key, limit_value), plan_entitlements(is_enabled, features(code, name, description))')
    .eq('is_active', true)
    .order('code');
  if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
  res.json({ data });
});

/**
 * Plan réellement actif de l'utilisateur courant. `null` = FREE implicite
 * (aucune ligne subscriptions -- cohérent avec "un vrai compte démarre
 * toujours FREE", voir useUserStore.ts userFromAuthSession).
 */
router.get('/me/subscription', auth, async (req: KeepAuthedRequest, res: Response) => {
  const client = supabaseUserClient(req.keepAccessToken!);
  const { data, error } = await client
    .from('subscriptions')
    .select('id, status, source, current_period_end, cancel_at_period_end, plans(code, name), plan_prices(amount, currency_code, period)')
    .eq('profile_id', req.keepUserId)
    .in('status', ['ACTIVE', 'TRIALING'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
  res.json({ data: data ?? { plans: { code: 'FREE', name: 'Free' }, status: 'ACTIVE', source: 'purchase' } });
});

export default router;
