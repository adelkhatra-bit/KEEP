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

export async function loadCurrentPlanCode(profileId: string): Promise<string> {
  if (!supabase) return 'FREE';
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status,plans!inner(code)')
    .eq('profile_id', profileId)
    .in('status', ['TRIALING', 'ACTIVE'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.plans?.code || 'FREE';
}
