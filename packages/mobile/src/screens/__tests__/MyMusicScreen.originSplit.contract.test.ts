import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('MyMusicScreen — séparation écoute / utilisateurs', () => {
  const screen = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const row = readNormalized(__dirname, '..', '..', 'components', 'TrackActionRow.tsx');
  const core = readNormalized(__dirname, '..', '..', 'services', 'keepMusicCoreRecognition.ts');

  it('sépare la bibliothèque selon sourceProfileId', () => {
    expect(screen).toContain("localKeptEntries.filter((entry) => !entry.sourceProfileId)");
    expect(screen).toContain("localKeptEntries.filter((entry) => Boolean(entry.sourceProfileId))");
  });

  it('affiche deux sections explicitement nommées', () => {
    expect(screen).toContain('Musiques de mes écoutes');
    expect(screen).toContain("Musiques reprises d'autres utilisateurs");
    expect(screen).toContain('depuis tes écoutes');
    expect(screen).toContain('depuis des utilisateurs');
  });

  it('rend l’origine visible sur chaque ligne sans ouvrir le détail', () => {
    expect(screen).toContain("label: localEntry.sourceProfileId");
    expect(screen).toContain(": 'ÉCOUTE'");
    expect(screen).toContain("'social' : 'listen'");
    expect(row).toContain('originBadge?:');
    expect(row).toContain('originBadgeTextSocial');
    expect(row).toContain('originBadgeTextListen');
  });

  it('recharge aussi la provenance serveur après reconnexion/reload', () => {
    expect(core).toContain('source_user_id');
    expect(core).toContain('context.sourceProfileId');
    expect(core).toContain("row.source_type === 'profile'");
    expect(core).toContain("creditPolicy: isSocial ? 'SOCIAL_ZERO_CREDIT' : 'LISTEN_KEEP'");
  });
});
