import { PulseEventQuota, matchesEventMarket, eventTicketPriceLabel, type EventDiscoveryItem } from '../eventDiscoveryPolicy';
import fs from 'fs';
import path from 'path';
import { attendDiscoveryEvent, loadEventDiscovery, normalizeEventDiscoveryRows, recordEventDiscoveryEngagement, requestDiscoveryEventTicket } from '../eventDiscoveryService';
import { mergeEventStories, hasStoryContent } from '../musicStoriesService';
import { supabase } from '../supabaseClient';
import { useUserStore } from '../../store/useUserStore';
import { requestEventTicketPurchase, setEventRsvp } from '../creatorEventService';

jest.mock('../supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn(), from: jest.fn() },
}));
jest.mock('../../store/useUserStore', () => ({ useUserStore: { getState: jest.fn() } }));
jest.mock('../creatorEventService', () => ({ requestEventTicketPurchase: jest.fn(), setEventRsvp: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../playlistSaleService', () => ({ loadMyOfferedTrackIds: jest.fn(), loadPlaylistSaleProfilePreviewSampler: jest.fn() }));

const rpc = supabase!.rpc as jest.Mock;
const getSession = supabase!.auth.getSession as jest.Mock;
const getState = useUserStore.getState as jest.Mock;
const from = supabase!.from as jest.Mock;
const ticketPurchase = requestEventTicketPurchase as jest.Mock;
const setRsvp = setEventRsvp as jest.Mock;
const row = {
  event_id: 'party', profile_id: 'host', username: 'dj', name: 'Soirée',
  starts_at: '2026-10-10T20:00:00Z', pinned_at: '2026-10-08T10:00:00Z',
  country_code: 'FR', currency_code: 'EUR', viewer_country_code: 'FR', viewer_currency_code: 'EUR',
  genres: ['house'], moderation_status: 'APPROVED', photo_status: 'APPROVED', text_status: 'APPROVED', my_rsvp: 'GOING',
};
const event = (id = 'party'): EventDiscoveryItem => ({ ...normalizeEventDiscoveryRows([row], 'PULSE')[0], id });

beforeEach(() => {
  jest.clearAllMocks();
  getState.mockReturnValue({ user: { id: 'viewer' }, isDemoMode: false, isLocalGuest: false });
  getSession.mockResolvedValue({ data: { session: { user: { id: 'viewer', email: 'viewer@example.org', email_confirmed_at: '2026-10-01', is_anonymous: false } } }, error: null });
  rpc.mockResolvedValue({ data: [row], error: null });
  setRsvp.mockResolvedValue(undefined);
  from.mockImplementation((table: string) => {
    const query: any = {};
    query.select = jest.fn(() => query);
    query.eq = jest.fn(() => query);
    query.maybeSingle = jest.fn(async () => ({ data: table === 'profiles' ? { country_code: 'FR' } : { default_currency_code: 'EUR' }, error: null }));
    query.in = jest.fn(async () => ({ data: [{ id: 'host', username: 'dj', avatar_url: null }], error: null }));
    return query;
  });
});

describe('Quota soirées Loki Pulse', () => {
  it('aucune soirée avant dix vraies musiques distinctes, puis une au plus par dix', () => {
    const quota = new PulseEventQuota();
    const events = [event('a'), event('b'), event('c')];
    expect(quota.take(events)).toBeNull();
    for (let i = 0; i < 9; i += 1) quota.observeTrack(`track-${i}`);
    expect(quota.take(events)).toBeNull();
    quota.observeTrack('track-9');
    expect(quota.take(events)?.id).toBe('a');
    expect(quota.take(events)).toBeNull();
    for (let i = 0; i < 10; i += 1) quota.observeTrack(`track-${i}`);
    expect(quota.take(events)).toBeNull();
    for (let i = 10; i < 20; i += 1) quota.observeTrack(`track-${i}`);
    expect(quota.take(events)?.id).toBe('b');
    expect(quota.take(events)).toBeNull();
  });
  it('ne consomme pas un emplacement quand aucune soirée n’est disponible et ne rejoue jamais une soirée', () => {
    const quota = new PulseEventQuota();
    for (let i = 0; i < 20; i += 1) quota.observeTrack(String(i));
    expect(quota.take([])).toBeNull();
    expect(quota.take([event('a')])?.id).toBe('a');
    expect(quota.take([event('a')])).toBeNull();
    expect(quota.take([event('b')])).toBeNull();
    for (let i = 20; i < 30; i += 1) quota.observeTrack(String(i));
    expect(quota.take([event('b')])?.id).toBe('b');
  });
});

describe('Pays, devise et approbation serveur', () => {
  it('affiche la devise serveur, jamais un prix converti ni un euro par défaut', () => {
    expect(eventTicketPriceLabel({ ticketPriceCents: 1000, currencyCode: 'USD' })).toContain('$');
    expect(eventTicketPriceLabel({ ticketPriceCents: 1000, currencyCode: '' })).toBe('Tarif indisponible');
    expect(eventTicketPriceLabel({ ticketPriceCents: null, currencyCode: 'EUR' })).toBeNull();
  });
  it('refuse autre pays, autre devise et marché inconnu sans repli EUR/FR', () => {
    expect(matchesEventMarket(event(), 'fr', 'eur')).toBe(true);
    expect(matchesEventMarket(event(), 'US', 'EUR')).toBe(false);
    expect(matchesEventMarket(event(), 'FR', 'USD')).toBe(false);
    expect(normalizeEventDiscoveryRows([{ ...row, country_code: 'US' }, { ...row, currency_code: 'USD' }, { ...row, viewer_country_code: null }], 'PULSE')).toEqual([]);
  });
  it('accepte uniquement les soirées photo + texte approuvés et déduplique', () => {
    expect(normalizeEventDiscoveryRows([row, row], 'PULSE')).toHaveLength(1);
    for (const field of ['moderation_status', 'photo_status', 'text_status']) {
      expect(normalizeEventDiscoveryRows([{ ...row, [field]: 'PENDING' }], 'STORY')).toEqual([]);
      expect(normalizeEventDiscoveryRows([{ ...row, [field]: undefined }], 'STORY')).toEqual([]);
    }
  });
  it('lit le feed filtré serveur, pas les événements publics bruts', async () => {
    expect(await loadEventDiscovery('PULSE')).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('keep_pulse_events', { p_limit: 30 });
  });
  it('valide le marché depuis profiles/countries lorsque le RPC ne renvoie pas le contexte, jamais depuis une valeur locale', async () => {
    const serverRow = { ...row, username: undefined, viewer_country_code: undefined, viewer_currency_code: undefined };
    rpc.mockResolvedValue({ data: [serverRow, { ...serverRow, event_id: 'outside', country_code: 'US' }], error: null });
    const items = await loadEventDiscovery('PULSE');
    expect(items).toHaveLength(1);
    expect(items[0].username).toBe('dj');
    expect(from).toHaveBeenCalledWith('profiles');
    expect(from).toHaveBeenCalledWith('countries');
  });
});

describe('Écritures protégées et RSVP persistant', () => {
  it.each(['isDemoMode', 'isLocalGuest'])('aucune écriture ni lecture Auth en %s', async (flag) => {
    getState.mockReturnValue({ user: { id: 'viewer' }, [flag]: true });
    await expect(attendDiscoveryEvent('party')).rejects.toThrow('EVENT_ACCOUNT_REQUIRED');
    await recordEventDiscoveryEngagement('party', 'VIEW', 'STORY');
    await expect(requestDiscoveryEventTicket(event())).rejects.toThrow('EVENT_ACCOUNT_REQUIRED');
    expect(rpc).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(ticketPurchase).not.toHaveBeenCalled();
    expect(setRsvp).not.toHaveBeenCalled();
  });
  it.each([
    { id: 'viewer', email: 'viewer@example.org', is_anonymous: true, email_confirmed_at: '2026-10-01' },
    { id: 'viewer', email: 'viewer@example.org', is_anonymous: false },
    { id: 'other', email: 'other@example.org', email_confirmed_at: '2026-10-01' },
  ])('refuse anonyme, e-mail non vérifié et session d’un autre compte', async (user) => {
    getSession.mockResolvedValue({ data: { session: { user } }, error: null });
    await expect(attendDiscoveryEvent('party')).rejects.toThrow('EVENT_ACCOUNT_REQUIRED');
    await recordEventDiscoveryEngagement('party', 'SHARE', 'PULSE');
    expect(rpc).not.toHaveBeenCalled();
    expect(setRsvp).not.toHaveBeenCalled();
  });
  it('persiste via le service RSVP et restaure GOING depuis le serveur au rechargement', async () => {
    await attendDiscoveryEvent('party');
    expect(setRsvp).toHaveBeenCalledWith('viewer', 'party', 'GOING');
    expect((await loadEventDiscovery('STORY'))[0].rsvpStatus).toBe('GOING');
  });
  it('le service RSVP existant écrit exactement event_rsvps avec conflit event/profile, sans nouvelle présence', async () => {
    const upsert = jest.fn(async () => ({ error: null }));
    from.mockReturnValue({ upsert });
    const existing = jest.requireActual('../creatorEventService') as typeof import('../creatorEventService');
    await existing.setEventRsvp('viewer', 'party', 'GOING');
    expect(from).toHaveBeenCalledWith('event_rsvps');
    expect(upsert).toHaveBeenCalledWith({ event_id: 'party', profile_id: 'viewer', status: 'GOING' }, { onConflict: 'event_id,profile_id' });
  });
  it('ne transforme jamais un refus serveur en participation réussie', async () => {
    setRsvp.mockRejectedValue(new Error('TICKET_PAYMENT_REQUIRED'));
    await expect(attendDiscoveryEvent('party')).rejects.toThrow('TICKET_PAYMENT_REQUIRED');
  });
  it('garde le paiement existant, refuse une devise différente', async () => {
    ticketPurchase.mockResolvedValue({ currencyCode: 'USD', status: 'PENDING' });
    await expect(requestDiscoveryEventTicket(event())).rejects.toThrow('EVENT_CURRENCY_MISMATCH');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Story mixte, sans faux CanonicalTrack', () => {
  it('une soirée seule reste une story; les musiques, ventes et informations existantes restent intactes', () => {
    const saleTrack = { id: 'sale:track', title: 'Musique en vente', artist: 'Masqué' } as any;
    const base = { profileId: 'host', username: 'dj', avatarUrl: null, latestAt: '2026-10-08T09:00:00Z', followed: true, sameStyle: false, tracks: [saleTrack], saleInfo: { 'sale:track': { count: 20, priceLabel: '3 FREE', mode: 'FREE' as const } } };
    const merged = mergeEventStories([base], [event(), event()]);
    expect(merged[0].tracks).toEqual([saleTrack]);
    expect(merged[0].saleInfo).toEqual(base.saleInfo);
    expect(merged[0].events).toHaveLength(1);
    expect(hasStoryContent(mergeEventStories([], [event()])[0])).toBe(true);
  });
  it('réutilise le lecteur pour les deux surfaces, attend une vraie présence et garde les actions lisibles', () => {
    const read = (name: string) => fs.readFileSync(path.join(__dirname, '../../components', name), 'utf8');
    const deck = read('MusicSwipeDeckModal.tsx');
    const card = read('EventDiscoveryCard.tsx');
    expect(deck).toContain('<EventDiscoveryCard');
    expect(deck).toContain("surface={pulseEvent ? 'PULSE' : 'STORY'}");
    expect(deck).toContain('pulseQuota.current.observeTrack(strongKeepTrackIdentity(current))');
    expect(deck).toContain('document.hidden');
    expect(card).toContain("recordEventDiscoveryEngagement(event.id, 'VIEW', surface)");
    expect(card).toContain('}, 2000)');
    expect(card).toContain('requestDiscoveryEventTicket(event)');
    expect(card).toContain('request.status !== \'COMPLETED\'');
    expect(card).not.toContain('TextInput');
    expect(card).toContain('ⓘ');
    expect(Math.min(...Array.from(card.matchAll(/fontSize:\s*(\d+)/g), (match) => Number(match[1])))).toBeGreaterThanOrEqual(11);
  });
});
