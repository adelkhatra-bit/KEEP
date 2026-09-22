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

  it('is a full-width primary (violet) button, same visual weight as the owner profile\'s ownerSwipeButton', () => {
    expect(source).toContain("visitorSwipeButton:{minHeight:52,borderRadius:16,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',marginTop:12,width:'100%'}");
    expect(source).toContain('<Text style={styles.visitorSwipeButtonText}>▶ SWIPE</Text>');
  });

  it('is placed right after identity/bio, before the collection section, not buried in a small pill next to Follow', () => {
    const bioIdx = source.indexOf('{!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}');
    const swipeIdx = source.indexOf('visitorSwipeButton} onPress={() => openBrowseSwipe(null)}');
    expect(bioIdx).toBeGreaterThan(-1);
    expect(swipeIdx).toBeGreaterThan(bioIdx);
    expect(swipeIdx - bioIdx).toBeLessThan(700);
  });
});
