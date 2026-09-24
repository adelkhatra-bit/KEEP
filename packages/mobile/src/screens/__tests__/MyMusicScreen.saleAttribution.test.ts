// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('MyMusicScreen marketplace selection — BUG fix (Adel, 21/09/2026, profil adel4a : morceau déjà en vente absent de la sélection)', () => {
  const source = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const service = readNormalized(__dirname, '..', '..', 'services', 'playlistSaleService.ts');

  it('loads the real per-track offer membership instead of relying on the ephemeral client-side key', () => {
    expect(service).toContain('export async function loadMyOfferedTrackIds(): Promise<Record<string, PlaylistOfferedTrack>>');
    expect(service).toContain("supabase.rpc('keep_playlist_sale_my_offered_track_ids')");
    expect(source).toContain('const [myOfferedTrackIds, setMyOfferedTrackIds] = useState<Record<string, PlaylistOfferedTrack>>({});');
    expect(source).toContain('loadMyOfferedTrackIds()');
  });

  it('never lets an already-offered track be silently re-bundled into a new selection', () => {
    expect(source).toContain('if (myOfferedTrackIds[trackId]) return;');
    expect(source).toContain('selectionCheckDisabled');
  });

  it('shows a clear collection-membership state on the track row instead of hiding the offer', () => {
    expect(source).toContain("`◆ Dans collection · ${offered.playlistName}`");
    expect(source).toContain('sellTrackButtonOffered');
  });

  it('offers a way to edit or remove the existing offer instead of leaving it unreachable', () => {
    expect(source).toContain('const editExistingTrackOffer = (track: CanonicalTrack) => {');
    expect(source).toContain("'Retirer de la collection'");
    expect(source).toContain("'Changer le prix'");
  });

  it('offers an explicit private choice on removal, reusing the existing visibility service (no new system)', () => {
    expect(source).toContain("'Retirer et garder privé'");
    expect(source).toContain("await persistOwnTrackVisibility(track, 'PRIVATE');");
  });
});
