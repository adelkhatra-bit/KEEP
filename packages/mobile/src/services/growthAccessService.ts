import { supabase } from './supabaseClient';

export type QuotaAccess = {
  planCode: string;
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
};

export type DiscoveryAccess = QuotaAccess & { newlyCounted: boolean };

export type GrowthRewardStatus = {
  qualifiedShares: number;
  followers: number;
  bonusFreeCredits: number;
  bonusDiscoveryProfiles: number;
  bonusSortTrials: number;
  nextShareGoal: number | null;
  audienceProUnlocked: boolean;
  audienceProThreshold: number;
};

export type CommercialRules = {
  freeDiscoveryProfiles: number;
  premiumSmartSortTrials: number;
  premiumDailyDownloads: number;
  shareDailyCap: number;
  audienceProThreshold: number;
  shareTiers: [number, number, number];
  followerTiers: [number, number, number, number, number];
};

const FALLBACK_RULES: CommercialRules = {
  freeDiscoveryProfiles: 3,
  premiumSmartSortTrials: 3,
  premiumDailyDownloads: 40,
  shareDailyCap: 10,
  audienceProThreshold: 1000,
  shareTiers: [20, 50, 100],
  followerTiers: [25, 100, 250, 500, 1000],
};

function quota(row: any): QuotaAccess {
  return {
    planCode: String(row?.plan_code || 'FREE'),
    allowed: Boolean(row?.allowed),
    used: Number(row?.used || 0),
    limit: row?.limit_value == null ? null : Number(row.limit_value),
    remaining: row?.remaining == null ? null : Number(row.remaining),
    unlimited: Boolean(row?.unlimited),
  };
}

export async function getDiscoveryAccess(targetProfileId?: string): Promise<DiscoveryAccess> {
  if (!supabase) return { planCode: 'FREE', allowed: true, used: 0, limit: 3, remaining: 3, unlimited: false, newlyCounted: false };
  const { data, error } = await supabase.rpc('keep_discovery_profile_access', { p_target_profile_id: targetProfileId || null });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { ...quota(row), newlyCounted: Boolean(row?.newly_counted) };
}

export async function getSmartSortAccess(consume = false): Promise<QuotaAccess> {
  if (!supabase) return { planCode: 'FREE', allowed: false, used: 0, limit: 0, remaining: 0, unlimited: false };
  const { data, error } = await supabase.rpc('keep_smart_sort_access', { p_consume: consume });
  if (error) throw error;
  return quota(Array.isArray(data) ? data[0] : data);
}

export async function getEventCreationAccess(): Promise<QuotaAccess> {
  if (!supabase) return { planCode: 'FREE', allowed: false, used: 0, limit: 0, remaining: 0, unlimited: false };
  const { data, error } = await supabase.rpc('keep_event_creation_status');
  if (error) throw error;
  return quota(Array.isArray(data) ? data[0] : data);
}

export async function getGrowthRewardStatus(): Promise<GrowthRewardStatus> {
  if (!supabase) return { qualifiedShares: 0, followers: 0, bonusFreeCredits: 0, bonusDiscoveryProfiles: 0, bonusSortTrials: 0, nextShareGoal: 20, audienceProUnlocked: false, audienceProThreshold: 1000 };
  const { data, error } = await supabase.rpc('keep_growth_reward_status');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    qualifiedShares: Number(row?.qualified_shares || 0),
    followers: Number(row?.followers || 0),
    bonusFreeCredits: Number(row?.bonus_free_credits || 0),
    bonusDiscoveryProfiles: Number(row?.bonus_discovery_profiles || 0),
    bonusSortTrials: Number(row?.bonus_sort_trials || 0),
    nextShareGoal: row?.next_share_goal == null ? null : Number(row.next_share_goal),
    audienceProUnlocked: Boolean(row?.audience_pro_unlocked),
    audienceProThreshold: Number(row?.audience_pro_threshold || 1000),
  };
}

export async function getCommercialRules(): Promise<CommercialRules> {
  if (!supabase) return FALLBACK_RULES;
  const { data, error } = await supabase.rpc('keep_commercial_rules');
  if (error || !data || typeof data !== 'object') return FALLBACK_RULES;
  const row: any = data;
  const share = Array.isArray(row.share_tiers) ? row.share_tiers.map(Number) : FALLBACK_RULES.shareTiers;
  const followers = Array.isArray(row.follower_tiers) ? row.follower_tiers.map(Number) : FALLBACK_RULES.followerTiers;
  const shareTiers: [number, number, number] = [share[0] || 20, share[1] || 50, share[2] || 100];
  const followerTiers: [number, number, number, number, number] = [followers[0] || 25, followers[1] || 100, followers[2] || 250, followers[3] || 500, followers[4] || 1000];
  return {
    freeDiscoveryProfiles: Number(row.free_discovery_profiles ?? FALLBACK_RULES.freeDiscoveryProfiles),
    premiumSmartSortTrials: Number(row.premium_smart_sort_trials ?? FALLBACK_RULES.premiumSmartSortTrials),
    premiumDailyDownloads: Number(row.premium_daily_downloads ?? FALLBACK_RULES.premiumDailyDownloads),
    shareDailyCap: Number(row.share_daily_cap ?? FALLBACK_RULES.shareDailyCap),
    audienceProThreshold: followerTiers[4],
    shareTiers,
    followerTiers,
  };
}
