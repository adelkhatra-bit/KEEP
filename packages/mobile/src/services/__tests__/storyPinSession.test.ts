jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../supabaseClient', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../playlistSaleService', () => ({ loadMyOfferedTrackIds: jest.fn(), loadPlaylistSaleProfilePreviewSampler: jest.fn() }));

import { supabase } from '../supabaseClient';
import { pinStoryTrack, subscribeOwnStoryChanged } from '../musicStoriesService';

describe('épingle de session/reconnaissance', () => {
  const uuid = '11111111-2222-3333-4444-555555555555';
  const track = { title: 'Titre', artist: 'Artiste', previewUrl: 'https://example.test/preview.m4a', isrc: 'FR1234567890' };
  const rpc = supabase!.rpc as jest.Mock;
  beforeEach(() => { rpc.mockReset(); });
  it('n’envoie jamais trk_* à un paramètre UUID et conserve les métadonnées', async () => {
    rpc.mockResolvedValue({ data: { trackId: uuid, alreadyPinned: false }, error: null });
    await pinStoryTrack('trk_session_1', track);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('keep_pin_free_story_track', expect.objectContaining({
      p_track_id: null, p_title: track.title, p_artist: track.artist, p_isrc: track.isrc, p_preview_url: track.previewUrl,
    }));
  });
  it('utilise le chemin gratuit pour une musique UUID sans GARDER public', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'STORY_PIN_REQUIRES_PUBLIC_KEEP' } })
      .mockResolvedValueOnce({ data: { trackId: uuid }, error: null });
    await pinStoryTrack(uuid, track);
    expect(rpc).toHaveBeenNthCalledWith(2, 'keep_pin_free_story_track', expect.objectContaining({ p_track_id: uuid }));
  });
  it('conserve la voie certifiée d’un GARDER public', async () => {
    rpc.mockResolvedValue({ error: null });
    await pinStoryTrack(uuid, track);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('keep_pin_story_track', { p_track_id: uuid });
  });
  it('ne contourne jamais une protection de vente ni une erreur d’authentification', async () => {
    for (const message of ['SALE_PROTECTED', 'AUTH_REQUIRED']) {
      rpc.mockReset().mockResolvedValue({ error: { message } });
      await expect(pinStoryTrack(uuid, track)).rejects.toEqual({ message });
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });
  it('propage aussi la protection serveur du chemin gratuit', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'STORY_PIN_REQUIRES_PUBLIC_KEEP' } })
      .mockResolvedValueOnce({ error: { message: 'SALE_PROTECTED' } });
    await expect(pinStoryTrack(uuid, track)).rejects.toEqual({ message: 'SALE_PROTECTED' });
  });
  it('une épingle déjà présente ne relance pas la story ni son expiration', async () => {
    rpc.mockResolvedValue({ data: { trackId: uuid, alreadyPinned: true }, error: null });
    const changed = jest.fn();
    const unsubscribe = subscribeOwnStoryChanged(changed);
    try {
      await pinStoryTrack('trk_session_1', track);
      expect(changed).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });
});
