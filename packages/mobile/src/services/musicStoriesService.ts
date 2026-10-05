import type { CanonicalTrack } from '@keep/music';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { loadMyOfferedTrackIds, loadPlaylistSaleProfilePreviewSampler } from './playlistSaleService';
import { startStoryWatch } from './storyWatchService';

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
  /** Date d'ajout de chaque musique (ISO) : « ajoutée il y a 2 h 03 · encore visible 21 h 57 ». */
  addedAt?: Record<string, string>;
  /** Dernière connexion connue (ISO) : à égalité de dernière story, le dernier connecté passe devant. */
  lastSeenAt?: string;
  /** Suggestion (ex. a repris une de tes musiques) : pas une story, un raccourci vers son profil. */
  suggestion?: boolean;
  /** Suggestion d'ami par style musical (aucun lien encore) : appui = profil, jamais de story. */
  styleMatch?: boolean;
  /** Infos d'achat des musiques EN VENTE de cette story (clé = id « sale:<id> ») : nombre de titres et prix, pour l'étiquette PAYANT. */
  saleInfo?: Record<string, SaleStoryInfo>;
};

export type SaleStoryInfo = { count: number; priceLabel: string; mode: 'MONEY' | 'FREE' | 'BOTH' };

/** Prix lisible d'une offre : « 2,00 € » (PayPal), « 3 FREE » ou « 2,00 € ou 3 FREE ». */
export function formatSaleOfferPrice(mode: string, priceCents: number, freePrice: number | null, currencyCode = 'EUR'): string {
  const symbol = ({ EUR: '€', USD: '$', GBP: '£' } as Record<string, string>)[String(currencyCode).toUpperCase()] ?? String(currencyCode).toUpperCase();
  const money = `${(Math.max(0, priceCents) / 100).toFixed(2).replace('.', ',')} ${symbol}`;
  const free = `${Math.max(0, Number(freePrice ?? 0))} FREE`;
  const normalized = String(mode).toUpperCase();
  if (normalized === 'FREE') return free;
  if (normalized === 'BOTH') return `${money} ou ${free}`;
  return money;
}

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
    story.addedAt = { ...(story.addedAt ?? {}), [String(track.id)]: String(row.created_at ?? '') };
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

/**
 * Qui peut apparaître dans ma rangée (Adel, 05/10/2026) : uniquement les membres LIÉS à moi.
 *  - ceux que je suis ;
 *  - ceux qui me suivent (« il s'est abonné » = comme abonné) ;
 *  - ceux qui ont repris une de mes musiques ;
 *  - ceux dont j'ai repris une musique.
 * Un membre sans aucun lien (même s'il aime le même style) n'envoie ni story ni notification.
 */
export type StoryRelations = { following: string[]; others: string[]; partial?: boolean };
export async function loadStoryRelations(viewerId: string): Promise<StoryRelations> {
  if (!supabase || !viewerId) return { following: [], others: [] };
  const [followingRes, followersRes, reprisersRes, sourcesRes] = await Promise.all([
    supabase.from('follows').select('followee_id').eq('follower_id', viewerId).limit(500),
    supabase.from('follows').select('follower_id,created_at').eq('followee_id', viewerId).order('created_at', { ascending: false }).limit(200),
    supabase.from('keep_decisions').select('profile_id,created_at').eq('source_user_id', viewerId).eq('decision', 'KEPT').neq('profile_id', viewerId).order('created_at', { ascending: false }).limit(200),
    supabase.from('keep_decisions').select('source_user_id,created_at').eq('profile_id', viewerId).eq('decision', 'KEPT').not('source_user_id', 'is', null).neq('source_user_id', viewerId).order('created_at', { ascending: false }).limit(200),
  ]);
  // Adel (05/10/2026) : « il n'a même pas les bulles ». Une erreur serveur (session expirée, 504) était lue comme « aucun lien » :
  // la rangée restait vide sans le dire. Une requête indispensable en erreur = on LÈVE l'erreur (l'écran garde ce qu'il affiche et réessaie).
  if (followingRes.error || followersRes.error) throw (followingRes.error || followersRes.error);
  const following = (followingRes.data ?? []).map((row: any) => String(row.followee_id)).filter(Boolean);
  const followingSet = new Set(following);
  const others: string[] = [];
  const add = (id: unknown) => { const v = String(id ?? ''); if (v && v !== viewerId && !followingSet.has(v) && !others.includes(v)) others.push(v); };
  for (const row of (reprisersRes.data ?? []) as any[]) add(row.profile_id);
  for (const row of (followersRes.data ?? []) as any[]) add(row.follower_id);
  for (const row of (sourcesRes.data ?? []) as any[]) add(row.source_user_id);
  return { following, others: others.slice(0, 60), partial: Boolean(reprisersRes.error || sourcesRes.error) };
}

