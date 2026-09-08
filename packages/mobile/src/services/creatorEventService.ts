import { supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';
import type { ProfileCertificationTier } from './publicProfileStateService';

export type CreatorEvent = {
  id: string;
  creatorId: string;
  name: string;
  description?: string | null;
  venueName?: string | null;
  startsAt: string;
  endsAt?: string | null;
  countryCode?: string | null;
  djArtistNames: string[];
  externalTicketUrl?: string | null;
  youtubeUrl?: string | null;
};

export type EventRsvpStatus = 'GOING' | 'MAYBE' | 'NOT_GOING';

export async function loadUpcomingEvents(): Promise<CreatorEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('events')
    .select('id,creator_id,name,description,venue_name,starts_at,ends_at,country_code,dj_artist_names,external_ticket_url,youtube_url')
    .eq('is_disabled', false)
    .gte('starts_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    creatorId: row.creator_id,
    name: row.name,
    description: row.description,
    venueName: row.venue_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    countryCode: row.country_code,
    djArtistNames: Array.isArray(row.dj_artist_names) ? row.dj_artist_names : [],
    externalTicketUrl: row.external_ticket_url,
    youtubeUrl: row.youtube_url,
  }));
}

export async function loadMyRsvps(profileId: string): Promise<Record<string, EventRsvpStatus>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('event_rsvps').select('event_id,status').eq('profile_id', profileId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row: any) => [row.event_id, row.status as EventRsvpStatus]));
}

export async function setEventRsvp(profileId: string, eventId: string, status: EventRsvpStatus): Promise<void> {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  const { error } = await supabase.from('event_rsvps').upsert({ event_id: eventId, profile_id: profileId, status }, { onConflict: 'event_id,profile_id' });
  if (error) throw error;
}

export async function createCreatorEvent(input: {
  name: string;
  description?: string;
  venueName?: string;
  startsAt: string;
  endsAt?: string;
  countryCode?: string;
  ticketUrl?: string;
  djArtistNames?: string[];
  youtubeUrl?: string;
  lat?: number;
  lng?: number;
}): Promise<{ id: string; name: string }> {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  const { data, error } = await supabase.functions.invoke('keep-creator-actions', { body: { action: 'event.create', ...input } });
  if (error && !data) throw error;
  if (!data?.ok) {
    if (data?.error === 'creator_plan_required') throw new Error('CREATOR_PRO_REQUIRED');
    if (data?.error === 'event_followers_required') throw new Error(`EVENT_FOLLOWERS_REQUIRED:${Number(data?.followers || 0)}:${Number(data?.min_followers || 500)}`);
    if (data?.error === 'event_monthly_limit_reached') throw new Error('VENUE_PRO_EVENT_LIMIT');
    throw new Error(String(data?.error || error?.message || 'EVENT_CREATE_FAILED'));
  }
  return { id: String(data.event.id), name: String(data.event.name) };
}

// Adel (08/09/2026) : "il faut qu'il puisse effacer les evenements ...
// tous les modifier" -- modifier reutilise exactement les memes champs que
// la creation ; supprimer est un SOFT delete cote serveur (continue de
// compter dans le quota mensuel, voir keep-creator-actions).
export async function updateCreatorEvent(eventId: string, input: {
  name: string;
  description?: string;
  venueName?: string;
  startsAt: string;
  endsAt?: string;
  countryCode?: string;
  ticketUrl?: string;
  youtubeUrl?: string;
  lat?: number;
  lng?: number;
}): Promise<{ id: string; name: string }> {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  const { data, error } = await supabase.functions.invoke('keep-creator-actions', { body: { action: 'event.update', eventId, ...input } });
  if (error && !data) throw error;
  if (!data?.ok) throw new Error(String(data?.error || error?.message || 'EVENT_UPDATE_FAILED'));
  return { id: String(data.event.id), name: String(data.event.name) };
}

export async function disableCreatorEvent(eventId: string): Promise<void> {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  const { data, error } = await supabase.functions.invoke('keep-creator-actions', { body: { action: 'event.disable', eventId } });
  if (error && !data) throw error;
  if (!data?.ok) throw new Error(String(data?.error || error?.message || 'EVENT_DELETE_FAILED'));
}

export type EventParticipant = {
  profileId: string;
  username: string;
  certificationTier: ProfileCertificationTier;
  status: EventRsvpStatus;
  respondedAt: string;
};

