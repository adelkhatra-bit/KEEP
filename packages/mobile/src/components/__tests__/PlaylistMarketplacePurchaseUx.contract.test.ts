import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Marketplace purchase UX contract', () => {
  const preview = read(__dirname, '..', 'PlaylistSaleImmersivePreview.tsx');
  const panel = read(__dirname, '..', 'PlaylistSalePanel.tsx');
  const myMusic = read(__dirname, '..', '..', 'screens', 'MyMusicScreen.tsx');
  const service = read(__dirname, '..', '..', 'services', 'playlistSaleService.ts');
  const notifications = read(__dirname, '..', '..', 'screens', 'NotificationsScreen.tsx');

  it('keeps preview metadata protected while showing owned versus missing counts', () => {
    expect(preview).toContain('loadPlaylistSaleOfferOverlap');
    expect(preview).toContain('alreadyOwned');
    expect(preview).toContain('DÉJÀ');
    expect(preview).toContain('NOUVELLE POUR TOI');
    expect(preview).toContain('onRequestMissingTracks');
    expect(service).toContain('keep_playlist_sale_offer_preview_tracks_v2');
  });

  it('keeps seller profile access and a real 3D mystery transform in the popup', () => {
    expect(preview).toContain('onOpenProfile');
    expect(preview).toContain('perspective: 700');
    expect(preview).toContain('rotateY');
    expect(preview).toContain('rotateX');
  });

  it('surfaces completed purchases in Playlists with direct playback', () => {
    expect(myMusic).toContain('DERNIERS ACHATS');
    expect(myMusic).toContain('loadMyPlaylistPurchaseLibrary');
    expect(myMusic).toContain('loadDeliveredPlaylistSaleTracks');
    expect(myMusic).toContain('<TrackPreviewButton');
  });

  it('lets sellers answer missing-track requests using FREE presets', () => {
    expect(panel).toContain('DEMANDES PERSONNALISÉES');
    expect(panel).toContain('loadMyPlaylistSaleTrackRequests');
    expect(panel).toContain("offerPlaylistSaleRequestSelectionWithFree");
    expect(panel).toContain('SALE_PRESET_FREE.slice(0, 4)');
  });

  it('keeps partial offers private and purchases addressable by delivered playlist', () => {
    expect(service).toContain('loadMyPlaylistPurchaseLibrary');
    expect(service).toContain('deliveredPlaylistId');
    expect(service).toContain('requestMissingPlaylistSaleTracks');
    expect(notifications).toContain("['PLAYLIST_SALE_PARTIAL_OFFER','PLAYLIST_SALE_NEW_OFFER','PLAYLIST_SALE_OFFER_CREATED'].includes(type)");
    expect(notifications).toContain('openSaleOfferId: offerId');
  });
});