export async function loadMusicStories(viewerId: string, knownRelations?: StoryRelations): Promise<MusicStory[]> {
  if (!supabase || !viewerId) return [];
  const since = new Date(Date.now() - STORY_WINDOW_HOURS * 3600 * 1000).toISOString();

  const [decisions, relations, pins] = await Promise.all([
    supabase
      .from('keep_decisions')
      .select('profile_id,created_at,track:tracks(id,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on),profile:profiles!keep_decisions_profile_id_fkey(username,avatar_url,discovery_hidden)')
      .eq('decision', 'KEPT')
      .eq('visibility', 'PUBLIC')
      .gte('created_at', since)
      .neq('profile_id', viewerId)
      .order('created_at', { ascending: false })
      .limit(300),
    knownRelations ? Promise.resolve(knownRelations) : loadStoryRelations(viewerId).catch(() => ({ following: [] as string[], others: [] as string[] })),
    // Adel (05/10/2026) : « si dans les 24 h un utilisateur a utilisé une story, je la verrai automatiquement » : les musiques épinglées
    // avec le « + » comptent comme les GARDER publics (les épingles masquées / en vente passent par enrichStoriesWithSales).
    supabase
      .from('story_pins')
      .select('profile_id,pinned_at,track:tracks(id,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on)')
      .eq('masked', false)
      .gte('pinned_at', since)
      .neq('profile_id', viewerId)
      .order('pinned_at', { ascending: false })
      .limit(100),
  ]);
  if (decisions.error) throw decisions.error;

  const followingSet = new Set(relations.following);
  // Éligibles = membres liés à moi (je les suis, ils me suivent, reprises dans un sens ou l'autre). Jamais le « même style » seul.
  const eligibleIds = new Set([...relations.following, ...relations.others]);
  let pinRows: any[] = [];
  const pinData = pins.error ? [] : (pins.data ?? []) as any[];
  if (pinData.length) {
    const { data: pinProfiles } = await supabase.from('profiles').select('id,username,avatar_url,discovery_hidden').in('id', Array.from(new Set(pinData.map((row) => String(row.profile_id)))));
    const byId = new Map((pinProfiles ?? []).map((row: any) => [String(row.id), row]));
    const maskedByProfile = await loadMaskedStoryPins(Array.from(byId.keys())).catch(() => new Map<string, Array<{ trackId: string }>>());
    pinRows = pinData
      .filter((row) => !(maskedByProfile.get(String(row.profile_id)) ?? []).some((masked) => masked.trackId === String(row.track?.id ?? '')))
      .map((row) => ({ profile_id: row.profile_id, created_at: row.pinned_at, track: row.track, profile: byId.get(String(row.profile_id)) }))
      .filter((row) => row.profile);
  }
  const rows = [...(decisions.data ?? []), ...pinRows]
    .filter((row: any) => !row?.profile?.discovery_hidden || followingSet.has(String(row.profile_id)))
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
  return rankMusicStories(rows, viewerId, eligibleIds, new Set())
    .map((story) => ({ ...story, followed: followingSet.has(story.profileId) }));
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
export async function loadProfileStory(
  viewer: { id: string; username: string; avatarUrl?: string | null },
): Promise<MusicStory | null> {
  if (!supabase || !viewer?.id) return null;
  const since = new Date(Date.now() - STORY_WINDOW_HOURS * 3600 * 1000).toISOString();
  const TRACK_COLS = 'id,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on';
  const [decisions, pins] = await Promise.all([
    supabase
      .from('keep_decisions')
      .select(`profile_id,created_at,track:tracks(${TRACK_COLS}),profile:profiles!keep_decisions_profile_id_fkey(username,avatar_url,discovery_hidden)`)
      .eq('decision', 'KEPT')
      .eq('visibility', 'PUBLIC')
      .eq('profile_id', viewer.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    // « + » de la story : musiques épinglées à la main (gardées en public), même fenêtre de 24 h.
    supabase
      .from('story_pins')
      .select(`profile_id,pinned_at,masked,track:tracks(${TRACK_COLS})`)
      .eq('profile_id', viewer.id)
      .gte('pinned_at', since)
      .order('pinned_at', { ascending: false })
      .limit(30),
  ]);
  if (decisions.error) throw decisions.error;
  const profileStub = { username: viewer.username, avatar_url: viewer.avatarUrl ?? null, discovery_hidden: false };
  // Une épingle masquée / en vente ne s'affiche JAMAIS avec son vrai titre : elle revient par enrichStoriesWithSales (carte « Musique en vente »).
  const maskedOwn = await loadMaskedStoryPins([viewer.id]).catch(() => new Map<string, Array<{ trackId: string }>>());
  const maskedOwnIds = new Set((maskedOwn.get(viewer.id) ?? []).map((row) => row.trackId));
  const pinRows = (pins.error ? [] : pins.data ?? [])
    .filter((row: any) => !maskedOwnIds.has(String(row.track?.id ?? '')) && !row.masked)
    .map((row: any) => ({ profile_id: row.profile_id, created_at: row.pinned_at, track: row.track, profile: profileStub }));
  // La plus récente d'abord : une épingle récente passe devant.
  const allRows = [...(decisions.data ?? []), ...pinRows].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
  // Musique à moi EN VENTE (même gardée en public) : jamais en clair dans ma story, elle y passe masquée (« Musique en vente »).
  let offeredOwn = new Set<string>();
  try { offeredOwn = new Set(Object.keys(await loadMyOfferedTrackIds())); } catch { /* ventes inconnues : lecture normale */ }
  const maskedFromRows = allRows
    .filter((row: any) => offeredOwn.has(String(row.track?.id ?? '')) && row.track?.preview_url)
    .map((row: any) => ({ trackId: String(row.track.id), previewUrl: String(row.track.preview_url), pinnedAt: String(row.created_at) }));
  const rows = allRows.filter((row: any) => !offeredOwn.has(String(row.track?.id ?? '')));
  // viewerId neutre : la règle « jamais soi-même » ne s'applique pas à sa propre story.
  const shared = rankMusicStories(rows, '__own__', new Set([viewer.id]), new Set())[0] ?? null;
  const base: MusicStory = shared
    ? { ...shared, username: viewer.username, avatarUrl: viewer.avatarUrl ?? shared.avatarUrl }
    : { profileId: viewer.id, username: viewer.username, avatarUrl: viewer.avatarUrl ?? null, latestAt: '', followed: false, sameStyle: false, tracks: [] };
  const [enriched] = await enrichStoriesWithSales([base]);
  const newestMasked = maskedFromRows.map((row) => row.pinnedAt).sort().pop() ?? '';
  const merged = maskedFromRows.length ? mergeSaleTracks(enriched, maskedFromRows, MAX_MASKED_PINS_PER_STORY) : enriched;
  const withSales = newestMasked && newestMasked > (merged.latestAt || '') ? { ...merged, latestAt: newestMasked } : merged;
  if (!withSales.tracks.length) return null;
  // Sans partage récent : début du jour (stable), pour que « vue » le reste jusqu'à demain.
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  return { ...withSales, latestAt: withSales.latestAt || dayStart.toISOString() };
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
const MAX_MASKED_PINS_PER_STORY = 6;
/** Collection entière en story pendant 24 h (Adel 05/10/2026) : 60 titres en vente = 60 dans la story. */
const MAX_COLLECTION_TRACKS_PER_STORY = 100;
const MAX_STORIES_WITH_SALES = 8;

export function isSaleStoryTrack(track: { id?: string } | null | undefined): boolean {
  return String(track?.id ?? '').startsWith(SALE_TRACK_PREFIX);
}

export function saleSampleToTrack(sample: { trackId: string; previewUrl: string }, sellerUsername: string): CanonicalTrack {
  return {
    id: `${SALE_TRACK_PREFIX}${sample.trackId}`,
    title: 'Musique en vente',
    // Adel 05/10/2026 : l'acheteur n'achète PAS les musiques, il achète le savoir-faire d'écoute d'un membre (sa sélection).
    artist: `Sélection de @${sellerUsername}`,
    album: 'Tu achètes son écoute, pas les titres',
    previewUrl: sample.previewUrl,
    genres: [],
    providerIds: {},
    externalUrls: {},
    availableOn: [],
  } as CanonicalTrack;
}

export function mergeSaleTracks(story: MusicStory, samples: Array<{ trackId: string; previewUrl: string; pinnedAt?: string }>, cap = MAX_SALE_TRACKS_PER_STORY): MusicStory {
  // Doublon + fuite : si la version masquée d'une musique arrive, sa version « vraie » (titre/jaquette) quitte la story.
  const maskedRawIds = new Set(samples.map((sample) => sample.trackId));
  const keptTracks = story.tracks.filter((track) => !maskedRawIds.has(track.id));
  story = keptTracks.length === story.tracks.length ? story : { ...story, tracks: keptTracks };
  const known = new Set(story.tracks.map((track) => track.id));
  const extra = samples
    .map((sample) => saleSampleToTrack(sample, story.username))
    .filter((track) => {
      if (known.has(track.id)) return false;
      known.add(track.id); // jamais deux fois la même musique dans une story
      return true;
    })
    .slice(0, cap);
  if (!extra.length) return story;
  const addedAt = { ...(story.addedAt ?? {}) };
  for (const sample of samples) if (sample.pinnedAt) addedAt[`${SALE_TRACK_PREFIX}${sample.trackId}`] = sample.pinnedAt;
  return { ...story, tracks: [...story.tracks, ...extra], addedAt };
}

/**
 * Musiques EN VENTE mises en story à la main (Adel, 05/10/2026) : toujours masquées (jaquette, artiste), jamais le vrai titre.
 * Elles passent devant l'échantillon aléatoire de la boutique et rallument le cercle (latestAt = date de l'ajout).
 */
export async function loadMaskedStoryPins(profileIds: string[]): Promise<Map<string, Array<{ trackId: string; previewUrl: string; pinnedAt: string }>>> {
  const out = new Map<string, Array<{ trackId: string; previewUrl: string; pinnedAt: string }>>();
  if (!supabase || !profileIds.length) return out;
  // Le serveur décide ce qui est masqué (épinglé en vente OU musique d'une offre active) : jamais le lecteur.
  const { data, error } = await supabase.rpc('keep_story_masked_pins', { p_profile_ids: profileIds });
  if (error) return out;
  for (const row of (data ?? []) as any[]) {
    const previewUrl = row?.preview_url ? String(row.preview_url) : '';
    if (!previewUrl || !row?.profile_id || !row?.track_id) continue;
    const list = out.get(String(row.profile_id)) ?? [];
    list.push({ trackId: String(row.track_id), previewUrl, pinnedAt: String(row.pinned_at) });
    out.set(String(row.profile_id), list);
  }
  return out;
}

/**
 * Collections mises en vente depuis moins de 24 h : TOUS leurs titres (masqués) entrent en story, pour que l'acheteur
 * voie ce qu'il a déjà avant d'acheter. Le serveur filtre l'offre (active, ouverte à moi, < 24 h).
 */
export async function loadSaleCollectionStoryTracks(profileIds: string[]): Promise<Map<string, Array<{ trackId: string; previewUrl: string; pinnedAt: string; offerId?: string }>>> {
  const out = new Map<string, Array<{ trackId: string; previewUrl: string; pinnedAt: string; offerId?: string }>>();
  if (!supabase || !profileIds.length) return out;
  const { data, error } = await supabase.rpc('keep_playlist_sale_story_tracks', { p_seller_ids: profileIds, p_limit: MAX_COLLECTION_TRACKS_PER_STORY });
  if (error) return out;
  for (const row of (data ?? []) as any[]) {
    const previewUrl = row?.preview_url ? String(row.preview_url) : '';
    if (!previewUrl || !row?.seller_id || !row?.track_id) continue;
    const list = out.get(String(row.seller_id)) ?? [];
    list.push({ trackId: String(row.track_id), previewUrl, pinnedAt: String(row.listed_at), offerId: row.offer_id ? String(row.offer_id) : undefined });
    out.set(String(row.seller_id), list);
  }
  return out;
}

/** Associe chaque musique en vente d'une story à son offre (nombre de titres + prix) ; sans offre connue : l'offre la plus récente du vendeur. */
export function buildSaleInfo(
  items: Array<{ trackId: string; offerId?: string }>,
  offers: Array<{ offerId: string; count: number; mode: 'MONEY' | 'FREE' | 'BOTH'; priceLabel: string }>,
): Record<string, SaleStoryInfo> {
  const out: Record<string, SaleStoryInfo> = {};
  if (!offers.length) return out;
  const byId = new Map(offers.map((offer) => [offer.offerId, offer] as const));
  for (const item of items) {
    const offer = (item.offerId ? byId.get(item.offerId) : undefined) ?? offers[0];
    out[`${SALE_TRACK_PREFIX}${item.trackId}`] = { count: offer.count, priceLabel: offer.priceLabel, mode: offer.mode };
  }
  return out;
}

/** Offres actives de ces vendeurs : nombre de titres + prix (une seule requête). */
export async function loadSaleOffersMeta(sellerIds: string[]): Promise<Map<string, Array<{ offerId: string; count: number; mode: 'MONEY' | 'FREE' | 'BOTH'; priceLabel: string }>>> {
  const out = new Map<string, Array<{ offerId: string; count: number; mode: 'MONEY' | 'FREE' | 'BOTH'; priceLabel: string }>>();
  if (!supabase || !sellerIds.length) return out;
  const { data, error } = await supabase.rpc('keep_playlist_sale_story_offers', { p_seller_ids: sellerIds });
  if (error) return out;
  for (const row of (data ?? []) as any[]) {
    if (!row?.seller_id || !row?.offer_id) continue;
    const mode = (String(row.payment_mode ?? 'MONEY').toUpperCase() === 'FREE' ? 'FREE' : String(row.payment_mode).toUpperCase() === 'BOTH' ? 'BOTH' : 'MONEY') as 'MONEY' | 'FREE' | 'BOTH';
    const list = out.get(String(row.seller_id)) ?? [];
    list.push({ offerId: String(row.offer_id), count: Number(row.track_count ?? 0), mode, priceLabel: formatSaleOfferPrice(mode, Number(row.price_cents ?? 0), row.free_price == null ? null : Number(row.free_price), String(row.currency_code ?? 'EUR')) });
    out.set(String(row.seller_id), list);
  }
  return out;
}

export async function enrichStoriesWithSales(stories: MusicStory[]): Promise<MusicStory[]> {
  const head = stories.slice(0, MAX_STORIES_WITH_SALES);
  const emptyMap = () => new Map<string, Array<{ trackId: string; previewUrl: string; pinnedAt: string }>>();
  const [results, masked, collections, offersBySeller] = await Promise.all([
    Promise.allSettled(head.map((story) => loadPlaylistSaleProfilePreviewSampler(story.profileId))),
    loadMaskedStoryPins(head.map((story) => story.profileId)).catch(emptyMap),
    loadSaleCollectionStoryTracks(head.map((story) => story.profileId)).catch(emptyMap),
    loadSaleOffersMeta(head.map((story) => story.profileId)).catch(() => new Map<string, Array<{ offerId: string; count: number; mode: 'MONEY' | 'FREE' | 'BOTH'; priceLabel: string }>>()),
  ]);
  return stories.map((story, index) => {
    const result = index < head.length ? results[index] : null;
    const pins = masked.get(story.profileId) ?? [];
    const collection = collections.get(story.profileId) ?? [];
    const sampler = result && result.status === 'fulfilled' ? result.value : [];
    if (!pins.length && !sampler.length && !collection.length) return story;
    const withPins = mergeSaleTracks(story, pins, MAX_MASKED_PINS_PER_STORY);
    const withCollection = mergeSaleTracks(withPins, collection, MAX_COLLECTION_TRACKS_PER_STORY);
    const merged = mergeSaleTracks(withCollection, sampler);
    const newest = [pins[0]?.pinnedAt, collection[0]?.pinnedAt].filter(Boolean).sort().pop();
    const saleInfo = buildSaleInfo([...pins.map((pin) => ({ trackId: pin.trackId })), ...collection, ...sampler], offersBySeller.get(story.profileId) ?? []);
    const withInfo = Object.keys(saleInfo).length ? { ...merged, saleInfo: { ...(merged.saleInfo ?? {}), ...saleInfo } } : merged;
    return newest && newest > (withInfo.latestAt || '') ? { ...withInfo, latestAt: newest } : withInfo;
  });
}

/**
 * Boutique seule : un profil suivi qui a des musiques en vente mais aucun
 * partage récent a quand même sa story (Adel, 05/10/2026 : « il y a des
 * musiques en magasin, je ne les vois pas »). latestAt = début du jour : la
 * story se rallume chaque jour tant que la boutique est active, et s'éteint
 * une fois vue.
 */
export async function loadSaleOnlyStories(viewerId: string, existing: MusicStory[]): Promise<MusicStory[]> {
  if (!supabase || !viewerId) return [];
  const { data: follows } = await supabase.from('follows').select('followee_id').eq('follower_id', viewerId).limit(200);
  const have = new Set(existing.map((story) => story.profileId));
  const ids = (follows ?? []).map((row: any) => String(row.followee_id)).filter((id) => id && id !== viewerId && !have.has(id)).slice(0, MAX_STORIES_WITH_SALES * 2);
  if (!ids.length) return [];
  const results = await Promise.allSettled(ids.map((id) => loadPlaylistSaleProfilePreviewSampler(id)));
  const collections = await loadSaleCollectionStoryTracks(ids).catch(() => new Map<string, Array<{ trackId: string; previewUrl: string; pinnedAt: string }>>());
  const offersBySeller = await loadSaleOffersMeta(ids).catch(() => new Map<string, Array<{ offerId: string; count: number; mode: 'MONEY' | 'FREE' | 'BOTH'; priceLabel: string }>>());
  const withSales = ids
    .map((id, index) => ({ id, samples: results[index].status === 'fulfilled' ? (results[index] as PromiseFulfilledResult<Array<{ trackId: string; previewUrl: string }>>).value : [] }))
    .filter((row) => row.samples.length > 0)
    .slice(0, MAX_STORIES_WITH_SALES);
  if (!withSales.length) return [];
  const { data: profiles } = await supabase.from('profiles').select('id,username,avatar_url,discovery_hidden').in('id', withSales.map((row) => row.id));
  const byId = new Map((profiles ?? []).map((row: any) => [String(row.id), row]));
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const stories: MusicStory[] = [];
  for (const row of withSales) {
    const profile: any = byId.get(row.id);
    if (!profile?.username) continue;
    const base: MusicStory = {
      profileId: row.id,
      username: String(profile.username),
      avatarUrl: profile.avatar_url ? String(profile.avatar_url) : null,
      latestAt: dayStart.toISOString(),
      followed: true,
      sameStyle: false,
      tracks: [],
    };
    const collection = collections.get(row.id) ?? [];
    const saleInfo = buildSaleInfo([...collection, ...(row.samples as Array<{ trackId: string; offerId?: string }>)], offersBySeller.get(row.id) ?? []);
    const mergedPlain = mergeSaleTracks(mergeSaleTracks(base, collection, MAX_COLLECTION_TRACKS_PER_STORY), row.samples);
    const merged = Object.keys(saleInfo).length ? { ...mergedPlain, saleInfo } : mergedPlain;
    stories.push(collection[0]?.pinnedAt ? { ...merged, latestAt: collection[0].pinnedAt } : merged);
  }
  return stories.filter((story) => story.tracks.length > 0);
}

/** Vues en dernier (grisées), nouveautés d'abord ; ordre d'origine conservé dans chaque groupe. */
export function orderStoriesForBar(stories: MusicStory[], seen: Record<string, string>): MusicStory[] {
  const isNew = (story: MusicStory) => (seen[story.profileId] || '') < story.latestAt;
  // Adel (05/10/2026) : toujours la story la plus RÉCENTE en premier (l'heure de la dernière story), dans chaque groupe.
  const byRecency = (a: MusicStory, b: MusicStory) => (a.latestAt < b.latestAt ? 1 : a.latestAt > b.latestAt ? -1 : (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''));
  return [...stories.filter(isNew).sort(byRecency), ...stories.filter((story) => !isNew(story)).sort(byRecency)];
}


/** Compat : ta propre story = la story de ton profil. */
export const loadOwnStory = loadProfileStory;

/** Qui a vu ma story (Adel, 05/10/2026). Écriture à l'ouverture d'une story d'autrui ; lecture réservée au propriétaire. */
export type StoryViewer = { viewerId: string; username: string; avatarUrl: string | null; viewedAt: string; isFollower: boolean; isReprise: boolean; seconds: number; tracksSeen: number; tracksTotal: number; listened: boolean; watching: boolean; leftAt: string | null };

/** Classement de la semaine (partages en story + reprises de sa musique + nouveaux abonnés) : top 50, lecture seule côté serveur. */
export async function loadStoryRanking(): Promise<Record<string, { rank: number; score: number }>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc('keep_story_ranking');
  if (error) throw error;
  const out: Record<string, { rank: number; score: number }> = {};
  for (const row of (Array.isArray(data) ? data : []) as any[]) {
    if (row?.profile_id) out[String(row.profile_id)] = { rank: Number(row.rank) || 0, score: Number(row.score) || 0 };
  }
  return out;
}

/** Suivi réel façon Instagram (délai de présence, secondes, musiques vues, écoute, départ) : voir services/storyWatchService.ts. */
export function watchStoryOf(ownerId: string, tracksTotal: number) {
  if (!supabase || !ownerId) return null;
  const client = supabase;
  return startStoryWatch(ownerId, tracksTotal, (fn, args) => client.rpc(fn, args));
}

export async function loadMyStoryViewers(): Promise<StoryViewer[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_my_story_viewers_v2');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    viewerId: String(row.viewer_id),
    username: String(row.username ?? ''),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    viewedAt: String(row.viewed_at ?? ''),
    isFollower: Boolean(row.is_follower),
    isReprise: Boolean(row.is_reprise),
    seconds: Number(row.seconds) || 0,
    tracksSeen: Number(row.tracks_seen) || 0,
    tracksTotal: Number(row.tracks_total) || 0,
    listened: Boolean(row.listened),
    watching: Boolean(row.watching),
    leftAt: row.left_at ? String(row.left_at) : null,
  })).filter((row) => row.viewerId && row.username);
}


