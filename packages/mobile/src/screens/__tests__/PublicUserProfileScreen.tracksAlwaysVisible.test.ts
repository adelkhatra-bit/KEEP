// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PublicUserProfileScreen — Styles first, detailed tracks preserved (Adel, design validé 24/09/2026)', () => {
  const source = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('keeps Styles as the primary collection view and the full track list as a secondary explicit action', () => {
    expect(source).toContain("{ key: 'TRACKS', label: 'Styles' }");
    expect(source).toContain('const [showAllTracks, setShowAllTracks] = useState(false);');
    expect(source).toContain('VOIR TOUS LES MORCEAUX');
    expect(source).toContain('onPress={() => setShowAllTracks((v) => !v)}');
  });

  it('does not reintroduce the obsolete musicListExpanded accordion state', () => {
    expect(source).not.toContain('musicListExpanded');
    expect(source).not.toContain('setMusicListExpanded');
  });

  it('keeps the complete detailed track list and its zero-track empty state behind the secondary action', () => {
    expect(source).toContain('{showAllTracks ? <>');
    expect(source).toContain('{tracks.length > 0 ? (');
    expect(source).toContain('Aucun morceau public sur ce profil.');
  });
});
