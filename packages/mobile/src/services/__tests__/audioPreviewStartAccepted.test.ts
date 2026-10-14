import { isPreviewStartAccepted, isPreviewStillStalled } from '../audioPreviewStart';

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

describe('iOS Swipe recovery: no endless buffering', () => {
  it('advances a clip whose playback request never produces audible progress', () => {
    expect(isPreviewStillStalled({ isLoaded: true, isPlaying: false, isBuffering: true, shouldPlay: true, positionMillis: 0 })).toBe(true);
    expect(isPreviewStillStalled({ isLoaded: true, isPlaying: true, isBuffering: false, shouldPlay: true, positionMillis: 0 })).toBe(true);
    expect(isPreviewStillStalled({ isLoaded: false, shouldPlay: true })).toBe(true);
  });

  it('keeps a genuinely playing excerpt and never mistakes an intentional pause for a stall', () => {
    expect(isPreviewStillStalled({ isLoaded: true, isPlaying: true, shouldPlay: true, positionMillis: 2800 })).toBe(false);
    expect(isPreviewStillStalled({ isLoaded: true, isPlaying: false, shouldPlay: false, positionMillis: 0 })).toBe(false);
  });
});
