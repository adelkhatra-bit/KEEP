import fs from 'fs';
import path from 'path';

describe('Collection sale flow — no duplicates, mandatory payment mode', () => {
  const music = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');
  const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');

  it('centralizes creation in Collections/Pépites', () => {
    expect(panel).toContain('◆ Mes collections exclusives');
    expect(panel).toContain('＋ CRÉER UNE COLLECTION');
    expect(panel).toContain("navigation.navigate('Main', { screen: 'MyMusic', params: { createSaleCollection: true } })");
    expect(music).not.toContain('Sélectionner ${track.title} pour une collection exclusive');
  });

  it('publishes only a named multi-track collection', () => {
    expect(music).toContain('placeholder="Nom de la collection"');
    expect(music).toContain('CRÉER LA COLLECTION ({selectedSaleTrackIds.size})');
    expect(music).toContain('selectedSaleTrackIds.size < 2');
  });

  it('forces mode selection, then distinguishes money from FREE', () => {
    expect(music).toContain("setSellPaymentMode(existing ? (existing.paymentMode === 'FREE' ? 'FREE' : 'MONEY') : null)");
    expect(music).toContain('€ EUROS');
    expect(music).toContain('⚡ FREE');
    expect(music).toContain('MODE DE PAIEMENT REQUIS');
    expect(music).toContain('les écoutes et la circulation de ta collection dans la communauté');
  });
});
