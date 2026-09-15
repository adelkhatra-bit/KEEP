import { supabase } from './supabaseClient';

export type KeepPlan = {
  code: string;
  name: string;
  description?: string | null;
  trialDays: number;
  monthlyAmount: number;
  currencyCode: string;
  // Adel (04/09/2026) : "regarde bien où y a prix mensuel et prix annuel, le
  // nombre de Free que je vais donner avec" -- réglé au même endroit que le
  // prix (plan_prices.free_bonus_per_month), une seule source de vérité au
  // lieu d'une clé remote_config séparée par plan.
  monthlyFreeBonus: number;
};

export type CreditFunnel = {
  guestSuccessLimit: number;
  signupBonusSuccesses: number;
  // Adel (04/09/2026) : "il faut vraiment qu'ils sachent combien de Free il
  // a par mois" -- Free offerts chaque mois écoulé, par formule, distincts
  // des mises/gains de Battle (voir keep_monthly_free_bonus_for_profile).
  monthlyBonusFree: number;
  monthlyBonusPremium: number;
  monthlyBonusCreatorPro: number;
  monthlyBonusVenuePro: number;
};

export async function loadPlans(): Promise<KeepPlan[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('plans')
    .select('id,code,name,description,trial_days,plan_prices!inner(currency_code,period,amount,is_active,effective_from,free_bonus_per_month)')
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
      monthlyFreeBonus: Number(price?.free_bonus_per_month || 0),
    };
  }).sort((a: KeepPlan, b: KeepPlan) => ['FREE','PREMIUM','CREATOR_PRO','VENUE_PRO'].indexOf(a.code) - ['FREE','PREMIUM','CREATOR_PRO','VENUE_PRO'].indexOf(b.code));
}

export const CREDIT_FUNNEL_DEFAULTS: CreditFunnel = {
  guestSuccessLimit: 3,
  signupBonusSuccesses: 20,
  monthlyBonusFree: 5,
  monthlyBonusPremium: 15,
  monthlyBonusCreatorPro: 40,
  monthlyBonusVenuePro: 100,
};

export async function loadCreditFunnel(): Promise<CreditFunnel> {
  if (!supabase) return CREDIT_FUNNEL_DEFAULTS;
  const { data, error } = await supabase.from('remote_config').select('key,value').in('key', [
    'guest_success_limit', 'signup_bonus_successes',
    'free_monthly_bonus_free', 'free_monthly_bonus_premium', 'free_monthly_bonus_creator_pro', 'free_monthly_bonus_venue_pro',
  ]);
  if (error) throw error;
  const map = Object.fromEntries((data ?? []).map((row: any) => [row.key, Number(row.value)]));
  const pick = (key: string, fallback: number) => Number.isFinite(map[key]) ? map[key] : fallback;
  return {
    guestSuccessLimit: pick('guest_success_limit', CREDIT_FUNNEL_DEFAULTS.guestSuccessLimit),
    signupBonusSuccesses: pick('signup_bonus_successes', CREDIT_FUNNEL_DEFAULTS.signupBonusSuccesses),
    monthlyBonusFree: pick('free_monthly_bonus_free', CREDIT_FUNNEL_DEFAULTS.monthlyBonusFree),
    monthlyBonusPremium: pick('free_monthly_bonus_premium', CREDIT_FUNNEL_DEFAULTS.monthlyBonusPremium),
    monthlyBonusCreatorPro: pick('free_monthly_bonus_creator_pro', CREDIT_FUNNEL_DEFAULTS.monthlyBonusCreatorPro),
    monthlyBonusVenuePro: pick('free_monthly_bonus_venue_pro', CREDIT_FUNNEL_DEFAULTS.monthlyBonusVenuePro),
  };
}

export interface SessionScreenCopy {
  emptyTitle: string | null;
  emptySubtitle: string | null;
}

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
