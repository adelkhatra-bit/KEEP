import { CanonicalTrack } from '@keep/music';
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

export type OwnProfileSnapshot = {
  directKeeps: number;
  socialKeeps: number;
  totalKeeps: number;
  publicKeeps: number;
  privateKeeps: number;
};

export type DiscoveryImpact = {
  originProfileId: string;
  recoveryCount: number;
  uniqueUsers: number;
};

export type PublicProfileKeep = {
  decisionId: string;
  keptAt: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  track: CanonicalTrack;
  sourceUserId?: string;
  sourceProfileId?: string;
  sourceUsername?: string;
  sourceCertificationTier?: ProfileCertificationTier;
  sourceType?: string;
  creditSource: 'LISTEN' | 'SOCIAL';
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

export const EMPTY_OWN_PROFILE_SNAPSHOT: OwnProfileSnapshot = {
  directKeeps: 0,
  socialKeeps: 0,
  totalKeeps: 0,
  publicKeeps: 0,
  privateKeeps: 0,
};

function certificationTier(value: unknown): ProfileCertificationTier {
  return value === 'FREE' || value === 'PREMIUM' || value === 'CREATOR_PRO' || value === 'VENUE_PRO'
    ? value
    : 'UNVERIFIED';
}

function normalizeKeepRow(row: any, fallbackVisibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC'): PublicProfileKeep {
  const context = row?.context && typeof row.context === 'object' ? row.context : {};
  const sourceProfileId = row?.source_user_id || context.sourceProfileId
    ? String(row?.source_user_id || context.sourceProfileId)
    : undefined;
  const social = Boolean(
    sourceProfileId
    || row?.source_type === 'profile'
    || context.creditPolicy === 'SOCIAL_ZERO_CREDIT',
  );
  return {
    decisionId: String(row?.decision_id || ''),
    keptAt: String(row?.kept_at || ''),
    visibility: row?.visibility === 'PRIVATE' ? 'PRIVATE' : fallbackVisibility,
    track: {
      id: String(row?.track_id || ''),
      isrc: row?.isrc || undefined,
      title: row?.title || 'Titre inconnu',
      artist: row?.artist || 'Artiste inconnu',
      album: row?.album || undefined,
      durationSec: row?.duration_sec || undefined,
      artworkUrl: row?.artwork_url || undefined,
      genres: Array.isArray(row?.genres) ? row.genres : [],
      providerIds: row?.provider_ids && typeof row.provider_ids === 'object' ? row.provider_ids : {},
      previewUrl: row?.preview_url || undefined,
      availableOn: Array.isArray(row?.available_on) ? row.available_on : [],
      externalUrls: row?.external_urls && typeof row.external_urls === 'object' ? row.external_urls : {},
    },
    sourceUserId: row?.source_user_id ? String(row.source_user_id) : undefined,
    sourceProfileId,
    sourceUsername: context.sourceUsername ? String(context.sourceUsername) : undefined,
    sourceType: row?.source_type ? String(row.source_type) : undefined,
    creditSource: social ? 'SOCIAL' : 'LISTEN',
  };
}

// Adel (07/09/2026) : "quand un utilisateur repartage la musique, elle est
// toujours tamponnée avec le code couleur de la certification ... hormis si
// demain il arrête son abonnement, le système le détecte et remet en vert" --
// la couleur d'attribution doit toujours venir d'un calcul EN DIRECT de la
// formule actuelle du découvreur, jamais d'une valeur figée au moment du
// partage. keep_public_certification_tiers recalcule à chaque chargement.
async function hydrateSourceUsernames(rows: PublicProfileKeep[]): Promise<PublicProfileKeep[]> {
  if (!supabase || !rows.length) return rows;
  const client = supabase;
  const allSourceIds = Array.from(new Set(rows
    .map((row) => row.sourceProfileId || row.sourceUserId)
    .filter(Boolean) as string[]));
  const needsUsername = Array.from(new Set(rows
    .filter((row) => !row.sourceUsername)
    .map((row) => row.sourceProfileId || row.sourceUserId)
    .filter(Boolean) as string[]));
  if (!allSourceIds.length) return rows;

  const usernames = new Map<string, string>();
  const tiers = new Map<string, ProfileCertificationTier>();
  const chunkSize = 100;
  for (let start = 0; start < needsUsername.length; start += chunkSize) {
    const chunk = needsUsername.slice(start, start + chunkSize);
    const { data, error } = await client
      .from('profiles')
      .select('id,username')
      .in('id', chunk)
      .eq('is_public', true);
    if (error) continue;
    for (const profile of data ?? []) {
      if (profile?.id && profile?.username) usernames.set(String(profile.id), String(profile.username));
    }
  }
  for (let start = 0; start < allSourceIds.length; start += chunkSize) {
    const chunk = allSourceIds.slice(start, start + chunkSize);
    const { data, error } = await client.rpc('keep_public_certification_tiers', { p_profile_ids: chunk });
    if (error) continue;
    for (const row of (data ?? []) as Array<{ profile_id: string; certification_tier: string }>) {
      if (row?.profile_id) tiers.set(String(row.profile_id), certificationTier(row.certification_tier));
    }
  }

  if (!usernames.size && !tiers.size) return rows;
  return rows.map((row) => {
    const sourceId = row.sourceProfileId || row.sourceUserId;
    const sourceUsername = row.sourceUsername || (sourceId ? usernames.get(sourceId) : undefined);
    const sourceCertificationTier = sourceId ? tiers.get(sourceId) : undefined;
    if (sourceUsername === row.sourceUsername && sourceCertificationTier === undefined) return row;
    return { ...row, ...(sourceUsername ? { sourceUsername } : {}), ...(sourceCertificationTier ? { sourceCertificationTier } : {}) };
  });
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

export async function loadOwnProfileSnapshot(): Promise<OwnProfileSnapshot> {
  if (!supabase) return EMPTY_OWN_PROFILE_SNAPSHOT;
  const { data, error } = await supabase.rpc('keep_own_profile_snapshot');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return EMPTY_OWN_PROFILE_SNAPSHOT;
  return {
    directKeeps: Number(row.direct_keeps || 0),
    socialKeeps: Number(row.social_keeps || 0),
    totalKeeps: Number(row.total_keeps || 0),
    publicKeeps: Number(row.public_keeps || 0),
    privateKeeps: Number(row.private_keeps || 0),
  };
}

const KEEP_PAGE_SIZE = 250;

async function loadPagedKeeps(rpcName: 'keep_public_profile_tracks' | 'keep_own_profile_tracks', args: Record<string, unknown>): Promise<PublicProfileKeep[]> {
  if (!supabase) return [];
  const result: PublicProfileKeep[] = [];
  for (let offset = 0; ; offset += KEEP_PAGE_SIZE) {
    const { data, error } = await supabase.rpc(rpcName, { ...args, p_limit: KEEP_PAGE_SIZE, p_offset: offset });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    for (const row of rows as any[]) result.push(normalizeKeepRow(row));
    if (rows.length < KEEP_PAGE_SIZE) break;
  }
  return hydrateSourceUsernames(result);
}

export async function loadPublicProfileKeeps(profileId: string): Promise<PublicProfileKeep[]> {
  if (!profileId) return [];
  return loadPagedKeeps('keep_public_profile_tracks', { p_profile_id: profileId });
}

export async function loadOwnProfileKeeps(): Promise<PublicProfileKeep[]> {
  // Le RPC propriétaire conserve PUBLIC + PRIVATE pour l'identité canonique et
  // l'anti-doublon. Cette couche est exclusivement destinée à l'écran Profil :
  // elle ne doit jamais lui livrer une décision privée à rendre visuellement.
  const rows = await loadPagedKeeps('keep_own_profile_tracks', {});
  return rows.filter((row) => row.visibility === 'PUBLIC');
}

export async function loadProfileDiscoveryImpacts(profileId: string): Promise<Record<string, DiscoveryImpact>> {
  if (!supabase || !profileId) return {};
  const { data, error } = await supabase.rpc('keep_profile_discovery_impacts', { p_profile_id: profileId });
  if (error) throw error;
  const impacts: Record<string, DiscoveryImpact> = {};
  for (const row of Array.isArray(data) ? data : []) {
    const trackId = String(row?.track_id || '');
    const originProfileId = String(row?.origin_profile_id || '');
    if (!trackId || !originProfileId) continue;
    impacts[trackId] = {
      originProfileId,
      recoveryCount: Number(row?.recovery_count || 0),
      uniqueUsers: Number(row?.unique_users || 0),
    };
  }
  return impacts;
}
