import { supabase } from './supabaseClient';

export type EventStoryCard = {
  eventId: string;
  creatorId: string;
  username: string;
  name: string;
  description: string;
  venueName: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  sharedAt: string;
  goingCount: number;
  maybeCount: number;
  checkedInCount: number;
  pulseScore: number;
  ticketPriceCents: number | null;
};

export function eventStoryStillVisible(event: Pick<EventStoryCard, 'sharedAt' | 'startsAt' | 'endsAt'>, now = Date.now()): boolean {
  const publishedAt = Date.parse(event.sharedAt);
  const startsAt = Date.parse(event.startsAt);
  const explicitEnd = event.endsAt ? Date.parse(event.endsAt) : NaN;
  const endsAt = Number.isFinite(explicitEnd) ? explicitEnd : startsAt + 6 * 3600000;
  return Number.isFinite(publishedAt) && Number.isFinite(endsAt)
    && publishedAt <= now && publishedAt + 24 * 3600000 > now && endsAt > now;
}

export async function loadEventStories(limit = 20): Promise<EventStoryCard[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_event_story_list', { p_limit: Math.min(30, Math.max(1, limit)) });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any): EventStoryCard => ({
    eventId: String(row.event_id),
    creatorId: String(row.creator_id),
    username: String(row.username ?? ''),
    name: String(row.event_name ?? ''),
    description: String(row.description ?? ''),
    venueName: String(row.venue_name ?? ''),
    imageUrl: row.image_url ? String(row.image_url) : null,
    startsAt: String(row.starts_at),
    endsAt: row.ends_at ? String(row.ends_at) : null,
    sharedAt: String(row.shared_at),
    goingCount: Math.max(0, Number(row.going_count ?? 0)),
    maybeCount: Math.max(0, Number(row.maybe_count ?? 0)),
    checkedInCount: Math.max(0, Number(row.checked_in_count ?? 0)),
    pulseScore: Math.max(0, Number(row.pulse_score ?? 0)),
    ticketPriceCents: row.ticket_price_cents == null ? null : Math.max(0, Number(row.ticket_price_cents)),
  })).filter((event) => event.eventId && event.name && eventStoryStillVisible(event));
}

export async function publishEventStory(eventId: string): Promise<{ sharedAt: string }> {
  if (!supabase || !eventId) throw new Error('SESSION_REQUIRED');
  const { data, error } = await supabase.rpc('keep_publish_event_story', { p_event_id: eventId });
  if (error || !data?.ok) throw new Error(String(data?.error ?? error?.message ?? 'EVENT_STORY_FAILED'));
  return { sharedAt: String(data.sharedAt ?? '') };
}

// Il s'agit d'un score de visibilité, pas de FREE : la plateforme ne crée
// aucun point facturable artificiel. Les RSVPs uniques + billets pointés
// forment la récompense publique de l'organisateur.
export function eventPulseScore(going: number, maybe: number, checkedIn: number): number {
  return Math.max(0, going) * 5 + Math.max(0, maybe) + Math.max(0, checkedIn) * 10;
}
