// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('MyMusicScreen — principe produit (Adel, 21/09/2026) : "on ne cache jamais une fonctionnalité, on la montre verrouillée"', () => {
  const source = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');

  it('imports the reusable LockedFeatureCard instead of a one-off implementation', () => {
    expect(source).toContain("import LockedFeatureCard from '../components/LockedFeatureCard';");
  });

  it('the collection entry point never disappears when the follower threshold is not met -- it stays visible, locked', () => {
    const block = source.slice(source.indexOf('title="Créer une collection exclusive"') - 400, source.indexOf('title="Créer une collection exclusive"') + 1200);
    expect(block).toContain('unlocked={Boolean(saleAccess?.unlocked)}');
    expect(block).toContain('🔒 COLLECTION');
  });

  it('the playlist/album-level collection entry point is also locked-visible, not hidden', () => {
    const idx = source.indexOf('Créer une collection avec cet album');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx - 400, idx + 900);
    expect(block).toContain('unlocked={Boolean(saleAccess?.unlocked)}');
  });

  it('the "Créer une collection exclusive" banner is locked-visible instead of only appearing once unlocked', () => {
    const idx = source.indexOf('lockedTeaser={<View style={styles.selectionStartButton}');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx - 700, idx + 700);
    expect(block).toContain('unlocked={Boolean(saleAccess?.unlocked)}');
    expect(block).toContain('🔒 CRÉER UNE COLLECTION EXCLUSIVE');
  });

  it('an already-existing offer is never re-locked by this change -- managing a live sale stays a direct action', () => {
    expect(source).toContain('offered ? (\n                  <TouchableOpacity\n                    style={[styles.sellTrackButton, styles.sellTrackButtonOffered]}\n                    onPress={() => editExistingTrackOffer(track)}');
  });

  it('the popup benefit text explains the collection flow, per the mission spec', () => {
    expect(source).toContain('Compose une collection avec tes découvertes');
  });

  it('never publishes a one-track product from the collection creation flow', () => {
    expect(source).toContain('if (tracks.length < 2)');
    expect(source).toContain('Une collection représente ton univers musical, jamais un morceau isolé.');
    expect(source).toContain('disabled={selectedSaleTrackIds.size < 2}');
  });
});
