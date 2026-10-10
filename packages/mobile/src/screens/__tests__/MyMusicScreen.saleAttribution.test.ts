// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('MyMusicScreen collection membership — single collection flow', () => {
  const source = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const service = readNormalized(__dirname, '..', '..', 'services', 'playlistSaleService.ts');

  it('loads the real per-track offer membership instead of relying on the ephemeral client-side key', () => {
    expect(service).toContain('export async function loadMyOfferedTrackIds(): Promise<Record<string, PlaylistOfferedTrack>>');
    expect(service).toContain("supabase.rpc('keep_playlist_sale_my_offered_track_ids')");
    expect(source).toContain('const [myOfferedTrackIds, setMyOfferedTrackIds] = useState<Record<string, PlaylistOfferedTrack>>({});');
    expect(source).toContain('loadMyOfferedTrackIds()');
  });

  it('warns before reusing an already-offered track but lets the user add it to the Pépites cart', () => {
    expect(source).toContain('const alreadySoldElsewhere = Boolean(offered && !includedInEditedOffer);');
    expect(source).toContain("Alert.alert(\n        'Déjà dans une collection active'");
    expect(source).toContain("{ text: 'Ajouter quand même', onPress: () => { void applySaleTrackToggle(trackId); } }");
    expect(source).toContain("selectedSaleTrackIds.has(track.id) ? '✓ RETIRER' : '+ PANIER'");
    expect(source).not.toContain('const lockedByAnotherOffer = Boolean(');
  });

  it('shows a clear collection-membership state on the track row instead of hiding the offer', () => {
    expect(source).toContain("badge={offered ? { label: saleSelectionMode ? '◆ DÉJÀ PUBLIÉE' : `◆ Collection · ${offered.playlistName}`");
    expect(source).not.toContain('styles.sellTrackButtonOffered');
  });

  it('offers a way to edit or remove the existing offer instead of leaving it unreachable', () => {
    expect(source).toContain('const editExistingTrackOffer = (track: CanonicalTrack) => {');
    expect(source).toContain("'Retirer de la collection'");
    expect(source).toContain("'Gérer la collection'");
    expect(source).toContain('manageSaleOfferId: offered.offerId');
    expect(source).toContain('manageSaleOfferName: offered.playlistName');
  });

  it('offers an explicit private choice on removal, reusing the existing visibility service (no new system)', () => {
    expect(source).toContain("'Retirer et garder privé'");
    expect(source).toContain("await persistOwnTrackVisibility(track, 'PRIVATE');");
  });
});
