// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PublicUserProfileScreen — bouton SWIPE aussi visible que sur le profil personnel (Adel, 21/09/2026)', () => {
  const source = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('reuses the existing swipe mechanism (openBrowseSwipe + MusicSwipeDeckModal) instead of a new one -- nothing was missing, only under-styled', () => {
    expect(source).toContain('onPress={() => openBrowseSwipe(null)}');
    expect(source).toContain("import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';");
  });

  it('keeps SWIPE, BATTLE and PARTAGER in one aligned action row', () => {
    expect(source).toContain('<View style={styles.visitorActionRow}>');
    expect(source).toContain('<Text style={styles.visitorActionIcon}>▶</Text><Text style={styles.visitorActionLabel}>SWIPE</Text>');
    expect(source).toContain('<BattleGlowButton');
    expect(source).toContain('style={styles.visitorActionMotion}');
    expect(source).toContain("visitorActionMotion:{flex:1,minWidth:0,height:54,alignSelf:'stretch'}");
    expect(source).toContain('minHeight:54');
  });

  it('is placed right after identity/bio, before the collection section, not buried in a small pill next to Follow', () => {
    const bioIdx = source.indexOf('{!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}');
    const swipeIdx = source.indexOf('<Text style={styles.visitorActionIcon}>▶</Text><Text style={styles.visitorActionLabel}>SWIPE</Text>');
    const collectionIdx = source.indexOf('style={styles.marketplaceSection}');
    expect(bioIdx).toBeGreaterThan(-1);
    expect(swipeIdx).toBeGreaterThan(bioIdx);
    expect(collectionIdx).toBeGreaterThan(swipeIdx);
  });
});
