import { supabase } from './supabaseClient';

export type ProfileCertificationTier = 'UNVERIFIED' | 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';

export type PublicProfileSnapshot = {
  directPublicKeeps: number;
  socialPublicKeeps: number;
  totalPublicKeeps: number;
  followers: number;
  following: number;
  accountVerified: boolean;
  planCode: string;
  certificationTier: ProfileCertificationTier;
};

export const EMPTY_PUBLIC_PROFILE_SNAPSHOT: PublicProfileSnapshot = {
  directPublicKeeps: 0,
  socialPublicKeeps: 0,
  totalPublicKeeps: 0,
  followers: 0,
  following: 0,
  accountVerified: false,
  planCode: 'FREE',
  certificationTier: 'UNVERIFIED',
};

function certificationTier(value: unknown): ProfileCertificationTier {
  return value === 'FREE' || value === 'PREMIUM' || value === 'CREATOR_PRO' || value === 'VENUE_PRO'
    ? value
    : 'UNVERIFIED';
}

export async function loadPublicProfileSnapshot(profileId: string): Promise<PublicProfileSnapshot> {
  if (!supabase || !profileId) return EMPTY_PUBLIC_PROFILE_SNAPSHOT;

  const { data, error } = await supabase.rpc('keep_public_profile_snapshot', { p_profile_id: profileId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return EMPTY_PUBLIC_PROFILE_SNAPSHOT;

  return {
    directPublicKeeps: Number(row.direct_public_keeps || 0),
    socialPublicKeeps: Number(row.social_public_keeps || 0),
    totalPublicKeeps: Number(row.total_public_keeps || 0),
    followers: Number(row.followers || 0),
    following: Number(row.following || 0),
    accountVerified: Boolean(row.account_verified),
    planCode: String(row.plan_code || 'FREE'),
    certificationTier: certificationTier(row.certification_tier),
  };
}
