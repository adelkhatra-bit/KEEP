import fs from 'fs';
import path from 'path';

describe('Collection sale flow — no duplicates, mandatory payment mode', () => {
  const music = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');
  const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');

  it('centralizes creation in Collections/Pépites', () => {
    expect(panel).toContain('◆ Pépites');
    expect(panel).toContain('＋ CRÉER UNE COLLECTION');
    expect(panel).toContain('const openCollectionCart = async () =>');
    expect(panel).toContain('setCollectionCartOpen(true)');
    expect(panel).not.toContain('createSaleCollection: true');
    expect(music).not.toContain('Sélectionner ${track.title} pour une collection exclusive');
    expect(music).not.toContain("workspaceTab === 'COLLECTIONS'");
    expect(music).not.toContain("setWorkspaceTab('COLLECTIONS')");
    expect(music).not.toContain('◆ CRÉER AVEC CET ALBUM');
  });

  it('publishes only a named multi-track collection', () => {
    expect(panel).toContain('<Text style={s.collectionCartFieldLabel}>NOM DE LA COLLECTION</Text>');
    expect(panel).toContain('value={collectionCartName}');
    expect(panel).toContain("collectionCartStep === 'TRACKS' ? '1'");
    expect(panel).toContain('if (collectionCartIds.size < 2)');
  });

  it('forces mode selection, then distinguishes money from FREE', () => {
    expect(panel).toContain("setCollectionCartPaymentMode('FREE')");
    expect(panel).toContain("setCollectionCartPaymentMode('MONEY')");
    expect(panel).toContain('<Text style={s.collectionCartFieldLabel}>DEVISE</Text>');
    expect(panel).toContain('PAYPAL DÉJÀ ENREGISTRÉ');
    expect(panel).toContain('FREE');
    expect(panel).toContain('collectionCartPayoutLink');
  });
});