/** « + » de la story : épingle une de mes musiques gardées en public (refusé côté serveur sinon). */
/** Partager dans MA story une musique PUBLIQUE d'un autre membre : gratuit, sans la garder ; son créateur reste identifié (Adel 05/10/2026). */
export async function pinSharedStoryTrack(trackId: string, fromProfileId: string): Promise<void> {
  if (!supabase || !trackId || !fromProfileId) throw new Error('STORY_PIN_UNAVAILABLE');
  const { error } = await supabase.rpc('keep_pin_shared_story_track', { p_track_id: trackId, p_from_profile_id: fromProfileId });
  if (error) throw error;
  notifyOwnStoryChanged();
}

export async function pinStoryTrack(trackId: string): Promise<void> {
  if (!supabase || !trackId) throw new Error('STORY_PIN_UNAVAILABLE');
  const { error } = await supabase.rpc('keep_pin_story_track', { p_track_id: trackId });
  if (error) throw error;
  notifyOwnStoryChanged();
}

// Adel (05/10/2026) : « j'ai ajouté des musiques, le cercle autour de ma photo ne s'allume pas ». La rangée de stories ne se rechargeait
// que sur retour d'écran ; un ajout depuis un swipe (fenêtre au-dessus du profil) ne la prévenait pas. Source unique : ce signal.
const ownStoryListeners = new Set<() => void>();
export function subscribeOwnStoryChanged(listener: () => void): () => void {
  ownStoryListeners.add(listener);
  return () => { ownStoryListeners.delete(listener); };
}
export function notifyOwnStoryChanged(): void {
  ownStoryListeners.forEach((listener) => { try { listener(); } catch { /* un abonné défaillant ne bloque pas les autres */ } });
}

