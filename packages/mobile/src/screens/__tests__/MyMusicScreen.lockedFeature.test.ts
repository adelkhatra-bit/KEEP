// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('MyMusicScreen — principe produit (Adel, 21/09/2026) : "on ne cache jamais une fonctionnalité, on la montre verrouillée"', () => {
  const source = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');

  it('imports the reusable LockedFeatureCard instead of a one-off implementation', () => {
    expect(source).toContain("import LockedFeatureCard from '../components/LockedFeatureCard';");
  });

  it('the per-track VENDRE entry point never disappears when the follower threshold is not met -- it stays visible, locked', () => {
    const block = source.slice(source.indexOf("title=\"Vendre des morceaux\"") - 400, source.indexOf("title=\"Vendre des morceaux\"") + 900);
    expect(block).toContain('unlocked={Boolean(saleAccess?.unlocked)}');
    expect(block).toContain("lockedTeaser={<View style={styles.sellTrackButton}><Text style={styles.sellTrackText}>🔒 VENDRE</Text></View>}");
  });

  it('the playlist/album-level VENDRE entry point is also locked-visible, not hidden', () => {
    const idx = source.indexOf('Vendre cet album');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx - 400, idx + 900);
    expect(block).toContain('unlocked={Boolean(saleAccess?.unlocked)}');
  });

  it('the "Créer une playlist à vendre" banner is locked-visible instead of only appearing once unlocked', () => {
    const idx = source.indexOf('title="Créer une playlist à vendre"');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx - 400, idx + 700);
    expect(block).toContain('unlocked={Boolean(saleAccess?.unlocked)}');
    expect(block).toContain('🔒 CRÉER UNE PLAYLIST À VENDRE');
  });

  it('an already-existing offer is never re-locked by this change -- managing a live sale stays a direct action', () => {
    expect(source).toContain('offered ? (\n                  <TouchableOpacity\n                    style={[styles.sellTrackButton, styles.sellTrackButtonOffered]}\n                    onPress={() => editExistingTrackOffer(track)}');
  });

  it('the popup benefit text explains what unlocking gives, per the mission spec', () => {
    expect(source).toContain('Vends tes découvertes, reçois les paiements directement');
  });
});
