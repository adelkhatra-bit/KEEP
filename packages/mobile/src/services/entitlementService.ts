import { loadCurrentPlanCode } from './planService';

export type PlanCode = 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';
export type PaidFeature =
  | 'PROFILE_SHARE'
  | 'PUBLIC_PLAYLISTS'
  | 'CREATOR_KIND'
  | 'VENUE_KIND'
  | 'CREATE_EVENT'
  | 'BROADCAST_FOLLOWERS'
  | 'CREATOR_ANALYTICS';

const ACCESS: Record<PaidFeature, PlanCode[]> = {
  PROFILE_SHARE: ['PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'],
  PUBLIC_PLAYLISTS: ['PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'],
  CREATOR_KIND: ['CREATOR_PRO', 'VENUE_PRO'],
  VENUE_KIND: ['VENUE_PRO'],
  CREATE_EVENT: ['CREATOR_PRO', 'VENUE_PRO'],
  BROADCAST_FOLLOWERS: ['CREATOR_PRO', 'VENUE_PRO'],
  CREATOR_ANALYTICS: ['CREATOR_PRO', 'VENUE_PRO'],
};

export const FEATURE_PLAN: Record<PaidFeature, PlanCode> = {
  PROFILE_SHARE: 'PREMIUM',
  PUBLIC_PLAYLISTS: 'PREMIUM',
  CREATOR_KIND: 'CREATOR_PRO',
  VENUE_KIND: 'VENUE_PRO',
  CREATE_EVENT: 'CREATOR_PRO',
  BROADCAST_FOLLOWERS: 'CREATOR_PRO',
  CREATOR_ANALYTICS: 'CREATOR_PRO',
};

export function hasFeature(planCode: string | null | undefined, feature: PaidFeature) {
  return ACCESS[feature].includes((planCode || 'FREE') as PlanCode);
}

export function requiredPlan(feature: PaidFeature) {
  return FEATURE_PLAN[feature];
}

export async function loadEntitlements(profileId: string) {
  const planCode = (await loadCurrentPlanCode(profileId)) as PlanCode;
  return {
    planCode,
    canShareProfile: hasFeature(planCode, 'PROFILE_SHARE'),
    canExposePlaylists: hasFeature(planCode, 'PUBLIC_PLAYLISTS'),
    canUseCreatorKind: hasFeature(planCode, 'CREATOR_KIND'),
    canUseVenueKind: hasFeature(planCode, 'VENUE_KIND'),
    canCreateEvent: hasFeature(planCode, 'CREATE_EVENT'),
    canBroadcastFollowers: hasFeature(planCode, 'BROADCAST_FOLLOWERS'),
  };
}

/**
 * Quand un abonnement n'est plus TRIALING/ACTIVE, loadCurrentPlanCode retourne
 * FREE automatiquement. Le compte, le profil et les données restent conservés,
 * mais les fonctions payantes ci-dessus redeviennent verrouillées.
 */
