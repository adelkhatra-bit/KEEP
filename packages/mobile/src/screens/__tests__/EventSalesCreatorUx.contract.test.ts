import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Loki event creation, sale and auto promotion safety', () => {
  const parties = read('mobile/src/screens/PartiesScreen.tsx');
  const profile = read('mobile/src/screens/ProfilePublicScreen.tsx');
  const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261012101000_event_auto_story_on_approval.sql'), 'utf8');

  it('creates a ticketed event straight from owner profile, no hamburger', () => {
    expect(profile).toContain('＋ SOIRÉE · BILLETS');
    expect(profile).toContain("openCreateEvent: true, source: 'profile-event'");
    expect(parties).toContain("route?.params?.openCreateEvent");
  });

  it('offers direct payout configuration rather than directing people to nested settings', () => {
    expect(parties).toContain('testID="event-direct-ticket-payout"');
    expect(parties).toContain('setMyPayoutLink(payoutLink)');
    expect(parties).toContain('getMyPayoutMethods()');
    expect(parties).toContain("ticketPriceCents !== null && !ticketPayoutReady");
    expect(parties).toContain("ticketPriceCents !== null ? 'PUBLIER · BILLETS'");
    expect(parties).toContain("ticketPriceCents !== null ? <View style={styles.eventPayoutCard}");
  });

  it('keeps checkout and approval for each real-money ticket', () => {
    expect(parties).toContain('requestEventTicketPurchase(event.id)');
    expect(parties).toContain("status: 'COMPLETED'");
    expect(parties).toContain('BILLETTERIE · TOUTES MES SOIRÉES');
    expect(parties).toContain('Chiffres déclarés dans Loki');
  });

  it('never allows tickets to be bought before approval or by a minor for 18+ events', () => {
    const ticketGuard = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261012104000_event_ticket_availability_guard.sql'), 'utf8');
    expect(ticketGuard).toContain("v_event.moderation_status::text <> 'APPROVED'");
    expect(ticketGuard).toContain("raise exception 'EVENT_NOT_AVAILABLE'");
    expect(ticketGuard).toContain("raise exception 'EVENT_ADULT_ONLY'");
    expect(ticketGuard).toContain('public.keep_event_request_ticket_purchase(uuid)');
    expect(ticketGuard).toContain("raise exception 'event_locked_after_approval'");
  });

  it('promotes relevant public events in Pulse but never floods it', () => {
    expect(profile).toContain('testID="loki-pulse-events-for-you"');
    expect(profile).toContain("items.filter((item) => item.creatorId !== user.id).slice(0, 2)");
    expect(profile).toContain("source: 'loki-pulse'");
    expect(profile).toContain('recommendedEventStories.length > 0');
    expect(profile).toContain("event.ticketPriceCents != null");
    expect(profile).toContain('setRecommendedEventStories([])');
  });

  it('only auto-stories approved and unexpired events, once per event', () => {
    expect(sql).toContain("new.moderation_status::text <> 'APPROVED'");
    expect(sql).toContain('coalesce(new.is_disabled, false)');
    expect(sql).toContain("coalesce(new.ends_at, new.starts_at + interval '6 hours') <= now()");
    expect(sql).toContain('on conflict(event_id) do nothing');
    expect(sql).toContain('drop trigger if exists trg_keep_auto_event_story_approved on public.events');
    expect(sql).toContain('after insert or update of moderation_status on public.events');
    expect(sql).not.toContain('delete from public.');
  });
});