export type PinnableTrack = { trackId: string; title: string; artist: string; artworkUrl: string | null; previewUrl: string | null; sourceUsername: string | null; inSale?: boolean };

/** Mes musiques gardées en public (les plus récentes d'abord), avec l'utilisateur d'origine quand c'est une reprise. */
export async function loadMyPinnableTracks(viewerId: string): Promise<PinnableTrack[]> {
  if (!supabase || !viewerId) return [];
  const { data, error } = await supabase
    .from('keep_decisions')
    .select('track_id,created_at,source_user_id,track:tracks(id,title,artist,artwork_url,preview_url)')
    .eq('profile_id', viewerId)
    .eq('decision', 'KEPT')
    .eq('visibility', 'PUBLIC')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  const toRow = (row: any, inSale: boolean): PinnableTrack => ({
    trackId: String(row.track?.id ?? row.track_id ?? ''),
    title: String(row.track?.title ?? ''),
    artist: String(row.track?.artist ?? ''),
    artworkUrl: row.track?.artwork_url ? String(row.track.artwork_url) : null,
    previewUrl: row.track?.preview_url ? String(row.track.preview_url) : null,
    sourceUsername: null,
    inSale,
  });
  // Adel (05/10/2026) : une musique EN VENTE peut aller en story (toujours masquée). Elle est listée avec les autres, marquée « en vente ».
  let offeredIds = new Set<string>();
  try { offeredIds = new Set(Object.keys(await loadMyOfferedTrackIds())); } catch { /* sans ventes connues : liste publique seule */ }
  const rows = (data ?? []).map((row: any) => toRow(row, offeredIds.has(String(row.track?.id ?? row.track_id ?? ''))));
  const have = new Set(rows.map((row: PinnableTrack) => row.trackId));
  const missing = [...offeredIds].filter((id) => !have.has(id)).slice(0, 40);
  if (missing.length) {
    const { data: tracks } = await supabase.from('tracks').select('id,title,artist,artwork_url,preview_url').in('id', missing);
    for (const track of tracks ?? []) rows.push(toRow({ track }, true));
  }
  return rows.filter((row: PinnableTrack) => row.trackId && row.title);
}

