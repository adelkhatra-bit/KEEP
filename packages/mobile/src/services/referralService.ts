import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const PENDING_REFERRAL_KEY = 'keep_pending_referral_code';

export type ReferralRules = {
  freePerSignup: number;
  bonus3: number;
  bonus5: number;
  bonus10: number;
  monthlyCap: number;
};

export type ReferralStatus = ReferralRules & {
  code: string;
  monthReferrals: number;
  lifetimeReferrals: number;
  monthFreeEarned: number;
  totalFreeEarned: number;
};

const FALLBACK: ReferralRules = { freePerSignup: 2, bonus3: 3, bonus5: 5, bonus10: 10, monthlyCap: 40 };

function parseRules(raw: any): ReferralRules {
  return {
    freePerSignup: Number(raw?.free_per_signup ?? FALLBACK.freePerSignup),
    bonus3: Number(raw?.bonus_3 ?? FALLBACK.bonus3),
    bonus5: Number(raw?.bonus_5 ?? FALLBACK.bonus5),
    bonus10: Number(raw?.bonus_10 ?? FALLBACK.bonus10),
    monthlyCap: Number(raw?.monthly_cap ?? FALLBACK.monthlyCap),
  };
}

export async function loadReferralRules(): Promise<ReferralRules> {
  if (!supabase) return FALLBACK;
  const { data, error } = await supabase.rpc('keep_referral_rules');
  if (error || !data) return FALLBACK;
  return parseRules(data);
}

export async function loadReferralStatus(): Promise<ReferralStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('keep_referral_status');
  if (error || !data) return null;
  return {
    ...parseRules(data),
    code: String((data as any).code || ''),
    monthReferrals: Number((data as any).month_referrals ?? 0),
    lifetimeReferrals: Number((data as any).lifetime_referrals ?? 0),
    monthFreeEarned: Number((data as any).month_free_earned ?? 0),
    totalFreeEarned: Number((data as any).total_free_earned ?? 0),
  };
}

export async function loadMyReferralCode(): Promise<string> {
  if (!supabase) return '';
  const { data, error } = await supabase.rpc('keep_my_referral_code');
  if (error) return '';
  return String(data || '').trim().toUpperCase();
}

export function referralCodeFromUrl(url?: string | null): string {
  const match = String(url || '').match(/[?&]ref=([A-Za-z0-9_-]{4,32})/i);
  return match ? decodeURIComponent(match[1]).trim().toUpperCase() : '';
}

export async function stageReferralFromUrl(url?: string | null): Promise<string> {
  const code = referralCodeFromUrl(url);
  if (!code) return '';
  await AsyncStorage.setItem(PENDING_REFERRAL_KEY, code);
  return code;
}

export async function claimPendingReferral(): Promise<boolean> {
  if (!supabase) return false;
  const code = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
  if (!code) return false;
  const { error } = await supabase.rpc('keep_claim_referral', { p_code: code });
  if (!error) {
    await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
    return true;
  }
  const message = String(error.message || error.code || '');
  if (/SELF_FORBIDDEN|WINDOW_EXPIRED|CODE_INVALID|REAL_ACCOUNT_REQUIRED/i.test(message)) {
    await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
  }
  return false;
}

export function appendReferralToLink(link: string, code: string): string {
  if (!code) return link;
  const separator = link.includes('?') ? '&' : '?';
  return `${link}${separator}ref=${encodeURIComponent(code)}`;
}

export const DEFAULT_REFERRAL_RULES = FALLBACK;
