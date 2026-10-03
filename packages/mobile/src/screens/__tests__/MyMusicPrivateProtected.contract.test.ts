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
    expect(source).toContain("'Cette musique est en vente'");
    expect(source).toContain('Elle restera masquée tant que la collection est active.');
    expect(source).toContain("toggleTrackVisibility(track, true)");
  });
});
