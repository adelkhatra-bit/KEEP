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

  it('is a full-width animated primary action with the same visual hierarchy as the owner profile', () => {
    expect(source).toContain("import MotionActionButton from '../components/MotionActionButton';");
    expect(source).toContain('title="SWIPE"');
    expect(source).toContain('tone="primary"');
    expect(source).toContain('style={styles.visitorSwipeMotion}');
  });

  it('is placed right after identity/bio, before the collection section, not buried in a small pill next to Follow', () => {
    const bioIdx = source.indexOf('{!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}');
    const swipeIdx = source.indexOf('title="SWIPE"');
    const collectionIdx = source.indexOf('style={styles.marketplaceSection}');
    expect(bioIdx).toBeGreaterThan(-1);
    expect(swipeIdx).toBeGreaterThan(bioIdx);
    expect(collectionIdx).toBeGreaterThan(swipeIdx);
  });
});
