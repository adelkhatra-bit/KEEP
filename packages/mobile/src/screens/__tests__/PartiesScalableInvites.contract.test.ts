import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g,'\n');

describe('Soirées navigation + scalable invitations', () => {
  const parties = read('packages','mobile','src','screens','PartiesScreen.tsx');
  const discover = read('packages','mobile','src','screens','DiscoverScreen.tsx');
  const banner = read('packages','mobile','src','components','GlobalNotificationBanner.tsx');
  const service = read('packages','mobile','src','services','creatorEventService.ts');
  const migration = read('supabase','migrations','20260930215500_event_audience_delivery_scaling.sql');

  it('uses one standard back control from Soirées sub-rubrics', () => {
    expect(parties).toContain('<StandardBackButton label="Soirées"');
    expect(discover).toContain('<StandardBackButton label="Soirées"');
    expect(parties).toContain('Retour aux rubriques Soirées');
  });

  it('lets creators classify the event audience without exposing birth dates', () => {
    expect(service).toContain("export type EventAudienceMode = 'GENERAL' | 'ADULTS_18_PLUS' | 'FAMILY'");
    expect(parties).toContain('Public de l’événement');
    expect(parties).toContain("['ADULTS_18_PLUS','18+','Adultes uniquement']");
    expect(migration).toContain("p.is_adult=true");
    expect(migration).not.toContain('birth_date');
  });

  it('shows an actionable event banner with accept/refuse', () => {
    expect(banner).toContain("return String(notification.type || '').toUpperCase() === 'EVENT_INVITE'");
    expect(banner).toContain('REFUSER');
    expect(banner).toContain('J’Y VAIS');
    expect(banner).toContain("setEventRsvp(user.id, eventId, accept ? 'GOING' : 'NOT_GOING')");
  });

  it('fans out event invitations by bounded idempotent batches', () => {
    expect(migration).toContain('event_delivery_jobs');
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain('limit v_batch');
    expect(migration).toContain('keep-event-delivery-batches');
    expect(migration).toContain('event_recommendation_sends');
  });
});
