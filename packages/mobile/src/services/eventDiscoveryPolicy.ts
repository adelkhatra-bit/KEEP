export type EventDiscoveryItem = {
  kind: 'event';
  id: string;
  creatorId: string;
  username: string;
  avatarUrl: string | null;
  name: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  description: string | null;
  countryCode: string;
  currencyCode: string;
  ticketPriceCents: number | null;
  genres: string[];
  pinnedAt: string;
  rsvpStatus: 'GOING' | 'MAYBE' | 'NOT_GOING' | null;
};

export type EventDiscoveryStats = { eventId: string; views: number; going: number; shares: number; countryCode: string };

export function eventTicketPriceLabel(event: Pick<EventDiscoveryItem, 'ticketPriceCents' | 'currencyCode'>): string | null {
  if (!event.ticketPriceCents || event.ticketPriceCents <= 0) return null;
  if (!event.currencyCode) return 'Tarif indisponible';
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: event.currencyCode }).format(event.ticketPriceCents / 100);
  } catch {
    return `${(event.ticketPriceCents / 100).toFixed(2)} ${event.currencyCode}`;
  }
}

export function matchesEventMarket(event: Pick<EventDiscoveryItem, 'countryCode' | 'currencyCode'>, country: string, currency: string): boolean {
  const normalize = (value: string) => value.trim().toUpperCase();
  return Boolean(country && currency && event.countryCode && event.currencyCode)
    && normalize(event.countryCode) === normalize(country)
    && normalize(event.currencyCode) === normalize(currency);
}

/** Only distinct music cards actually seen earn a slot; catalog size, loops and events do not. */
export class PulseEventQuota {
  private tracks = new Set<string>();
  private events = new Set<string>();
  private tracksSinceEvent = 0;
  observeTrack(id: string): void {
    if (!id || this.tracks.has(id)) return;
    this.tracks.add(id);
    this.tracksSinceEvent += 1;
  }
  take(events: EventDiscoveryItem[]): EventDiscoveryItem | null {
    if (this.tracksSinceEvent < 10) return null;
    const next = events.find((event) => !this.events.has(event.id));
    if (!next) return null;
    this.events.add(next.id);
    this.tracksSinceEvent = 0;
    return next;
  }
}
