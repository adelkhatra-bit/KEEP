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

  it('supports RSVP inline for approved events', () => {
    expect(source).toContain('const joinProfileEvent = async () =>');
    expect(source).toContain("setEventRsvp(viewer.id, profileEvent.id, 'GOING')");
    expect(source).toContain("profileEventRsvp === 'GOING'");
  });
});
