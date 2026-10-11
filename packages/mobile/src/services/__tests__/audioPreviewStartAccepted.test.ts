import { isPreviewStartAccepted } from '../audioPreviewStart';

// Cause racine AUDIO_PREVIEW_NOT_PLAYING (06/10/2026) : un extrait qui tamponne avec la lecture demandée n'est pas un échec.
describe('isPreviewStartAccepted', () => {
  it('accepte un son qui joue', () => {
    expect(isPreviewStartAccepted({ isLoaded: true, isPlaying: true } as any)).toBe(true);
  });
  it('accepte un son iOS qui tamponne avec la lecture demandée', () => {
    expect(isPreviewStartAccepted({ isLoaded: true, isPlaying: false, isBuffering: true, shouldPlay: true } as any)).toBe(true);
  });
  it('refuse un son à l’arrêt sans lecture demandée', () => {
    expect(isPreviewStartAccepted({ isLoaded: true, isPlaying: false, isBuffering: false, shouldPlay: false } as any)).toBe(false);
  });
  it('refuse un son non chargé', () => {
    expect(isPreviewStartAccepted({ isLoaded: false } as any)).toBe(false);
  });
});
