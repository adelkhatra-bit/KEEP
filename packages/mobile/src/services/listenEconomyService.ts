import { supabase } from './supabaseClient';

export type ListenEconomyStatus = {
  ok?: boolean;
  planCode: string;
  isAnonymous: boolean;
  featureKey: 'LISTEN_DAILY';
  periodKey: string;
  used: number;
  limit: number;
  includedRemaining: number;
  overQuota: boolean;
  overQuotaFreeCost: number;
  freeBalance: number;
  canListen: boolean;
  canPayWithFree: boolean;
  timezone: string;
  chargedFree?: number;
  deduplicated?: boolean;
  reason?: string | null;
  streak?: { streak?: number; reward?: number; freezeUsed?: boolean } | null;
};

function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
  catch { return 'Europe/Paris'; }
}

function n(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStatus(raw: any): ListenEconomyStatus {
  return {
    ok: typeof raw?.ok === 'boolean' ? raw.ok : undefined,
    planCode: String(raw?.planCode ?? raw?.plan_code ?? 'FREE'),
    isAnonymous: Boolean(raw?.isAnonymous ?? raw?.is_anonymous ?? false),
    featureKey: 'LISTEN_DAILY',
    periodKey: String(raw?.periodKey ?? raw?.period_key ?? ''),
    used: Math.max(0, n(raw?.used)),
    limit: Math.max(1, n(raw?.limit, 5)),
    includedRemaining: Math.max(0, n(raw?.includedRemaining ?? raw?.included_remaining)),
    overQuota: Boolean(raw?.overQuota ?? raw?.over_quota ?? false),
    overQuotaFreeCost: Math.max(1, n(raw?.overQuotaFreeCost ?? raw?.over_quota_free_cost, 1)),
    freeBalance: Math.max(0, n(raw?.freeBalance ?? raw?.free_balance)),
    canListen: Boolean(raw?.canListen ?? raw?.can_listen ?? true),
    canPayWithFree: Boolean(raw?.canPayWithFree ?? raw?.can_pay_with_free ?? false),
    timezone: String(raw?.timezone ?? deviceTimeZone()),
    chargedFree: raw?.chargedFree == null && raw?.charged_free == null ? undefined : Math.max(0, n(raw?.chargedFree ?? raw?.charged_free)),
    deduplicated: raw?.deduplicated == null ? undefined : Boolean(raw.deduplicated),
    reason: raw?.reason == null ? null : String(raw.reason),
    streak: raw?.streak && typeof raw.streak === 'object' ? raw.streak : null,
  };
}

export async function loadListenEconomyStatus(): Promise<ListenEconomyStatus | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) return null;
  const { data, error } = await supabase.rpc('keep_listen_status', { p_timezone: deviceTimeZone() });
  if (error || !data) throw new Error(String(error?.message || error?.code || 'LISTEN_STATUS_FAILED'));
  return parseStatus(data);
}

export async function recordListenSuccess(sourceKey: string, allowFree = false): Promise<ListenEconomyStatus | null> {
  if (!supabase || !sourceKey.trim()) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) return null;
  const { data, error } = await supabase.rpc('keep_record_listen_success', {
    p_source_key: sourceKey.trim(),
    p_timezone: deviceTimeZone(),
    p_allow_free: allowFree,
  });
  if (error || !data) throw new Error(String(error?.message || error?.code || 'LISTEN_RECORD_FAILED'));
  return parseStatus(data);
}

export function listenQuotaMessage(status: ListenEconomyStatus): string {
  if (status.isAnonymous) return 'Tu as utilisé tes ' + status.limit + ' écoutes invitées. Crée ou connecte ton compte pour continuer.';
  if (status.overQuota && !status.canPayWithFree) return 'Tes ' + status.limit + ' écoutes incluses du jour sont utilisées. Recharge tes FREE ou passe à une formule supérieure pour continuer.';
  if (status.overQuota) return 'Quota inclus atteint. La prochaine reconnaissance réussie coûte ' + status.overQuotaFreeCost + ' FREE.';
  return status.used + '/' + status.limit + ' écoutes aujourd’hui';
}
