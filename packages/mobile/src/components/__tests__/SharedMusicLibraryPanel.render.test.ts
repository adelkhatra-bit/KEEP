import React from 'react';
const { renderToStaticMarkup }: { renderToStaticMarkup: (element: React.ReactElement) => string } = require('react-dom/server');
import fs from 'fs';
import path from 'path';

jest.mock('react-native', () => {
  const React = require('react');
  const component = (tag: string) => ({ children, testID, accessibilityLabel }: any) => React.createElement(tag, { 'data-testid': testID, 'aria-label': accessibilityLabel }, children);
  return { View: component('div'), Text: component('span'), TouchableOpacity: component('button'),
    ScrollView: component('div'), Image: component('img'), ActivityIndicator: component('progress'),
    Linking: { openURL: jest.fn() }, StyleSheet: { create: (styles: any) => styles } };
});
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('../../store/useUserStore', () => ({
  useUserStore: (select: any) => select({ user: { id: 'demo' }, isDemoMode: true, isLocalGuest: false }),
}));
jest.mock('../../services/sharingService', () => ({ readClipboardText: jest.fn() }));
jest.mock('../../services/sharedMusicImportService', () => ({
  useSharedMusicImportStore: (select: any) => select({ revision: 0 }),
  loadMyMusicStats: jest.fn(), loadSharedMusicLibrary: jest.fn(), musicLinkFromText: jest.fn(),
  requireMusicImportAccount: jest.fn(), resolveSharedMusicLink: jest.fn(),
}));
jest.mock('../KeepModal', () => ({ visible, children }: any) => visible ? children : null);
jest.mock('../MusicServiceIcon', () => ({
  __esModule: true, default: () => null,
  MUSIC_SERVICE_BRAND_COLORS: { spotify: '#1DB954', apple_music: '#FA243C', deezer: '#A238FF', youtube_music: '#FF0000', soundcloud: '#FF5500', tidal: '#FFFFFF' },
}));

import SharedMusicLibraryPanel, { MyMusicStatsContent, SharedMusicPlatformLinks } from '../SharedMusicLibraryPanel';

describe('Ma musique — rendu partagé mobile/ordinateur', () => {
  it('rend une seule action presse-papiers sans champ ni clavier, même en démo', () => {
    const markup = renderToStaticMarkup(React.createElement(SharedMusicLibraryPanel));
    expect(markup.match(/＋ Ajouter un lien/g)).toHaveLength(1);
    expect(markup).toContain('Mon style');
    expect(markup).toContain('ⓘ');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('En savoir plus');
  });
  it('rend les statistiques exactes et limite les classements aux cinq premiers', () => {
    const stats = { topGenres: Array.from({ length: 6 }, (_, index) => ({ name: `Genre${index}`, count: 20 - index })),
      topArtists: Array.from({ length: 6 }, (_, index) => ({ name: `Artiste${index}`, count: 15 - index })),
      hearts: 9, dislikes: 2, keeps: 12, importedByPlatform: { spotify: 8, deezer: 3 } };
    const markup = renderToStaticMarkup(React.createElement(MyMusicStatsContent, { stats }));
    for (const text of ['Genre0 · 20', 'Genre4 · 16', 'Artiste0 · 15', 'Artiste4 · 11', 'Coups de cœur · 9', 'Pas aimé · 2', 'GARDER · 12', 'Spotify · 8', 'Deezer · 3']) expect(markup).toContain(text);
    expect(markup).not.toContain('Genre5');
    expect(markup).not.toContain('Artiste5');
  });
  it('rend tous les liens disponibles, pas seulement la plateforme d’origine', () => {
    const markup = renderToStaticMarkup(React.createElement(SharedMusicPlatformLinks, { links: {
      spotify: 'https://open.spotify.com/track/a', appleMusic: 'https://music.apple.com/song/a',
      amazonMusic: 'https://music.amazon.com/albums/a', unsafe: 'javascript:alert(1)',
    } }));
    expect(markup).toContain('Ouvrir dans Spotify');
    expect(markup).toContain('Ouvrir dans Apple Music');
    expect(markup).toContain('Ouvrir dans Amazon Music');
    expect(markup).not.toContain('unsafe');
  });
  it('expose erreur/retry et IDs navigateur sans déplacer la navigation validée', () => {
    const panel = fs.readFileSync(path.resolve(__dirname, '..', 'SharedMusicLibraryPanel.tsx'), 'utf8');
    const handoff = fs.readFileSync(path.resolve(__dirname, '..', 'SharedMusicHandoff.tsx'), 'utf8');
    expect(panel).toContain('testID="shared-music-retry"');
    expect(panel).toContain('testID="my-music-stats-retry"');
    expect(panel).toContain('testID="shared-music-confirm"');
    expect(panel).toContain('minHeight: 48');
    expect(panel).not.toContain('TextInput');
    expect(panel).not.toContain('navigation.navigate');
    expect(handoff).toContain('testID="shared-music-handoff-retry"');
    expect(handoff).toContain('testID="shared-music-import-toast"');
    expect(handoff).not.toContain('ingestExternalRecognition');
  });
});
