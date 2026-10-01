// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('compact help and inline profile event contracts', () => {
  const parties = read(__dirname, '..', 'PartiesScreen.tsx');
  const playlists = read(__dirname, '..', 'MyMusicScreen.tsx');
  const publicProfile = read(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('keeps Soirées guidance behind a compact help control', () => {
    const header = parties.slice(parties.indexOf('<View style={styles.headerRow}>'), parties.indexOf('<View style={styles.partiesTabs}'));
    expect(header).toContain('Tout comprendre sur Soirées');
    expect(header).toContain('eventHelpButtonText}>?</Text>');
    expect(header).toContain('ContextHelpSheet');
    expect(header).not.toContain('<Text style={styles.subtitle}>');
    expect(parties).not.toContain('Publie, retrouve tes événements et réponds à tes invitations.');
  });

  it('keeps Playlists guidance behind a compact help control', () => {
    const header = playlists.slice(playlists.indexOf('<View style={styles.header}>'), playlists.indexOf("{mobileSection === 'HOME'"));
    expect(header).toContain('Tout comprendre sur Playlists');
    expect(header).toContain('headerHelpButtonText}>?</Text>');
    expect(header).not.toContain('Écouter · Trier · Organiser');
    expect(playlists).toContain('title="Tout faire dans Playlists"');
    expect(playlists).not.toContain('Choisis une action. Tu peux revenir ici quand tu veux.');
  });

  it('opens public-profile events inline and never navigates to Soirées from the spotlight', () => {
    const start = publicProfile.indexOf('{marketBannerEventIds.length > 0 || marketBannerPendingEventCount > 0 ?');
    const end = publicProfile.indexOf('<View style={styles.collectionHeader}>', start);
    const spotlight = publicProfile.slice(start, end);
    expect(spotlight).toContain('openProfileEventInline');
    expect(spotlight).toContain('ÇA BOUGE ICI');
    expect(spotlight).toContain('En attente que le Super Admin approuve l’événement');
    expect(spotlight).not.toContain("navigation.navigate('Parties'");
  });

  it('shows RSVP state without leaving the visited profile', () => {
    expect(publicProfile).toContain("['GOING', 'JE PARTICIPE']");
    expect(publicProfile).toContain("['MAYBE', 'PEUT-ÊTRE']");
    expect(publicProfile).toContain("['NOT_GOING', 'JE NE PARTICIPE PAS']");
    expect(publicProfile).toContain('profileEventCounts.going');
    expect(publicProfile).toContain('profileEventCounts.maybe');
    expect(publicProfile).toContain('Tu restes sur le profil de @');
    expect(publicProfile).toContain('EN ATTENTE D’APPROBATION');
  });
});
