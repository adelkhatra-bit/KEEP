import { supabase } from './supabaseClient';

export type KeepPlan = {
  code: string;
  name: string;
  description?: string | null;
  trialDays: number;
  monthlyAmount: number;
  currencyCode: string;
};

export type CreditFunnel = {
  guestSuccessLimit: number;
  signupBonusSuccesses: number;
};

export async function loadPlans(): Promise<KeepPlan[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('plans')
    .select('id,code,name,description,trial_days,plan_prices!inner(currency_code,period,amount,is_active,effective_from)')
    .eq('is_active', true)
    .eq('plan_prices.is_active', true)
    .eq('plan_prices.period', 'MONTHLY');
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const prices = Array.isArray(row.plan_prices) ? row.plan_prices : [];
    const price = prices.slice().sort((a: any, b: any) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
    return {
      code: row.code,
      name: row.name,
      description: row.description,
      trialDays: Number(row.trial_days || 0),
      monthlyAmount: Number(price?.amount || 0),
      currencyCode: price?.currency_code || 'EUR',
    };
  }).sort((a: KeepPlan, b: KeepPlan) => ['FREE','PREMIUM','CREATOR_PRO','VENUE_PRO'].indexOf(a.code) - ['FREE','PREMIUM','CREATOR_PRO','VENUE_PRO'].indexOf(b.code));
}

export async function loadCreditFunnel(): Promise<CreditFunnel> {
  if (!supabase) return { guestSuccessLimit: 3, signupBonusSuccesses: 4 };
  const { data, error } = await supabase.from('remote_config').select('key,value').in('key', ['guest_success_limit', 'signup_bonus_successes']);
  if (error) throw error;
  const map = Object.fromEntries((data ?? []).map((row: any) => [row.key, Number(row.value)]));
  return {
    guestSuccessLimit: Number.isFinite(map.guest_success_limit) ? map.guest_success_limit : 3,
    signupBonusSuccesses: Number.isFinite(map.signup_bonus_successes) ? map.signup_bonus_successes : 4,
  };
}

export interface SessionScreenCopy {
  emptyTitle: string | null;
  emptySubtitle: string | null;
}

/**
 * Texte de l'écran Écouter au repos, éditable depuis le Super Admin (demande
 * explicite du 26/08/2026 -- "je veux pouvoir la changer dans le super
 * admin"). Même table/pattern que loadCreditFunnel ci-dessus -- jamais une
 * deuxième source de config. `null` = pas encore configuré en base, le
 * composant appelant garde alors sa valeur i18n par défaut.
 */
export async function loadSessionScreenCopy(): Promise<SessionScreenCopy> {
  if (!supabase) return { emptyTitle: null, emptySubtitle: null };
  const { data, error } = await supabase.from('remote_config').select('key,value').in('key', ['session_empty_title', 'session_empty_subtitle']);
  if (error) return { emptyTitle: null, emptySubtitle: null };
  const map = Object.fromEntries((data ?? []).map((row: any) => [row.key, row.value]));
  return {
    emptyTitle: typeof map.session_empty_title === 'string' ? map.session_empty_title : null,
    emptySubtitle: typeof map.session_empty_subtitle === 'string' ? map.session_empty_subtitle : null,
  };
}

/**
 * Délai avant de proposer la fin d'une session silencieuse. Il reste piloté
 * depuis `remote_config` afin que le Super Admin puisse l'ajuster sans publier
 * une nouvelle version de l'application. KEEP ne coupe jamais la session tout
 * seul : ce délai ne fait qu'ouvrir la proposition utilisateur.
 */
export async function loadSessionSilenceTimeoutMinutes(): Promise<number> {
  if (!supabase) return 15;
  const { data, error } = await supabase
    .from('remote_config')
    .select('value')
    .eq('key', 'session_silence_timeout_minutes')
    .maybeSingle();
  if (error) return 15;
  const minutes = Number(data?.value);
  if (!Number.isFinite(minutes)) return 15;
  return Math.max(1, Math.min(180, Math.round(minutes)));
}

export async function loadCurrentPlanCode(profileId: string): Promise<string> {
  if (!supabase) return 'FREE';

  // Les profils Démo/Invité sont volontairement locaux et n'ont jamais de
  // ligne `subscriptions` Supabase. La colonne profile_id est un UUID : envoyer
  // "demo-user-1" provoquait un HTTP 400 dans le navigateur alors que l'app
  // était parfaitement rendue. Un identifiant non UUID est donc, par contrat,
  // un profil local Free et ne doit jamais déclencher une requête distante.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) return 'FREE';

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status,current_period_end,plans!inner(code)')
    .eq('profile_id', profileId)
    .in('status', ['TRIALING', 'ACTIVE'])
    .or(`current_period_end.is.null,current_period_end.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.plans?.code || 'FREE';
}
