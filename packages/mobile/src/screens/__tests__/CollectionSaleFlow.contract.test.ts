import fs from 'fs';
import path from 'path';

describe('Collection sale flow — no duplicates, mandatory payment mode', () => {
  const music = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');
  const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');

  it('centralizes creation in Collections/Pépites', () => {
    expect(panel).toContain('◆ Pépites');
    expect(panel).toContain('＋ CRÉER UNE COLLECTION');
    expect(panel).toContain('createSaleCollection: true');
    expect(music).not.toContain('Sélectionner ${track.title} pour une collection exclusive');
    expect(music).not.toContain("workspaceTab === 'COLLECTIONS'");
    expect(music).not.toContain("setWorkspaceTab('COLLECTIONS')");
    expect(music).not.toContain('◆ CRÉER AVEC CET ALBUM');
  });

  it('publishes only a named multi-track collection', () => {
    expect(music).toContain('placeholder="Nom de la collection"');
    expect(music).toContain('ÉTAPE 1 SUR 4');
    expect(music).toContain('selectedSaleTrackIds.size < 2');
  });

  it('forces mode selection, then distinguishes money from FREE', () => {
    expect(music).toContain("setSellPaymentMode(existing ? (existing.paymentMode === 'FREE' ? 'FREE' : 'MONEY') : null)");
    expect(music).toContain('PAIEMENT DIRECT');
    expect(music).toContain('⚡ FREE LOKI MUSIC');
    expect(music).toContain('PAIEMENT À CONFIGURER');
    expect(music).toContain('Aucun PayPal ni carte bancaire. Le prix est payé en FREE dans Loki Music.');
  });
});
