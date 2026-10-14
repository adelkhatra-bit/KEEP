import { isWebAudioGestureRequired } from '../webAudioError';

describe('distinguish media failure from browser autoplay permission', () => {
  test('browser policy denial waits for a real playback gesture', () => {
    expect(isWebAudioGestureRequired({ name: 'NotAllowedError', message: 'play() failed' })).toBe(true);
    expect(isWebAudioGestureRequired(new Error('Autoplay blocked by browser policy'))).toBe(true);
    expect(isWebAudioGestureRequired(new Error('User activation required'))).toBe(true);
    expect(isWebAudioGestureRequired(new Error("play() failed because the user didn't interact with the document first"))).toBe(true);
  });

  test('unavailable music file does not falsely ask the listener to repeat Play', () => {
    expect(isWebAudioGestureRequired({ name: 'NotSupportedError', message: 'No supported source' })).toBe(false);
    expect(isWebAudioGestureRequired({ name: 'NetworkError', message: 'Failed to load resource 404' })).toBe(false);
    expect(isWebAudioGestureRequired(new Error('Media decoding error'))).toBe(false);
  });
});
