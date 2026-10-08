import { supabase } from './supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { isStoryAccountEligible } from './storyEligibility';
import { matchesEventMarket, type EventDiscoveryItem, type EventDiscoveryStats } from './eventDiscoveryPolicy';
import { requestEventTicketPurchase, setEventRsvp, type EventTicketPurchaseRequest } from './creatorEventService';
import { coalesced } from './coalesce';

export async function eventDiscoveryAccountId(): Promise<string | null> {
  const state = useUserStore.getState();
  if (!supabase || !state.user || state.isDemoMode || state.isLocalGuest) return null;
  const { data, error } = await supabase.auth.getSession();
  const user = data.session?.user;
  const current = useUserStore.getState();
  if (error || current.isDemoMode || current.isLocalGuest || current.user?.id !== user?.id || !isStoryAccountEligible(user)) return null;
  return user?.id ?? null;
}

export function normalizeEventDiscoveryRows(value: unknown, surface: 'STORY' | 'PULSE'): EventDiscoveryItem[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : []).flatMap((row: any): EventDiscoveryItem[] => {
    const id = String(row?.event_id ?? '');
    const startsAt = String(row?.starts_at ?? '');
    const creatorId = String(row?.profile_id ?? '');
    if (!id || seen.has(id) || !creatorId || !row?.name || !Number.isFinite(Date.parse(startsAt))) return [];
    if (['moderation_status', 'photo_status', 'text_status'].some((field) => row[field] !== 'APPROVED')) return [];
    const event: EventDiscoveryItem = {
      kind: 'event', id, creatorId, username: String(row.username ?? ''),
      avatarUrl: row.avatar_url ?? null, name: String(row.name), imageUrl: row.image_url ?? null,
      startsAt, endsAt: row.ends_at ?? null, venueName: row.venue_name ?? null,
      description: row.description ?? null, countryCode: String(row.country_code ?? '').toUpperCase(),
      currencyCode: String(row.currency_code ?? '').toUpperCase(),
      ticketPriceCents: row.ticket_price_cents == null ? null : Number(row.ticket_price_cents),
      genres: Array.isArray(row.genres) ? row.genres.map(String) : [],
      pinnedAt: String(row.pinned_at ?? ''),
      rsvpStatus: ['GOING', 'MAYBE', 'NOT_GOING'].includes(row.my_rsvp) ? row.my_rsvp : null,
    };
    if (surface === 'PULSE' && !matchesEventMarket(event, String(row.viewer_country_code ?? ''), String(row.viewer_currency_code ?? ''))) return [];
    seen.add(id);
    return [event];
  });
}

async function loadEventDiscoveryUncoalesced(surface: 'STORY' | 'PULSE', profileIds?: string[]): Promise<EventDiscoveryItem[]> {
  const accountId = await eventDiscoveryAccountId();
  if (!supabase || !accountId) return [];
  const { data, error } = await supabase.rpc(surface === 'STORY' ? 'keep_story_events' : 'keep_pulse_events',
    surface === 'STORY' ? { p_profile_ids: profileIds ?? [accountId] } : { p_limit: 30 });
  if (error) throw error;
  let rows = Array.isArray(data) ? data : [];
  if (surface === 'PULSE' && rows.length && rows.some((row: any) => !row.viewer_country_code || !row.viewer_currency_code)) {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('country_code').eq('id', accountId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.country_code) return [];
    const { data: market, error: marketError } = await supabase.from('countries').select('default_currency_code').eq('code', profile.country_code).maybeSingle();
    if (marketError) throw marketError;
    if (!market?.default_currency_code) return [];
    rows = rows.map((row: any) => ({ ...row, viewer_country_code: profile.country_code, viewer_currency_code: market.default_currency_code }));
  }
  const current = useUserStore.getState();
  if (current.isDemoMode || current.isLocalGuest || current.user?.id !== accountId) return [];
  const items = normalizeEventDiscoveryRows(rows, surface);
  const missingProfiles = Array.from(new Set(items.filter((item) => !item.username).map((item) => item.creatorId)));
  if (!missingProfiles.length) return items;
  const { data: profiles, error: profileError } = await supabase.from('profiles').select('id,username,avatar_url').in('id', missingProfiles);
  if (profileError) throw profileError;
  const byId = new Map((profiles ?? []).map((profile: any) => [String(profile.id), profile]));
  return items.map((item) => {
    const profile = byId.get(item.creatorId) as any;
    return profile ? { ...item, username: String(profile.username ?? item.username), avatarUrl: profile.avatar_url ?? item.avatarUrl } : item;
  }).filter((item) => Boolean(item.username));
}

export function loadEventDiscovery(surface: 'STORY' | 'PULSE', profileIds?: string[]): Promise<EventDiscoveryItem[]> {
  return coalesced(`event-discovery:${surface}:${useUserStore.getState().user?.id ?? ''}:${(profileIds ?? []).join(',')}`, () => loadEventDiscoveryUncoalesced(surface, profileIds));
}

export async function requestDiscoveryEventTicket(event: EventDiscoveryItem): Promise<EventTicketPurchaseRequest> {
  if (!await eventDiscoveryAccountId()) throw new Error('EVENT_ACCOUNT_REQUIRED');
  const request = await requestEventTicketPurchase(event.id);
  if (request.currencyCode.toUpperCase() !== event.currencyCode.toUpperCase()) throw new Error('EVENT_CURRENCY_MISMATCH');
  return request;
}

export async function attendDiscoveryEvent(eventId: string): Promise<void> {
  const accountId = await eventDiscoveryAccountId();
  if (!supabase || !accountId) throw new Error('EVENT_ACCOUNT_REQUIRED');
  await setEventRsvp(accountId, eventId, 'GOING');
}

export async function recordEventDiscoveryEngagement(eventId: string, kind: 'VIEW' | 'SHARE', surface: 'STORY' | 'PULSE' | 'PARTIES'): Promise<void> {
  if (!supabase || !await eventDiscoveryAccountId()) return;
  const { error } = await supabase.rpc('keep_record_event_engagement', { p_event_id: eventId, p_action: kind.toLowerCase() });
  if (error) throw error;
}

export async function loadMyEventDiscoveryStats(eventId: string): Promise<EventDiscoveryStats | null> {
  if (!supabase || !await eventDiscoveryAccountId()) return null;
  const { data, error } = await supabase.rpc('keep_my_event_stats', { p_event_id: eventId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { eventId, views: Number(row.views ?? 0), going: Number(row.going ?? 0), shares: Number(row.shares ?? 0), countryCode: String(row.country_code ?? '') };
}