/** Ordre de lecture (Adel, 05/10/2026) : cercle allumé → on repart de la DERNIÈRE musique ; cercle éteint (déjà vue) → de la PREMIÈRE. */
export function orderTracksForPlayback<T>(tracksNewestFirst: T[], unseen: boolean): T[] {
  return unseen ? tracksNewestFirst : [...tracksNewestFirst].reverse();
}

/**
 * Slogans de story (Adel, 05/10/2026) : une phrase courte qui donne envie de GARDER pendant qu'on écoute.
 * Composée (ouverture + corps + conclusion), stable pour un profil et un jour donnés. Jamais plus de 2 lignes.
 */
const TEASER_PARTS = {
  open: ['Coup de cœur ?', 'Ça sonne bien ?', 'Tu kiffes ?', 'Cette pépite t’attend.', 'Ne la laisse pas filer.', 'Une trouvaille à garder.', 'Écoute bien.', 'Ton oreille a du flair.'],
  body: ['garde-la dans ta collection', 'prends-la avant les autres', 'ajoute-la à ton univers musical', 'fais-lui une place dans tes goûts', 'un GARDER et elle est à toi', 'elle ira droit dans ton profil', 'ta collection va te remercier', 'elle ne coûte que quelques FREE'],
  tail: ['et @{u} sera crédité.', 'avec @{u} identifié dessus.', 'et fais découvrir @{u}.', 'en soutenant @{u}.', 'comme tes abonnés le font.', 'et partage-la ensuite.'],
};
export function composeStoryTeaser(username: string, seed: string): string {
  const mix = (text: string) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  };
  const pick = (list: string[], salt: string) => list[mix(`${salt}|${seed}`) % list.length];
  const body = pick(TEASER_PARTS.body, 'b');
  return `${pick(TEASER_PARTS.open, 'o')} ${body.charAt(0).toUpperCase()}${body.slice(1)} ${pick(TEASER_PARTS.tail, 't').replace('{u}', username)}`;
}


