// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Adel (21/09/2026) : "il ne faut pas qu'il y ait la possibilité de vendre
 * une musique que l'utilisateur a pris à un autre utilisateur -- il faut lui
 * mettre un cadenas et quand il clique dessus ça lui dit que cette musique
 * ne lui appartient pas, elle appartient à un autre utilisateur."
 *
 * Et, séparément : "côté profil utilisateur, lorsqu'un autre utilisateur va
 * visiter un autre utilisateur, il faut que tout soit visible -- même s'il
 * n'a pas de musique à la vente, il faut que le système soit fonctionnel et
 * visible. Et quand je clique dessus, ça marque qu'il n'a pas encore de
 * musique en vente."
 */
describe('Vente de musique -- cadenas "pas ta découverte" + section toujours visible sur le profil visité (Adel, 21/09/2026)', () => {
  const myMusic = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const publicProfile = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('MyMusicScreen locks the sale checkbox for a track that came from another profile (sourceProfileId set = not self-discovered)', () => {
    expect(myMusic).toContain('const notOwnDiscovery = Boolean(localEntry?.sourceProfileId);');
    expect(myMusic).toContain("(offered || notOwnDiscovery) && styles.selectionCheckDisabled");
    expect(myMusic).toContain("{notOwnDiscovery ? '🔒' : selectedSaleTrackIds.has(track.id) ? '✓' : ''}");
  });

  it('tapping the locked checkbox tells the user the track belongs to someone else, not a silent no-op', () => {
    expect(myMusic).toContain("? Alert.alert('Pas à vendre', `\"${track.title}\" ne t'appartient pas, elle appartient à un autre utilisateur : tu ne peux pas la vendre.`)");
  });

  it('the lock never fully disables the checkbox (only "offered" does) so the explanatory tap still fires', () => {
    expect(myMusic).toContain('disabled={Boolean(offered)}');
    expect(myMusic).not.toContain('disabled={Boolean(offered || notOwnDiscovery)}');
  });

  it('PublicUserProfileScreen always renders the "Découvertes à débloquer" section once marketplace is enabled -- never fully hidden just because the seller has zero active offers', () => {
    expect(publicProfile).toContain('{marketplaceEnabled ? (');
    expect(publicProfile).not.toContain('{marketplaceEnabled && saleOffers.length > 0 ? (');
  });

  it('an empty offer list shows a tappable, explicit "pas encore de musique en vente" state instead of nothing', () => {
    expect(publicProfile).toContain('{saleOffers.length === 0 ? (');
    expect(publicProfile).toContain("onPress={() => Alert.alert('Découvertes à débloquer', `@${profile.username} n'a pas encore de musique en vente.`)}");
    expect(publicProfile).toContain('<Text style={styles.marketplaceEmptyText}>Pas encore de musique en vente</Text>');
  });
});
