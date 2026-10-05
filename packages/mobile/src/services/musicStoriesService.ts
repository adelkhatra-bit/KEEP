import type { CanonicalTrack } from '@keep/music';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { loadPlaylistSaleProfilePreviewSampler } from './playlistSaleService';

/**
 * Stories musicales Loki (Adel, 05/10/2026).
 *
 * Une story = les morceaux GARDÉS en Public récemment par un autre membre.
 * Aucune nouvelle table : on lit uniquement des données déjà publiques
 * (policy keep_decisions_select_public, follows_select_all, tracks_select_all).
 *
 * Qui apparaît dans la rangée :
 *  - les profils que l'utilisateur suit ;
 *  - les « passionnés » du même style : profils dont les morceaux récents
 *    partagent un genre avec les styles déclarés/déduits de l'utilisateur.
 * Ordre : la story la plus récente en premier ; un profil suivi passe devant
 * à fraîcheur égale (même heure). Plafond MAX_STORY_PROFILES pour que
 * l'utilisateur ne soit jamais noyé sous des centaines de stories.
 */

// Adel (05/10/2026) : uniquement les choses du jour.
export const STORY_WINDOW_HOURS = 24;
export const MAX_STORY_PROFILES = 15;
const MAX_TRACKS_PER_STORY = 10;
const SEEN_KEY_PREFIX = 'keep:music-stories:seen:v1:';

export type MusicStory = {
  profileId: string;
  username: string;
  avatarUrl: string | null;
  latestAt: string;
  followed: boolean;
  sameStyle: boolean;
  tracks: CanonicalTrack[];
};

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();

function toList(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).map(norm).filter(Boolean);
}

export function rankMusicStories(
  rows: any[],
  viewerId: string,
  followedIds: Set<string>,
  viewerGenres: Set<string>,
): MusicStory[] {
  const byProfile = new Map<string, MusicStory>();
  for (const row of rows) {
    const profileId = String(row?.profile_id ?? '').trim();
    const profile = row?.profile;
    const track = row?.track;
    if (!profileId || profileId === viewerId || !profile || !track?.id) continue;
    const title = String(track.title ?? '').trim();
    const artist = String(track.artist ?? '').trim();
    const username = String(profile.username ?? '').trim();
    if (!title || !artist || !username) continue;

    const genres = toList(track.genres);
    const sameStyleTrack = genres.some((genre) => viewerGenres.has(genre));
    const followed = followedIds.has(profileId);
    // Ni suivi ni même style : pas dans la rangée (évite le bruit).
    if (!followed && !sameStyleTrack) continue;

    let story = byProfile.get(profileId);
    if (!story) {
      story = {
        profileId,
        username,
        avatarUrl: profile.avatar_url ? String(profile.avatar_url) : null,
        latestAt: String(row.created_at ?? ''),
        followed,
        sameStyle: sameStyleTrack,
        tracks: [],
      };
      byProfile.set(profileId, story);
    }
    if (String(row.created_at ?? '') > story.latestAt) story.latestAt = String(row.created_at);
    story.sameStyle = story.sameStyle || sameStyleTrack;
    if (story.tracks.length >= MAX_TRACKS_PER_STORY || story.tracks.some((item) => item.id === track.id)) continue;
    story.tracks.push({
      id: String(track.id),
      title,
      artist,
      album: track.album ? String(track.album) : undefined,
      artworkUrl: track.artwork_url ? String(track.artwork_url) : undefined,
      previewUrl: track.preview_url ? String(track.preview_url) : undefined,
      genres: Array.isArray(track.genres) ? track.genres.map(String) : [],
      providerIds: track.provider_ids && typeof track.provider_ids === 'object' ? track.provider_ids : {},
      externalUrls: track.external_urls && typeof track.external_urls === 'object' ? track.external_urls : {},
      availableOn: Array.isArray(track.available_on) ? track.available_on.map(String) : [],
    } as CanonicalTrack);
  }

  return Array.from(byProfile.values())
    .filter((story) => story.tracks.length > 0)
    .sort((a, b) => {
      const hourA = a.latestAt.slice(0, 13);
      const hourB = b.latestAt.slice(0, 13);
      if (hourA !== hourB) return hourA < hourB ? 1 : -1;
      if (a.followed !== b.followed) return a.followed ? -1 : 1;
      return a.latestAt < b.latestAt ? 1 : -1;
    })
    .slice(0, MAX_STORY_PROFILES);
}

