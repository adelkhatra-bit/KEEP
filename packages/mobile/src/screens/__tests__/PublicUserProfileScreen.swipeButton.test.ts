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

  it('keeps SWIPE, TCHAT, BATTLE and PARTAGER in one aligned action row, same component as the owner profile', () => {
    expect(source).toContain('<View style={styles.ownerQuickActions}>');
    expect(source).toContain('▶ SWIPE');
    expect(source).toContain('◉ TCHAT');
    expect(source).toContain("{battleInviteBusy ? '⚡ ENVOI…' : '⚡ BATTLE'}");
    expect(source).toContain('↗ PARTAGER');
  });

  it('is placed right after identity/bio, before the collection section, not buried in a small pill next to Follow', () => {
    const bioIdx = source.indexOf('{!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}');
    const swipeIdx = source.indexOf('▶ SWIPE');
    const collectionIdx = source.indexOf('<SellerBoutique');
    expect(bioIdx).toBeGreaterThan(-1);
    expect(swipeIdx).toBeGreaterThan(bioIdx);
    expect(collectionIdx).toBeGreaterThan(swipeIdx);
  });

  it('keeps the canonical visitor actions visible from any entry point', () => {
    expect(source).toContain('▶ SWIPE');
    expect(source).toContain('◉ TCHAT');
    expect(source).toContain('⚡ BATTLE');
    expect(source).toContain('↗ PARTAGER');
    expect(source).toContain('const openProfileChat =');
    expect(source).toContain('useGlobalChatStore.getState().open');
    expect(source).not.toContain('▶ APERÇU');
  });
});