/** Identifiants des musiques déjà dans MA story (partages publics + épingles des dernières 24 h) : anti-doublon. */
export async function loadMyStoryTrackIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!supabase) return ids;
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return ids;
  const since = new Date(Date.now() - STORY_WINDOW_HOURS * 3600 * 1000).toISOString();
  // Adel (05/10/2026) : « PATIENTE… VÉRIFICATION DE TA STORY » restait affiché -- 4 requêtes s'enchaînaient l'une après l'autre. Elles partent
  // maintenant TOUTES ensemble ; une panne de l'une ne bloque pas les autres.
  const [keeps, pins, sampler, collections] = await Promise.all([
    supabase.from('keep_decisions').select('track_id').eq('profile_id', uid).eq('decision', 'KEPT').eq('visibility', 'PUBLIC').gte('created_at', since).limit(200),
    supabase.from('story_pins').select('track_id').eq('profile_id', uid).gte('pinned_at', since).limit(200),
    // Une musique EN VENTE est déjà dans ta story quand ta boutique l'y met d'office (un échantillon par offre active).
    loadPlaylistSaleProfilePreviewSampler(uid).catch(() => [] as Array<{ trackId: string }>),
    // Une collection mise en vente < 24 h est ENTIÈRE dans la story : tous ses titres comptent comme déjà en story.
    loadSaleCollectionStoryTracks([uid]).catch(() => new Map<string, Array<{ trackId: string }>>()),
  ]);
  for (const row of [...(keeps.data ?? []), ...(pins.data ?? [])] as any[]) if (row?.track_id) ids.add(String(row.track_id));
  for (const sample of sampler as any[]) if (sample?.trackId) ids.add(String(sample.trackId));
  for (const rows of collections.values()) for (const row of rows) ids.add(row.trackId);
  return ids;
}


