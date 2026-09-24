// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs
  .readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

describe('ProfilePublicScreen — owner actions stay together in the hero', () => {
  it('keeps preview, invite/share, sales and Battle controls before the collection', () => {
    const preview = source.indexOf('title="PRÉVISUALISER MON UNIVERS"');
    const invite = source.indexOf('title="INVITER / PARTAGER"');
    const sales = source.indexOf("title={playlistSaleOffers.length > 0 ? 'GÉRER MES COLLECTIONS' : 'CRÉER UNE COLLECTION'}");
    const battle = source.indexOf('⚡ BATTLE · {battleAvailable');
    const solo = source.indexOf('title="JOUER EN SOLO"');
    const collection = source.indexOf('<View style={s.collectionHeader}>');

    expect(preview).toBeGreaterThanOrEqual(0);
    expect(invite).toBeGreaterThan(preview);
    expect(sales).toBeGreaterThan(invite);
    expect(battle).toBeGreaterThan(sales);
    expect(solo).toBeGreaterThan(battle);
    expect(collection).toBeGreaterThan(solo);
  });

  it('keeps offer status and Battle help local to their controls', () => {
    expect(source).toContain("`${playlistSaleOffers.length} collection${playlistSaleOffers.length > 1 ? 's' : ''} active${playlistSaleOffers.length > 1 ? 's' : ''}`");
    expect(source).toContain("Les autres peuvent t’inviter maintenant.");
    expect(source).toContain("Active pour recevoir des défis.");
    expect(source).toContain("utilise JOUER EN SOLO ici ou visite le profil d’un joueur disponible");
    expect(source).toContain("navigation.navigate('Parties', { openBattle: true, source: 'profile-solo' })");
    expect(source).toContain('accessibilityLabel="Jouer un Battle solo"');
  });

  it('uses animated premium actions for preview, sharing, sales and solo Battle', () => {
    expect(source).toContain("import MotionActionButton from '../components/MotionActionButton';");
    expect(source.match(/<MotionActionButton/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain('tone="battle"');
    expect(source).toContain('tone="success"');
  });

  it('does not reintroduce the old duplicate sales status block below the hero', () => {
    expect(source).not.toContain('style={s.ownOffersStatus}');
    expect(source).not.toContain('Gérer mes découvertes en vente');
  });

  it('shows published collections as an unlocked horizontal rail on the owner profile', () => {
    expect(source).toContain('style={s.ownerCollectionRail}');
    expect(source).toContain('Mes collections exclusives');
    expect(source).toContain('horizontal');
    expect(source).toContain('badgeLabel="✓ PUBLIÉE"');
    expect(source).toContain('€ / FREE');
  });
  it('keeps style listening and collection creation directly on the immersive card', () => {
    expect(source).toContain("import ProfileStyleCard from '../components/ProfileStyleCard';");
    expect(source).toContain("onPress={() => openSelectionSwipe({ title: folder.genre");
    expect(source).toContain("actionLabel={marketplaceEnabled ? 'CRÉER' : undefined}");
    expect(source).toContain("preselectSaleGenre: folder.genre");
    expect(source).toContain("fullWidth={genreFolders.length % 2 === 1 && index === genreFolders.length - 1}");
  });

});
