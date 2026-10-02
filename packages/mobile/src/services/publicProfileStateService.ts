import AsyncStorage from '@react-native-async-storage/async-storage';
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
  sourceAvatarUrl?: string | null;
  sourceCertificationTier?: ProfileCertificationTier;
  // Adel (08/09/2026) : "si l'utilisateur est abonné à celui qui a
  // découvert la musique, on met vert, si il est pas abonné, tu le mets
  // rouge ... incité à cliquer dessus" -- calculé pour le VIEWER courant
  // (auth.uid()), jamais pour le propriétaire du profil visité.
  sourceIsFollowing?: boolean;
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
  // Source canonique: le premier utilisateur ayant réellement découvert le titre
  // via Écouter. Une copie/reprise sociale ne peut jamais remplacer ce nom.
  const trackIds = Array.from(new Set(rows.map((row) => row.track.id).filter(Boolean)));
  const firstOrigins = new Map<string, { profileId: string; username: string }>();
  for (let start = 0; start < trackIds.length; start += 100) {
    const { data } = await Promise.resolve(client.rpc('keep_track_first_discoveries', { p_track_ids: trackIds.slice(start, start + 100) })).then((result) => result, () => ({ data: [] as any[] } as any));
    for (const row of (data ?? []) as any[]) if (row?.track_id && row?.profile_id) firstOrigins.set(String(row.track_id), { profileId: String(row.profile_id), username: String(row.username || '') });
  }
  rows = rows.map((row) => {
    const origin = firstOrigins.get(row.track.id);
    return origin ? { ...row, sourceUserId: origin.profileId, sourceProfileId: origin.profileId, sourceUsername: origin.username || row.sourceUsername } : row;
  });
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
  const following = new Set<string>();
  const chunkSize = 100;
  const { data: viewerData } = await client.auth.getUser().catch(() => ({ data: { user: null } }));
  const viewerId = viewerData?.user?.id;
  if (viewerId) {
    for (let start = 0; start < allSourceIds.length; start += chunkSize) {
      const chunk = allSourceIds.slice(start, start + chunkSize);
      const { data, error } = await client.from('follows').select('followee_id').eq('follower_id', viewerId).in('followee_id', chunk);
      if (error) continue;
      for (const row of data ?? []) if (row?.followee_id) following.add(String(row.followee_id));
    }
  }
  const avatarUrls = new Map<string, string | null>();
  for (let start = 0; start < needsUsername.length; start += chunkSize) {
    const chunk = needsUsername.slice(start, start + chunkSize);
    const { data, error } = await client
      .from('profiles')
      .select('id,username,avatar_url')
      .in('id', chunk)
      .eq('is_public', true);
    if (error) continue;
    for (const profile of data ?? []) {
      if (profile?.id && profile?.username) usernames.set(String(profile.id), String(profile.username));
      if (profile?.id) avatarUrls.set(String(profile.id), profile?.avatar_url || null);
    }
  }
  // Fetch avatars for all source profiles
  for (let start = 0; start < allSourceIds.length; start += chunkSize) {
    const chunk = allSourceIds.slice(start, start + chunkSize);
    if (chunk.every((id) => avatarUrls.has(id))) continue; // Already fetched
    const { data, error } = await client
      .from('profiles')
      .select('id,avatar_url')
      .in('id', chunk)
      .eq('is_public', true);
    if (error) continue;
    for (const profile of data ?? []) {
      if (profile?.id && !avatarUrls.has(String(profile.id))) {
        avatarUrls.set(String(profile.id), profile?.avatar_url || null);
      }
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

  if (!usernames.size && !tiers.size && !viewerId && !avatarUrls.size) return rows;
  return rows.map((row) => {
    const sourceId = row.sourceProfileId || row.sourceUserId;
    const sourceUsername = row.sourceUsername || (sourceId ? usernames.get(sourceId) : undefined);
    const sourceAvatarUrl = sourceId ? avatarUrls.get(sourceId) : undefined;
    const sourceCertificationTier = sourceId ? tiers.get(sourceId) : undefined;
    const sourceIsFollowing = viewerId && sourceId ? following.has(sourceId) : undefined;
    if (sourceUsername === row.sourceUsername && sourceAvatarUrl === row.sourceAvatarUrl && sourceCertificationTier === undefined && sourceIsFollowing === undefined) return row;
    return {
      ...row,
      ...(sourceUsername ? { sourceUsername } : {}),
      ...(sourceAvatarUrl !== undefined ? { sourceAvatarUrl } : {}),
      ...(sourceCertificationTier ? { sourceCertificationTier } : {}),
      ...(sourceIsFollowing !== undefined ? { sourceIsFollowing } : {}),
    };
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
const OWN_PROFILE_KEEPS_CACHE_PREFIX = '@keep/own-profile-keeps-v1';

function ownKeepsCacheKey(profileId: string) {
  return `${OWN_PROFILE_KEEPS_CACHE_PREFIX}:${profileId}`;
}

async function readOwnKeepsCache(profileId: string): Promise<PublicProfileKeep[] | null> {
  if (!profileId) return null;
  try {
    const raw = await AsyncStorage.getItem(ownKeepsCacheKey(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PublicProfileKeep[] : null;
  } catch {
    return null;
  }
}

async function writeOwnKeepsCache(profileId: string, rows: PublicProfileKeep[]) {
  if (!profileId) return;
  try {
    // Borne le cache local sans limiter la source serveur. C'est un filet
    // anti-panne, pas une deuxième base de données.
    await AsyncStorage.setItem(ownKeepsCacheKey(profileId), JSON.stringify(rows.slice(0, 1000)));
  } catch {}
}

async function loadPagedKeeps(rpcName: 'keep_public_profile_tracks' | 'keep_own_profile_tracks', args: Record<string, unknown>): Promise<PublicProfileKeep[]> {
  if (!supabase) return [];
  const result: PublicProfileKeep[] = [];
  for (let offset = 0; ; offset += KEEP_PAGE_SIZE) {
    const { data, error } = await supabase.rpc(rpcName, { ...args, p_limit: KEEP_PAGE_SIZE, p_offset: offset });
    if (error) {
      if (rpcName !== 'keep_own_profile_tracks') throw error;

      // Protection globale : le profil propriétaire ne doit jamais devenir
      // vide parce qu'un RPC enrichi est momentanément indisponible. Les
      // keep_decisions + tracks du propriétaire restent la source minimale
      // RLS-safe et permettent de reconstruire toute sa musique sans écrire
      // ni modifier aucune donnée utilisateur.
      const { data: sessionData } = await supabase.auth.getSession();
      const profileId = sessionData.session?.user?.id;
      if (!profileId) throw error;

      const base = await supabase
        .from('keep_decisions')
        .select('id,track_id,visibility,created_at,context,source_user_id,source_type')
        .eq('profile_id', profileId)
        .eq('decision', 'KEPT')
        .order('created_at', { ascending: true })
        .range(offset, offset + KEEP_PAGE_SIZE - 1);
      if (base.error) throw error;

      const decisions = Array.isArray(base.data) ? base.data : [];
      const trackIds = Array.from(new Set(decisions.map((row: any) => String(row?.track_id || '')).filter(Boolean)));
      const trackMap = new Map<string, any>();
      for (let start = 0; start < trackIds.length; start += 100) {
        const trackResult = await supabase
          .from('tracks')
          .select('id,isrc,title,artist,album,duration_sec,artwork_url,genres,provider_ids,preview_url,available_on,external_urls')
          .in('id', trackIds.slice(start, start + 100));
        if (trackResult.error) throw error;
        for (const track of trackResult.data ?? []) if (track?.id) trackMap.set(String(track.id), track);
      }

      for (const row of decisions as any[]) {
        const track = trackMap.get(String(row?.track_id || ''));
        if (!track) continue;
        result.push(normalizeKeepRow({
          decision_id: row.id,
          kept_at: row.created_at,
          visibility: row.visibility,
          context: row.context,
          source_user_id: row.source_user_id,
          source_type: row.source_type,
          track_id: track.id,
          isrc: track.isrc,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration_sec: track.duration_sec,
          artwork_url: track.artwork_url,
          genres: track.genres,
          provider_ids: track.provider_ids,
          preview_url: track.preview_url,
          available_on: track.available_on,
          external_urls: track.external_urls,
        }, row.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'));
      }
      if (decisions.length < KEEP_PAGE_SIZE) break;
      continue;
    }

    const rows = Array.isArray(data) ? data : [];
    for (const row of rows as any[]) result.push(normalizeKeepRow(row));
    if (rows.length < KEEP_PAGE_SIZE) break;
  }
  return hydrateSourceUsernamesWithinBudget(result);
}

// ERR-PROFILE-QUEUE-STARVATION-031 : les musiques étaient déjà reçues mais
// restaient cachées tant que l'enrichissement « découvreur » (pseudo, avatar,
// certification, suivi) n'avait pas fini -- jusqu'à 75 s de plus sur un
// Supabase lent. Sur un serveur normal l'enrichissement finit bien avant ce
// délai et rien ne change à l'écran ; sur un serveur saturé, les musiques
// s'affichent quand même et les pseudos complets arrivent au rafraîchissement
// suivant. Aucune donnée n'est modifiée.
const SOURCE_HYDRATION_BUDGET_MS = 6000;

async function hydrateSourceUsernamesWithinBudget(rows: PublicProfileKeep[]): Promise<PublicProfileKeep[]> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SOURCE_HYDRATION_BUDGET_MS);
  });
  try {
    const enriched = await Promise.race([hydrateSourceUsernames(rows).catch(() => rows), budget]);
    return enriched ?? rows;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadPublicProfileKeeps(profileId: string): Promise<PublicProfileKeep[]> {
  if (!profileId) return [];
  return loadPagedKeeps('keep_public_profile_tracks', { p_profile_id: profileId });
}

export type ProfileRepriser = {
  profileId: string;
  username: string;
  avatarUrl: string | null;
  kind: string;
  certificationTier: ProfileCertificationTier;
  favoriteGenres: string[];
  repriseCount: number;
  isFollowing: boolean;
};

/**
 * Adel (07/09/2026) : "il faut trouver une solution pour voir directement la
 * musique qu'a pris un autre utilisateur ... pour inciter les gens à
 * s'abonner entre eux" -- qui a repris les morceaux de ce profil, avec leur
 * style musical et s'ils sont déjà suivis, pour proposer de s'abonner en un
 * geste.
 */
export async function loadProfileReprisers(profileId: string, limit = 16): Promise<ProfileRepriser[]> {
  if (!supabase || !profileId) return [];
  const { data, error } = await supabase.rpc('keep_profile_reprisers_page', { p_profile_id: profileId, p_limit: Math.max(1, Math.min(limit, 40)) });
  if (error || !Array.isArray(data)) return [];
  return data.map((row: any) => ({
    profileId: String(row.profile_id),
    username: String(row.username || 'keep-user'),
    avatarUrl: row.avatar_url || null,
    kind: String(row.kind || 'USER'),
    certificationTier: certificationTier(row.certification_tier),
    favoriteGenres: Array.isArray(row.favorite_genres) ? row.favorite_genres.map(String) : [],
    repriseCount: Number(row.reprise_count || 0),
    isFollowing: Boolean(row.is_following),
  }));
}

export async function loadOwnProfileKeeps(): Promise<PublicProfileKeep[]> {
  // Le RPC propriétaire est la source canonique du propriétaire : PUBLIC +
  // PRIVATE. Les morceaux privés restent visibles uniquement sur SON écran.
  if (!supabase) return [];
  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
  const profileId = sessionData.session?.user?.id ? String(sessionData.session.user.id) : '';

  try {
    const rows = await loadPagedKeeps('keep_own_profile_tracks', {});
    if (profileId) void writeOwnKeepsCache(profileId, rows);
    return rows;
  } catch (error) {
    // Incident réel 02/10/2026 : Supabase peut répondre 503/504 alors que les
    // 46+ morceaux de l'utilisateur sont toujours en base. Dans ce cas on
    // affiche le dernier snapshot local au lieu de faire croire à une suppression.
    const cached = profileId ? await readOwnKeepsCache(profileId) : null;
    if (cached) return cached;
    throw error;
  }
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