export async function loadMusicStories(viewerId: string): Promise<MusicStory[]> {
  if (!supabase || !viewerId) return [];
  const since = new Date(Date.now() - STORY_WINDOW_HOURS * 3600 * 1000).toISOString();

  const [decisions, follows, me] = await Promise.all([
    supabase
      .from('keep_decisions')
      .select('profile_id,created_at,track:tracks(id,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on),profile:profiles!keep_decisions_profile_id_fkey(username,avatar_url,discovery_hidden)')
      .eq('decision', 'KEPT')
      .eq('visibility', 'PUBLIC')
      .gte('created_at', since)
      .neq('profile_id', viewerId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('follows').select('followee_id').eq('follower_id', viewerId).limit(1000),
    supabase.from('profiles').select('favorite_genres,inferred_genres').eq('id', viewerId).maybeSingle(),
  ]);
  if (decisions.error) throw decisions.error;

  const followedIds = new Set((follows.data ?? []).map((row: any) => String(row.followee_id)));
  const viewerGenres = new Set([...toList((me.data as any)?.favorite_genres), ...toList((me.data as any)?.inferred_genres)]);
  const rows = (decisions.data ?? []).filter((row: any) => !row?.profile?.discovery_hidden || followedIds.has(String(row.profile_id)));
  return rankMusicStories(rows, viewerId, followedIds, viewerGenres);
}

/** Anneau gris une fois la story vue jusqu'à sa dernière nouveauté. */
export async function loadSeenStories(viewerId: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(`${SEEN_KEY_PREFIX}${viewerId}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function markStorySeen(viewerId: string, story: MusicStory): Promise<Record<string, string>> {
  const seen = await loadSeenStories(viewerId);
  seen[story.profileId] = story.latestAt;
  try { await AsyncStorage.setItem(`${SEEN_KEY_PREFIX}${viewerId}`, JSON.stringify(seen)); } catch {}
  return seen;
}

/**
 * Ta propre story (Adel, 05/10/2026) : UNIQUEMENT ce que tu as partagé sur ton
 * compte (GARDER en Public, 24 h) + tes musiques mises en vente. Les musiques
 * simplement identifiées ou masquées n'y sont PLUS : elles restent dans ton
 * historique. Aucune musique ne disparaît de ton profil quand la story est vue.
 */
export async function loadOwnStory(
  viewer: { id: string; username: string; avatarUrl?: string | null },
): Promise<MusicStory | null> {
  if (!supabase || !viewer?.id) return null;
  const since = new Date(Date.now() - STORY_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('keep_decisions')
    .select('profile_id,created_at,track:tracks(id,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on),profile:profiles!keep_decisions_profile_id_fkey(username,avatar_url,discovery_hidden)')
    .eq('decision', 'KEPT')
    .eq('visibility', 'PUBLIC')
    .eq('profile_id', viewer.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  // viewerId neutre : la règle « jamais soi-même » ne s'applique pas à sa propre story.
  const shared = rankMusicStories(data ?? [], '__own__', new Set([viewer.id]), new Set())[0] ?? null;
  const base: MusicStory = shared
    ? { ...shared, username: viewer.username, avatarUrl: viewer.avatarUrl ?? shared.avatarUrl }
    : { profileId: viewer.id, username: viewer.username, avatarUrl: viewer.avatarUrl ?? null, latestAt: '', followed: false, sameStyle: false, tracks: [] };
  const [withSales] = await enrichStoriesWithSales([base]);
  if (!withSales.tracks.length) return null;
  return { ...withSales, latestAt: withSales.latestAt || new Date().toISOString() };
}

/**
 * Musiques EN VENTE dans les stories (Adel, 05/10/2026) : la boutique d'un
 * profil apparaît dans sa story. Règle existante des ventes : le titre reste
 * masqué, le son est audible. Appuyer sur ces cartes mène à la boutique du
 * vendeur (jamais de GARDER direct sur une musique à vendre). Une fois la story
 * vue, elle se grise puis passe après ; la musique reste toujours sur le profil.
 */
export const SALE_TRACK_PREFIX = 'sale:';
const MAX_SALE_TRACKS_PER_STORY = 3;
const MAX_STORIES_WITH_SALES = 8;

export function isSaleStoryTrack(track: { id?: string } | null | undefined): boolean {
  return String(track?.id ?? '').startsWith(SALE_TRACK_PREFIX);
}

export function saleSampleToTrack(sample: { trackId: string; previewUrl: string }, sellerUsername: string): CanonicalTrack {
  return {
    id: `${SALE_TRACK_PREFIX}${sample.trackId}`,
    title: 'Musique en vente',
    artist: `Boutique de @${sellerUsername}`,
    previewUrl: sample.previewUrl,
    genres: [],
    providerIds: {},
    externalUrls: {},
    availableOn: [],
  } as CanonicalTrack;
}

export function mergeSaleTracks(story: MusicStory, samples: Array<{ trackId: string; previewUrl: string }>): MusicStory {
  const known = new Set(story.tracks.map((track) => track.id));
  const extra = samples
    .map((sample) => saleSampleToTrack(sample, story.username))
    .filter((track) => {
      if (known.has(track.id)) return false;
      known.add(track.id); // jamais deux fois la même musique dans une story
      return true;
    })
    .slice(0, MAX_SALE_TRACKS_PER_STORY);
  return extra.length ? { ...story, tracks: [...story.tracks, ...extra] } : story;
}

export async function enrichStoriesWithSales(stories: MusicStory[]): Promise<MusicStory[]> {
  const head = stories.slice(0, MAX_STORIES_WITH_SALES);
  const results = await Promise.allSettled(head.map((story) => loadPlaylistSaleProfilePreviewSampler(story.profileId)));
  return stories.map((story, index) => {
    const result = index < head.length ? results[index] : null;
    return result && result.status === 'fulfilled' ? mergeSaleTracks(story, result.value) : story;
  });
}

/** Vues en dernier (grisées), nouveautés d'abord ; ordre d'origine conservé dans chaque groupe. */
export function orderStoriesForBar(stories: MusicStory[], seen: Record<string, string>): MusicStory[] {
  const isNew = (story: MusicStory) => (seen[story.profileId] || '') < story.latestAt;
  return [...stories.filter(isNew), ...stories.filter((story) => !isNew(story))];
}
