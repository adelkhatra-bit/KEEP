import fs from 'fs';
import path from 'path';

describe('MyMusic private/protected filter', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('exposes a PRIVÉ filter that also contains active sale tracks', () => {
    expect(source).toContain("['PRIVATE', 'PRIVÉ']");
    expect(source).toContain("entry.visibility === 'PRIVATE' || Boolean(myOfferedTrackIds[entry.track.id])");
    expect(source).toContain("originFilter === 'PRIVATE' ? privateOrProtectedTracks");
    expect(source).toContain("'Privés et protégés'");
  });

  it('warns before preparing PUBLIC visibility for a track in an active sale', () => {
    expect(source).toMatch(/Cette musique est (?:en vente|dans une collection active)/);
    expect(source).toMatch(/masqu[eé].*collection.*active/i);
    expect(source).toContain("Retirer de la collection + Public");
  });
});
