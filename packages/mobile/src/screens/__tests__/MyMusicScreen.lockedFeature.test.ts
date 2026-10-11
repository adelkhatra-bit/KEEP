// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Collection sale entry — one source of truth', () => {
  const music = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const panel = readNormalized(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx');

  it('shows the lock and its benefit in the dedicated Collections screen', () => {
    expect(panel).toContain('🔒 CRÉER UNE COLLECTION');
    expect(panel).toContain('Il te manque');
    expect(panel).toContain('En €');
    expect(panel).toContain('En FREE');
  });

  it('uses one creation entry and opens MyMusic only as the track selector', () => {
    // 1d1ecb70 / 0e5272a1 : la création reste dans Pépites (contrat marketplacePurchases.collectionCreationMustRemainInPepites).
    expect(panel).not.toContain("screen: 'MyMusic', params: { createSaleCollection: true");
    expect(panel).toContain('collectionCartOpen');
    expect(music).toContain("if (!route?.params?.createSaleCollection) return;");
    expect(music).toContain("setSaleSelectionMode(true);");
    expect(music).not.toContain('🔒 CRÉER UNE COLLECTION EXCLUSIVE');
    expect(music).not.toContain('＋ CRÉER UNE COLLECTION EXCLUSIVE');
  });

  it('never creates a one-track product', () => {
    expect(music).toContain("if (saleCartTracks.length < 2)");
    expect(music).toContain("Une Pépite représente une vraie sélection, jamais un morceau isolé.");
    expect(music).toContain('disabled={selectedSaleTrackIds.size < 2}');
  });

  it('requires an explicit € or FREE choice for a new collection', () => {
    expect(music).toContain("useState<PlaylistSalePaymentMode | null>(null)");
    expect(music).toContain("if (!sellPaymentMode)");
    expect(music).toContain("Mode de déblocage requis");
    expect(music).toContain("MODE DE DÉBLOCAGE");
  });
});
