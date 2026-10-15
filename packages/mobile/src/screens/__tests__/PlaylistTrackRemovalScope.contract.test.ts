import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('MyMusicScreen — suppression limitée à la playlist choisie', () => {
  const screen = read(__dirname, '..', 'MyMusicScreen.tsx');

  it('retire un titre de la playlist courante au lieu de supprimer la décision KEEP globale', () => {
    expect(screen).toContain('const removeTrackFromPlaylistNow = async');
    expect(screen).toContain('await provider.removeTrackFromPlaylist(session, playlist.id, track.id)');
    expect(screen).toContain('setTracksByPlaylist((state) => ({');
    expect(screen).toContain('[playlist.id]: (state[playlist.id] ?? []).filter((item) => trackIdentity(item) !== key)');
    expect(screen).toContain('if (playlistContext) {');
    expect(screen).toContain('void removeTrackFromPlaylistNow(track, playlistContext)');
  });

  it('ne supprime jamais silencieusement un titre d’Apple Music ou d’un fournisseur non pris en charge', () => {
    expect(screen).toContain("if (provider.providerId !== 'demo')");
    expect(screen).toContain('Apple Music ne permet pas à Loki de retirer un titre d’une playlist via son API');
    expect(screen).toContain('Rien n’a été supprimé.');
    expect(screen).toContain("playlistContext ? (musicEngine.musicProvider.providerId === 'demo' ? 'RETIRER' : 'INDISPONIBLE') : 'SUPPRIMER'");
  });

  it('ne passe le contexte de playlist qu’aux playlists fournisseur, pas à Mes KEEP ou aux groupes automatiques', () => {
    expect(screen).toContain('tracks.map((track) => renderTrack(track, (!isAllKeepView && !isGroupView && !isSmart) ? item : undefined))');
    expect(screen).toContain('void removeTrackNow(track)');
    expect(screen).toContain('sera retiré de Loki Music et ne sera plus visible sur ton profil');
  });
});