/**
 * Suggestions « ils ont repris tes musiques » (Adel, 05/10/2026) : les membres qui ont GARDÉ une musique dont tu es le premier découvreur.
 * Affichés à côté des stories (jamais comme une story : appui = leur profil). Les plus récents d'abord, sans doublon.
 */
export async function loadFollowingIds(viewerId: string): Promise<string[]> {
  if (!supabase || !viewerId) return [];
  const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', viewerId).limit(500);
  return (data ?? []).map((row: any) => String(row.followee_id)).filter(Boolean);
}

/**
 * Amis par défaut dans la rangée (Adel, 05/10/2026) : les membres que je suis ont TOUJOURS leur bulle, même sans story du jour
 * (cercle gris) ; elle s'allume quand ils en publient une. Appui sans story = leur profil.
 */
export async function loadFriendBubbles(followingIds: string[], excludeIds: string[] = [], limit = 40): Promise<MusicStory[]> {
  if (!supabase || !followingIds.length) return [];
  const skip = new Set(excludeIds);
  const ids = followingIds.filter((id) => !skip.has(id)).slice(0, limit);
  if (!ids.length) return [];
  const { data, error } = await supabase.from('profiles').select('id,username,avatar_url').in('id', ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((row: any) => [String(row.id), row]));
  const out: MusicStory[] = [];
  for (const id of ids) {
    const profile: any = byId.get(id);
    if (!profile?.username) continue;
    out.push({ profileId: id, username: String(profile.username), avatarUrl: profile.avatar_url ? String(profile.avatar_url) : null, latestAt: '', followed: true, sameStyle: false, tracks: [] });
  }
  return out;
}