export async function loadEventParticipants(eventId: string): Promise<EventParticipant[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_event_participants', { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];
  return data.map((row: any) => ({
    profileId: String(row.profile_id),
    username: String(row.username || 'keep-user'),
    certificationTier: (row.certification_tier as ProfileCertificationTier) || 'UNVERIFIED',
    status: (row.status as EventRsvpStatus) || 'MAYBE',
    respondedAt: String(row.responded_at),
  }));
}

export async function broadcastEventToFollowers(eventId: string, message?: string, includeRsvpButtons = true): Promise<number> {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  const { data, error } = await supabase.functions.invoke('keep-creator-actions', { body: { action: 'event.broadcast', eventId, message, includeRsvpButtons } });
  if (error && !data) throw error;
  if (!data?.ok) {
    if (data?.error === 'creator_plan_required') throw new Error('CREATOR_PRO_REQUIRED');
    throw new Error(String(data?.error || error?.message || 'EVENT_BROADCAST_FAILED'));
  }
  return Number(data.sent || 0);
}

// Adel (08/09/2026) : "il faut qu'il y ait un retour ... comprendre pourquoi
// il a eu un flop ... systeme d'etoile ... le pseudo et certif de
// l'utilisateur et son style musical" -- avis post-evenement, reserve a qui
// a repondu "je participe" (verifie server-side par keep_event_submit_review).
export type EventReview = {
  reviewId: string;
  reviewerId: string;
  username: string;
  certificationTier: ProfileCertificationTier;
  favoriteGenres: string[];
  rating: number;
  comment: string | null;
  createdAt: string;
};

export type EventReviewSummary = { averageRating: number; reviewCount: number };

export async function submitEventReview(eventId: string, rating: number, comment?: string): Promise<void> {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  const { error } = await supabase.rpc('keep_event_submit_review', { p_event_id: eventId, p_rating: rating, p_comment: comment || null });
  if (error) {
    const message = String(error.message || '');
    if (message.includes('PARTICIPATION_REQUIRED')) throw new Error('PARTICIPATION_REQUIRED');
    if (message.includes('INVALID_RATING')) throw new Error('INVALID_RATING');
    throw new Error('EVENT_REVIEW_FAILED');
  }
}

export async function loadEventReviews(eventId: string): Promise<EventReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_event_reviews', { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];
  return data.map((row: any) => ({
    reviewId: String(row.review_id),
    reviewerId: String(row.reviewer_id),
    username: String(row.username || 'keep-user'),
    certificationTier: (row.certification_tier as ProfileCertificationTier) || 'UNVERIFIED',
    favoriteGenres: Array.isArray(row.favorite_genres) ? row.favorite_genres.map(String) : [],
    rating: Number(row.rating || 0),
    comment: row.comment ?? null,
    createdAt: String(row.created_at),
  }));
}

export async function loadEventReviewSummary(eventId: string): Promise<EventReviewSummary> {
  if (!supabase) return { averageRating: 0, reviewCount: 0 };
  const { data, error } = await supabase.rpc('keep_event_review_summary', { p_event_id: eventId });
  if (error || !data) return { averageRating: 0, reviewCount: 0 };
  return { averageRating: Number(data.averageRating || 0), reviewCount: Number(data.reviewCount || 0) };
}

export type EventRsvpCounts = { going: number; maybe: number; notGoing: number };

export async function loadEventRsvpCounts(eventId: string): Promise<EventRsvpCounts> {
  if (!supabase) return { going: 0, maybe: 0, notGoing: 0 };
  const { data, error } = await supabase.rpc('keep_event_rsvp_counts', { p_event_id: eventId });
  if (error || !data) return { going: 0, maybe: 0, notGoing: 0 };
  return { going: Number(data.going || 0), maybe: Number(data.maybe || 0), notGoing: Number(data.notGoing || 0) };
}

export type PendingEventReview = {
  eventId: string;
  name: string;
  venueName: string | null;
  startsAt: string;
  creatorId: string;
  creatorUsername: string;
};

export async function loadMyPendingEventReviews(): Promise<PendingEventReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_my_pending_event_reviews');
  if (error || !Array.isArray(data)) return [];
  return data.map((row: any) => ({
    eventId: String(row.event_id),
    name: String(row.name),
    venueName: row.venue_name ?? null,
    startsAt: String(row.starts_at),
    creatorId: String(row.creator_id),
    creatorUsername: String(row.creator_username || 'keep-user'),
  }));
}
