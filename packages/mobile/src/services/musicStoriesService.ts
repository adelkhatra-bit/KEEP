import type { CanonicalTrack } from '@keep/music';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

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

export const STORY_WINDOW_HOURS = 72;
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
