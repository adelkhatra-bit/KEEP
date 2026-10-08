import { isPreviewStartAccepted } from '../audioPreviewStart';

describe('isPreviewStartAccepted', () => {
  it('accepte un son qui joue', () => {
    expect(isPreviewStartAccepted({ isLoaded: true, isPlaying: true } as any)).toBe(true);
  });
  it('attend le vrai démarrage même quand iOS tamponne avec la lecture demandée', () => {
    expect(isPreviewStartAccepted({ isLoaded: true, isPlaying: false, isBuffering: true, shouldPlay: true } as any)).toBe(false);
  });
  it('refuse un son à l’arrêt sans lecture demandée', () => {
    expect(isPreviewStartAccepted({ isLoaded: true, isPlaying: false, isBuffering: false, shouldPlay: false } as any)).toBe(false);
  });
  it('refuse un son non chargé', () => {
    expect(isPreviewStartAccepted({ isLoaded: false } as any)).toBe(false);
  });
});
