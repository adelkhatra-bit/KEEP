import { DemoMusicProvider } from '../providers/DemoMusicProvider';
import { CanonicalTrack } from '../types';

describe('DemoMusicProvider', () => {
  it('réutilise toujours keep-local-history pour la playlist Mes KEEP', async () => {
    const provider = new DemoMusicProvider();
    const session = await provider.connect('test');

    const first = await provider.createPlaylist(session, 'Mes KEEP');
    const second = await provider.createPlaylist(session, '  Mes KEEP  ');

    expect(first.id).toBe('keep-local-history');
    expect(second.id).toBe('keep-local-history');
    expect((await provider.getPlaylists(session)).length).toBe(1);
  });

  it('efface totalement la bibliothèque locale lors d’un changement d’identité', async () => {
    const provider = new DemoMusicProvider();
    const session = await provider.connect('test');
    const playlist = await provider.createPlaylist(session, 'Mes KEEP');
    const track: CanonicalTrack = { id: 'track-1', title: 'Titre test', artist: 'Artiste test', providerIds: {} };

    await provider.addTrackToPlaylist(session, playlist.id, track);
    expect((await provider.getPlaylistTracks(session, playlist.id)).length).toBe(1);

    provider.resetLibrary();

    expect((await provider.getPlaylists(session)).length).toBe(0);
    expect((await provider.getPlaylistTracks(session, playlist.id)).length).toBe(0);
  });
});
