// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Playlist sale management contract — owner can edit offer content without rebuilding it', () => {
  const panel = read(__dirname, '..', 'PlaylistSalePanel.tsx');
  const myMusic = read(__dirname, '..', '..', 'screens', 'MyMusicScreen.tsx');
  const service = read(__dirname, '..', '..', 'services', 'playlistSaleService.ts');

  it('surfaces content, euro/FREE access and remove actions separately in collection management', () => {
    expect(panel).toContain('♫ Morceaux');
    expect(panel).toContain('€ / FREE');
    expect(panel).toContain('✕ Retirer');
    expect(panel).toContain('manageSaleOfferId: item.offerId || item.playlistId');
    expect(panel).toContain('manageSaleOfferName: item.playlistName');
  });

  it('opens MyMusic in targeted offer edit mode instead of creating a second offer', () => {
    expect(myMusic).toContain("const [saleEditOfferTarget, setSaleEditOfferTarget]");
    expect(myMusic).toContain("route?.params?.manageSaleOfferId");
    expect(myMusic).toContain("setSaleEditOfferTarget({ offerId, playlistName })");
    expect(myMusic).toContain("setSaleSelectionMode(true)");
  });

  it('adds tracks to the exact existing offer and refreshes server-backed sale state', () => {
    expect(myMusic).toContain('await addTracksToOffer(offerId, trackIds)');
    expect(myMusic).toContain('await refreshSaleState()');
    expect(myMusic).toContain('void addSelectedTracksToOffer(saleEditOfferTarget.offerId)');
    expect(service).toContain("rpc('keep_playlist_sale_add_tracks'");
  });

  it('removes a single sold track without clearing the entire offer', () => {
    expect(myMusic).toContain('await removeTrackFromOffer(offered.offerId, track.id)');
    expect(service).toContain("rpc('keep_playlist_sale_remove_track'");
    expect(service).toContain('offerClosed');
  });

  it('routes quick per-track management to the full collection editor without rebuilding its composition', () => {
    expect(myMusic).toContain("text: 'Gérer la collection'");
    expect(myMusic).toContain("manageSaleOfferId: offered.offerId");
    expect(myMusic).toContain("manageSaleOfferName: offered.playlistName");
    expect(service).toContain("rpc('keep_playlist_sale_update_payment_mode'");
  });

  it('keeps pre-purchase identity masking in the sale service', () => {
    expect(service).toContain('export type PlaylistSalePreviewTrack');
    expect(service).toContain('trackId: string;');
    expect(service).toContain('previewUrl: string;');
    expect(service).not.toMatch(/export type PlaylistSalePreviewTrack\s*=\s*\{[^}]*title:/s);
    expect(service).not.toMatch(/export type PlaylistSalePreviewTrack\s*=\s*\{[^}]*artist:/s);
    expect(service).not.toMatch(/export type PlaylistSalePreviewTrack\s*=\s*\{[^}]*artwork/s);
  });
  it('preselects a profile style when the owner starts a sale from that folder', () => {
    expect(myMusic).toContain("route?.params?.preselectSaleGenre");
    expect(myMusic).toContain("setSelectedSaleTrackIds(new Set(trackIds))");
    expect(myMusic).toContain("setSaleSelectionMode(true)");
    expect(myMusic).toContain("preselectSaleGenre: undefined");
  });

});
