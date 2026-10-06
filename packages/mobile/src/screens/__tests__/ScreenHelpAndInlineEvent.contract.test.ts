// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('compact help + inline profile event UI contract', () => {
  const parties = read(__dirname, '..', 'PartiesScreen.tsx');
  const playlists = read(__dirname, '..', 'MyMusicScreen.tsx');
  const publicProfile = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('keeps Soirées visually compact and moves explanations behind ?', () => {
    expect(parties).toContain("<Text style={styles.title}>{partiesTab === 'BATTLE' ? 'Loki Music BATTLE' : 'Soirées'}</Text>");
    expect(parties).toContain('accessibilityLabel={eventAccessInfoOpen ? "Masquer l\'aide Événements" : "Tout comprendre sur Soirées"}');
    expect(parties).toContain('title="Tout faire dans Soirées"');
    expect(parties).not.toContain("Tes soirées et invitations, sans doublon avec Découvertes.");
    expect(parties).not.toContain("Publie, retrouve tes événements et réponds à tes invitations.");
  });

  it('keeps Playlists visually compact and moves explanations behind ?', () => {
    const headerStart = playlists.indexOf('<View style={styles.header}>');
    const headerEnd = playlists.indexOf('</View>\n\n      {mobileSection', headerStart);
    const header = playlists.slice(headerStart, headerEnd);
    expect(header).toContain('<Text style={styles.title} numberOfLines={1}>Playlists</Text>');
    expect(header).toContain('accessibilityLabel="Tout comprendre sur Playlists"');
    expect(playlists).toContain('title="Tout faire dans Playlists"');
    expect(header).not.toContain('Écouter · Trier · Organiser');
    expect(playlists).not.toContain('<Text style={styles.focusHomeTitle}>Que veux-tu faire ?</Text>');
    expect(playlists).not.toContain('<Text style={styles.focusHomeHint}>Choisis une action. Tu peux revenir ici quand tu veux.</Text>');
  });

  it('opens profile events inline and never redirects the spotlight to Soirées', () => {
    const blockStart = publicProfile.indexOf('{marketBannerEventIds.length > 0 || marketBannerPendingEventCount > 0');
    const blockEnd = publicProfile.indexOf('<View style={styles.collectionHeader}>', blockStart);
    const block = publicProfile.slice(blockStart, blockEnd);
    expect(blockStart).toBeGreaterThan(-1);
    expect(block).toContain('onPress={() => { void openProfileEventInline(); }}');
    expect(block).not.toContain("navigation.navigate('Parties'");
    expect(block).toContain('ÇA BOUGE ICI');
    expect(block).toContain('En attente que le Super Admin approuve l’événement');
    expect(publicProfile).toContain('<KeepModal visible={profileEventOpen}');
    expect(publicProfile).toContain("['GOING', 'JE PARTICIPE']");
    expect(publicProfile).toContain("['MAYBE', 'PEUT-ÊTRE']");
    expect(publicProfile).toContain("['NOT_GOING', 'JE NE PARTICIPE PAS']");
    expect(publicProfile).toContain('Tu restes sur le profil de @{profile.username}');
  });

  it('locks the same behavior in the canonical product contract', () => {
    expect(contract.eventExperience.profileEventTapMustStayInline).toBe(true);
    expect(contract.eventExperience.pendingEventsMustSaySuperAdminApprovalRequired).toBe(true);
    expect(contract.screenHelpRules.parties.permanentIntro).toBe(false);
    expect(contract.screenHelpRules.parties.helpTrigger).toBe('?');
    expect(contract.screenHelpRules.playlists.permanentIntro).toBe(false);
    expect(contract.screenHelpRules.playlists.helpTrigger).toBe('?');
  });
});
