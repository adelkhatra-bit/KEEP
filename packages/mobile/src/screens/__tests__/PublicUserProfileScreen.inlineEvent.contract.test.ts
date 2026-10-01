// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Public profile inline event contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('opens the event on the profile instead of redirecting away', () => {
    expect(source).toContain('const openProfileEventInline = async () =>');
    expect(source).toContain('onPress={() => { void openProfileEventInline(); }}');
    expect(source).toContain('sans quitter son profil');
  });

  it('keeps pending events private until Super Admin approval', () => {
    expect(source).toContain("marketBannerPendingEventCount > 0");
    expect(source).toContain('EN ATTENTE');
    expect(source).toContain('En attente que le Super Admin approuve l’événement');
  });

  it('supports the three RSVP choices inline for approved events', () => {
    expect(source).toContain('const chooseProfileEventRsvp = async (status: EventRsvpStatus) =>');
    expect(source).toContain('setEventRsvp(effectiveViewerId, profileEvent.id, status)');
    expect(source).toContain("['GOING', 'JE PARTICIPE']");
    expect(source).toContain("['MAYBE', 'PEUT-ÊTRE']");
    expect(source).toContain("['NOT_GOING', 'JE NE PARTICIPE PAS']");
  });
});
