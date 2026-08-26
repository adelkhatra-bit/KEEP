import { supabase } from './supabaseClient';

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
};

export type EventRsvpStatus = 'GOING' | 'MAYBE' | 'NOT_GOING';

export async function loadUpcomingEvents(): Promise<CreatorEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('events')
    .select('id,creator_id,name,description,venue_name,starts_at,ends_at,country_code,dj_artist_names,external_ticket_url')
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
  }));
}

export async function loadMyRsvps(profileId: string): Promise<Record<string, EventRsvpStatus>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('event_rsvps').select('event_id,status').eq('profile_id', profileId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row: any) => [row.event_id, row.status as EventRsvpStatus]));
}

export async function setEventRsvp(profileId: string, eventId: string, status: EventRsvpStatus): Promise<void> {
  if (!supabase) throw new Error('Connexion KEEP indisponible.');
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
}): Promise<{ id: string; name: string }> {
  if (!supabase) throw new Error('Connexion KEEP indisponible.');
  const { data, error } = await supabase.functions.invoke('keep-creator-actions', { body: { action: 'event.create', ...input } });
  if (error) throw error;
  if (!data?.ok) {
    if (data?.error === 'creator_plan_required') throw new Error('CREATOR_PRO_REQUIRED');
    throw new Error(String(data?.error || 'EVENT_CREATE_FAILED'));
  }
  return { id: String(data.event.id), name: String(data.event.name) };
}

export async function broadcastEventToFollowers(eventId: string, message?: string): Promise<number> {
  if (!supabase) throw new Error('Connexion KEEP indisponible.');
  const { data, error } = await supabase.functions.invoke('keep-creator-actions', { body: { action: 'event.broadcast', eventId, message } });
  if (error) throw error;
  if (!data?.ok) {
    if (data?.error === 'creator_plan_required') throw new Error('CREATOR_PRO_REQUIRED');
    throw new Error(String(data?.error || 'EVENT_BROADCAST_FAILED'));
  }
  return Number(data.sent || 0);
}
