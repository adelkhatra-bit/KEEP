import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('Loki events: seller checkout, moderation and Pulse visibility', () => {
  const parties = read('packages/mobile/src/screens/PartiesScreen.tsx');
  const profile = read('packages/mobile/src/screens/ProfilePublicScreen.tsx');
  const approvalGuard = read('supabase/migrations/20261012012500_event_moderation_owner_guard.sql');
  const migration = read('supabase/migrations/20261012013000_auto_story_on_approved_event.sql');
  const ranking = read('supabase/migrations/20261012013500_personalized_event_pulse_ranking.sql');

  it('offers a clear direct organizer payout setup inside the same event form', () => {
    expect(parties).toContain('testID="event-ticket-seller-onboarding"');
    expect(parties).toContain('desktopParties && styles.desktopEventBackdrop');
    expect(parties).toContain('desktopParties && styles.desktopEventSheet');
    expect(parties).toContain("maxWidth:960,height:'90%'");
    expect(parties).toContain('Vendre des billets');
    expect(parties).toContain('setMyPayoutLink(eventPayoutLink)');
    expect(parties).toContain('getMyPayoutMethods()');
    expect(parties).toContain('eventPayoutQrConfigured');
    expect(parties).toContain('await setEventTicketPrice(created.id, ticketPriceCents);');
    expect(parties).toContain('setEditingEventId(created.id);');
    expect(parties).toContain('Réessaie ici sans recréer une soirée.');
    expect(parties).not.toContain('setEventTicketPrice(created.id, ticketPriceCents).catch(() => {})');
  });

  it('publishes an approved organizer event automatically and only once', () => {
    expect(approvalGuard).toContain("auth.role() in ('authenticated','anon')");
    expect(approvalGuard).toContain("raise exception 'EVENT_ADMIN_APPROVAL_REQUIRED'");
    expect(approvalGuard).toContain('before insert or update on public.events');
    expect(approvalGuard).toContain("new.photo_status::text = 'APPROVED'");
    expect(migration).toContain("new.moderation_status::text <> 'APPROVED'");
    expect(migration).toContain("coalesce(new.is_disabled,false)");
    expect(migration).toContain('coalesce(new.ends_at,new.starts_at');
    expect(migration).toContain('on conflict(event_id) do nothing');
    expect(migration).toContain('after insert or update of moderation_status on public.events');
    expect(parties).toContain('publishEventStory(currentEvent.id)'); // manual renewal stays
  });

  it('explains Story publication in Soirées without bypassing admin moderation or re-sharing expired events', () => {
    expect(parties).toContain('testID="event-story-how-it-works"');
    expect(parties).toContain('STORY + LOKI PULSE · AUTOMATIQUE');
    expect(parties).toContain('Après validation de la photo et du texte');
    expect(parties).toContain("currentEvent.moderationStatus === 'APPROVED' && eventNotFinished(currentEvent)");
    expect(parties).toContain('testID="event-publish-to-story"');
    expect(parties).toContain('publishEventStory(currentEvent.id)');
    expect(parties).toContain('La photo et le texte passent au Super Admin.');
    expect(parties).not.toContain("Après création, ta soirée est déjà publiée en Story.");
  });

  it('gives other users a chance to discover events in Pulse without exposing 18+ to minors', () => {
    expect(profile).toContain('setMyPulseEventStories(items.slice(0, 6))');
    expect(profile).not.toContain('setMyPulseEventStories(items.filter((item) => item.creatorId === user.id))');
    expect(profile).toContain('SOIRÉES À DÉCOUVRIR · LOKI PULSE');
    expect(ranking).toContain("favorite_artists");
    expect(ranking).toContain('viewer.country_code=e.country_code');
    expect(ranking).toContain('r.going_count*5 + r.maybe_count');
    expect(ranking).toContain("e.audience_mode <> 'ADULTS_18_PLUS'");
    expect(ranking).toContain('s.created_at>=now()');
  });

  it('shows pulse events to other users in Discover, once, and navigates to actual booking', () => {
    const discover = read('packages/mobile/src/screens/DiscoverScreen.tsx');
    expect(discover).toContain('loadEventStories(12)');
    expect(discover).toContain('event.creatorId !== user.id');
    expect(discover).toContain('regularEvents.length ? regularEvents.map');
    expect(discover).toContain('!pulseEventIds.has(event.id)');
    expect(discover).toContain('testID="discover-event-loki-pulse"');
    expect(discover).toContain("navigation.navigate('Parties', { openEventId: event.eventId })");
    expect(discover).toContain('event.goingCount');
    expect(discover).toContain('event.pulseScore');
  });

  it('shows real seller history and separate ticket stats (cockpit shared by mobile and desktop) without inventing payment verification', () => {
    const dashboard = read('packages/mobile/src/components/CreatorSalesCockpit.tsx');
    expect(dashboard).toContain('loadMySalesHistory()');
    expect(dashboard).toContain('loadMyEventTicketSales()');
    expect(dashboard).toContain("sale.status === 'COMPLETED'");
    expect(dashboard).toContain("sale.status === 'PENDING'");
    expect(dashboard).toContain("sale.currencyCode === 'EUR'");
    expect(dashboard).toContain('non vérifiés auprès des prestataires');
    expect(profile).toContain('<CreatorSalesCockpit');
    expect(profile).toContain("navigation.navigate('PlaylistSaleHistory')");
    expect(profile).toContain('desktopProfile && !accountRequired');
    expect(parties).toContain('route?.params?.openMyEvents');
  });

  it('surfaces clear owner sales and party actions on desktop, reusing existing screens', () => {
    expect(profile).toContain('desktopProfile && !accountRequired');
    expect(profile).toContain('◆ VENDRE');
    expect(profile).toContain('＋ SOIRÉE');
    expect(profile).toContain('openPaymentHistory: true');
    expect(profile).toContain('openCreateEvent: true');
    expect(profile).toContain("navigation.navigate('PlaylistSale')");
    expect(parties).toContain('if (!route?.params?.openCreateEvent) return;');
  });
});
