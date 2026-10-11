import fs from 'fs';
import path from 'path';

const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');

describe('Adel 10/10/2026 : texte d\'événement replié + pochette toujours cherchée', () => {
  it('la description d\'un événement passe par ClampedText dans une zone défilante (boutons toujours visibles)', () => {
    const discover = read('DiscoverScreen.tsx');
    expect(discover).toContain("import ClampedText from '../components/ClampedText';");
    expect(discover).toContain('<ClampedText style={styles.eventModalBody} text={eventDetail.description} />');
    expect(discover).toContain('styles.eventModalBodyScroll');
    expect(discover).not.toContain('<Text style={styles.eventModalBody}>{eventDetail.description}</Text>');
  });

  it('le résultat d\'écoute affiche TrackCover (nom + pochette, pochette cherchée si absente)', () => {
    const home = read('HomeScreenCompact.tsx');
    expect(home).toContain('<TrackCover track={current.track}');
    expect(home).toContain('<Text style={s.trackTitle} numberOfLines={1}>{current.track.title}</Text>');
    const cover = read('..', 'components', 'TrackCover.tsx');
    expect(cover).toContain('resolveTrackArtworkUrl');
  });
});
