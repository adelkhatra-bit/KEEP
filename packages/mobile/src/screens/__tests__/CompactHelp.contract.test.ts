// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('compact help contract', () => {
  const parties = read(__dirname, '..', 'PartiesScreen.tsx');
  const playlists = read(__dirname, '..', 'MyMusicScreen.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('keeps Soirées compact and moves explanations behind ?', () => {
    expect(parties).toContain("partiesTab === 'BATTLE' ? 'Loki Music BATTLE' : 'Soirées'");
    expect(parties).toContain('eventHelpButton');
    expect(parties).toContain('Tout faire dans Soirées');
    expect(parties).not.toContain('Publie, retrouve tes événements et réponds à tes invitations.');
    expect(parties).not.toContain('<Text style={styles.partyHomeMeta}>Soirée, concert, porte ouverte ou rendez-vous</Text>');
    expect(parties).not.toContain('<Text style={styles.partyHomeMeta}>Lieu, heure, participants et activité</Text>');
    expect(parties).not.toContain('<Text style={styles.partyHomeMeta}>Répondre oui, peut-être ou non</Text>');
  });

  it('keeps Playlists compact and moves explanations behind ?', () => {
    expect(playlists).toContain('headerHelpButton');
    expect(playlists).toContain('Tout faire dans Playlists');
    expect(playlists).not.toContain('Écouter · Trier · Organiser');
    expect(playlists).not.toContain('<Text style={styles.focusHomeTitle}>Que veux-tu faire ?</Text>');
    expect(playlists).not.toContain('Choisis une action. Tu peux revenir ici quand tu veux.');
  });

  it('locks the same behavior in the product contract', () => {
    expect(contract.screenHelpRules.parties.permanentIntro).toBe(false);
    expect(contract.screenHelpRules.parties.helpTrigger).toBe('?');
    expect(contract.screenHelpRules.playlists.permanentIntro).toBe(false);
    expect(contract.screenHelpRules.playlists.helpTrigger).toBe('?');
  });
});
