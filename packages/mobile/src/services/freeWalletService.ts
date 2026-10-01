import { supabase } from './supabaseClient';

export type FreeWalletStatus = {
  balance: number;
  earnedToday: number;
  lostToday: number;
  spentToday: number;
  netToday: number;
  battleEarnedToday: number;
  soloEarnedToday: number;
  bonusEarnedToday: number;
  adminEarnedToday: number;
  marketplaceEarnedToday: number;
  keepSpentToday: number;
  keepCountToday: number;
  marketplaceSpentToday: number;
  marketplacePurchaseCountToday: number;
  period: string;
  timezone: string;
  startedAt: string | null;
  endsAt: string | null;
};

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
  } catch {
    return 'Europe/Paris';
  }
}

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadMyFreeWalletStatus(): Promise<FreeWalletStatus> {
  const { data, error } = await client().rpc('keep_free_wallet_status', { p_timezone: deviceTimeZone() });
  if (error) throw new Error(String(error.message || error.code || 'FREE_WALLET_FAILED'));
  const row = (data ?? {}) as any;
  return {
    balance: n(row.balance),
    earnedToday: n(row.earnedToday ?? row.earned_today),
    lostToday: n(row.lostToday ?? row.lost_today),
    spentToday: n(row.spentToday ?? row.spent_today),
    netToday: n(row.netToday ?? row.net_today),
    battleEarnedToday: n(row.battleEarnedToday ?? row.battle_earned_today),
    soloEarnedToday: n(row.soloEarnedToday ?? row.solo_earned_today),
    bonusEarnedToday: n(row.bonusEarnedToday ?? row.bonus_earned_today),
    adminEarnedToday: n(row.adminEarnedToday ?? row.admin_earned_today),
    marketplaceEarnedToday: n(row.marketplaceEarnedToday ?? row.marketplace_earned_today),
    keepSpentToday: n(row.keepSpentToday ?? row.keep_spent_today),
    keepCountToday: n(row.keepCountToday ?? row.keep_count_today),
    marketplaceSpentToday: n(row.marketplaceSpentToday ?? row.marketplace_spent_today),
    marketplacePurchaseCountToday: n(row.marketplacePurchaseCountToday ?? row.marketplace_purchase_count_today),
    period: String(row.period ?? 'TODAY_2AM'),
    timezone: String(row.timezone ?? deviceTimeZone()),
    startedAt: row.startedAt ?? row.started_at ?? null,
    endsAt: row.endsAt ?? row.ends_at ?? null,
  };
}

export function subscribeMyFreeWalletChanges(profileId: string, onChange: () => void): () => void {
  if (!supabase || !profileId) return () => {};
  const filters: Array<{ table: string; filter: string }> = [
    { table: 'keep_battle_credit_events', filter: `profile_id=eq.${profileId}` },
    { table: 'keep_battle_arena_credit_events', filter: `profile_id=eq.${profileId}` },
    { table: 'keep_battle_solo_credit_events', filter: `profile_id=eq.${profileId}` },
    { table: 'keep_battle_perfect_bonus_events', filter: `profile_id=eq.${profileId}` },
    { table: 'keep_free_spend_events', filter: `profile_id=eq.${profileId}` },
    { table: 'admin_credit_grants', filter: `profile_id=eq.${profileId}` },
    { table: 'playlist_sale_payments', filter: `buyer_id=eq.${profileId}` },
    { table: 'playlist_sale_payments', filter: `seller_id=eq.${profileId}` },
  ];
  let channel = supabase.channel(`free-wallet:${profileId}:${Date.now()}`);
  filters.forEach(({ table, filter }) => {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, onChange);
  });
  channel.subscribe();
  return () => { void supabase.removeChannel(channel); };
}