export async function loadOthersBubbles(otherIds: string[], excludeIds: string[] = [], limit = 40): Promise<MusicStory[]> {
  if (!supabase || !otherIds.length) return [];
  const skip = new Set(excludeIds);
  const ids = otherIds.filter((id) => !skip.has(id)).slice(0, limit);
  if (!ids.length) return [];
  const { data, error } = await supabase.from('profiles').select('id,username,avatar_url,discovery_hidden').in('id', ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((row: any) => [String(row.id), row]));
  const out: MusicStory[] = [];
  for (const id of ids) {
    const profile: any = byId.get(id);
    if (!profile?.username || profile.discovery_hidden) continue;
    out.push({ profileId: id, username: String(profile.username), avatarUrl: profile.avatar_url ? String(profile.avatar_url) : null, latestAt: '', followed: false, sameStyle: false, tracks: [], suggestion: true });
  }
  return out;
}


/**
 * Suggestions d'amis PAR STYLE (Adel, 05/10/2026) : proposées seulement quand l'utilisateur a fait son style musical (genres/artistes favoris).
 * Source unique serveur `keep_discovery_match_candidates` (profils publics, non masqués, avec genres ou artistes en commun, classés par score).
 * Jamais des membres déjà suivis, déjà liés, ni soi-même.
 */
export async function loadStyleSuggestions(viewerId: string, excludeIds: string[] = [], limit = 12): Promise<MusicStory[]> {
  if (!supabase || !viewerId) return [];
  const { data, error } = await supabase.rpc('keep_discovery_match_candidates', { p_limit: 30 });
  if (error) return [];
  const skip = new Set([viewerId, ...excludeIds]);
  const out: MusicStory[] = [];
  for (const row of (Array.isArray(data) ? data : []) as any[]) {
    const id = String(row?.profile_id ?? '');
    const username = String(row?.username ?? '').trim();
    if (!id || !username || skip.has(id)) continue;
    skip.add(id);
    out.push({ profileId: id, username, avatarUrl: row.avatar_url ? String(row.avatar_url) : null, latestAt: '', followed: false, sameStyle: true, tracks: [], suggestion: true, styleMatch: true });
    if (out.length >= limit) break;
  }
  return out;
}


/**
 * Tri intelligent par activité réelle (Adel, 05/10/2026) : un ancien abonné inactif ne passe jamais devant. Activité = dernière connexion,
 * dernier GARDER ou dernière épingle de story (RPC serveur `keep_profiles_activity`, un seul appel pour tout le lot).
 * Au-delà de DORMANT_AFTER_DAYS sans activité (ou activité inconnue), le membre est « endormi » : il reste dans la ligne mais à la suite.
 */
import { DORMANT_AFTER_DAYS, isDormantMember } from './storyActivity';
export { DORMANT_AFTER_DAYS, isDormantMember };
export async function loadProfilesActivity(profileIds: string[]): Promise<Record<string, { lastActiveAt: string | null; online: boolean }>> {
  const out: Record<string, { lastActiveAt: string | null; online: boolean }> = {};
  if (!supabase || !profileIds.length) return out;
  const ids = Array.from(new Set(profileIds)).slice(0, 200);
  const { data, error } = await supabase.rpc('keep_profiles_activity', { p_profile_ids: ids });
  // Une erreur serveur ne doit JAMAIS faire passer tout le monde pour « inactif » (les bulles disparaîtraient) : on lève l'erreur.
  if (error) throw error;
  for (const row of (data ?? []) as any[]) {
    if (!row?.profile_id) continue;
    out[String(row.profile_id)] = { lastActiveAt: row.last_active_at ? String(row.last_active_at) : null, online: Boolean(row.is_online) };
  }
  return out;
}
