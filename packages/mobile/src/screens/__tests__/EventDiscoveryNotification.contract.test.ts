// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('event discovery notification contract', () => {
  const notifications = read(__dirname, '..', 'NotificationsScreen.tsx');
  const discover = read(__dirname, '..', 'DiscoverScreen.tsx');
  const publicProfile = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('routes event notifications to Discover > Events, never Parties', () => {
    expect(notifications).toContain("screen: 'Discover'");
    expect(notifications).toContain("focus: 'EVENTS'");
    expect(notifications).toContain("source: 'NOTIFICATION_EVENT'");
    const eventBranch = notifications.slice(notifications.indexOf('if (eventId)'), notifications.indexOf('const arenaRaw'));
    expect(eventBranch).not.toContain("screen: 'Parties'");
  });

  it('opens the notification event inline inside Discover with RSVP actions', () => {
    expect(discover).toContain("const requestedId = String(route?.params?.openEventId ?? route?.params?.eventId ?? '').trim();");
    expect(discover).toContain('void openEventInline(event);');
    expect(discover).toContain("await setEventRsvp(user.id, eventDetail.id, status);");
    expect(discover).toContain("onPress={() => { void openEventInline(event); }}");
  });

  it('keeps visited-profile event interaction inline rather than redirecting tabs', () => {
    expect(publicProfile).toContain('profileEventOpen');
    expect(publicProfile).not.toContain("navigation.navigate('Parties', { openEventId:");
  });

  it('locks free event promotion defaults in the canonical product contract', () => {
    expect(contract.eventDiscovery.notificationRoute).toBe('Main.Discover');
    expect(contract.eventDiscovery.discoverBehavior).toBe('event-detail-inline-with-rsvp');
    expect(contract.eventDiscovery.freeEventPromotionDefault).toBe(true);
    expect(contract.eventDiscovery.freeMarketingPromotionDefault).toBe(true);
    expect(contract.eventDiscovery.optOutPlans).toEqual(['CREATOR_PRO','VENUE_PRO']);
  });
});
