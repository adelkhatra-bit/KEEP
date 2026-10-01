import fs from 'fs';
import path from 'path';
import { resolveTrackExternalDestination } from '../../services/trackExternalLinkService';

describe('Audio playback truthfulness contract', () => {
  const swipe = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');
  const previewButton = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'TrackPreviewButton.tsx'), 'utf8');
  const listen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'TrackListenControls.tsx'), 'utf8');

  it('never calls a YouTube search "écouter en entier"', () => {
    const destination = resolveTrackExternalDestination({
      id: 'x', title: 'Titre', artist: 'Artiste', providerIds: {},
      externalUrls: { youtubeSearch: 'https://www.youtube.com/results?search_query=Artiste+Titre' },
    } as any);
    expect(destination?.exact).toBe(false);
    expect(destination?.label).toBe('CHERCHER CE TITRE SUR YOUTUBE');
    expect(swipe).not.toContain('ÉCOUTER EN ENTIER');
  });

  it('accepts only the matching Spotify track as exact', () => {
    expect(resolveTrackExternalDestination({
      id: 'x', title: 'Titre', artist: 'Artiste', providerIds: { spotify: 'abc123' },
      externalUrls: { spotify: 'https://open.spotify.com/track/abc123' },
    } as any)?.exact).toBe(true);
    expect(resolveTrackExternalDestination({
      id: 'x', title: 'Titre', artist: 'Artiste', providerIds: { spotify: 'wanted' },
      externalUrls: { spotify: 'https://open.spotify.com/track/wrong' },
    } as any)).toBeNull();
  });

  it('unlocks web audio synchronously from direct preview taps', () => {
    expect(swipe).toContain('unlockWebAudioForGesture(); setPreviewEnded(false)');
    expect(previewButton).toContain('unlockWebAudioForGesture();');
    expect(listen).toContain('unlockWebAudioForGesture();');
  });

  it('does not await canOpenURL before browser external open', () => {
    expect(previewButton).not.toContain('await Linking.canOpenURL');
    expect(swipe).toContain('void Linking.openURL(fullTrackDestination.url)');
  });
});
