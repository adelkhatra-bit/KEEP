import fs from 'fs';
import path from 'path';
import { mascotLine } from '../battleHomeInfo';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8');

describe('Battle voice — result library and ducking', () => {
  it('rotates result phrases so consecutive Solo sessions do not repeat the same line', () => {
    const lines = Array.from({ length: 6 }, (_, index) => mascotLine(2, 5, false, `session-${index}`).text);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('keeps separate result libraries for strong, average and difficult games', () => {
    expect(mascotLine(5, 5, false, 'perfect').mood).toBe('party');
    expect(mascotLine(4, 5, false, 'strong').mood).toBe('happy');
    expect(mascotLine(2, 5, false, 'middle').mood).toBe('cheer');
    expect(mascotLine(0, 5, false, 'hard').mood).toBe('oops');
    expect(mascotLine(0, 5, true, 'idle').mood).toBe('sleepy');
  });

  it('ducks active music while Loki speaks and restores it after native speech completion', () => {
    const speech = read('..', 'lokiSpeechService.ts');
    expect(speech).toContain('duckActivePreviewForSpeech(0.16)');
    expect(speech).toContain('onDone: finish');
    expect(speech).toContain('onStopped: finish');
    expect(speech).toContain('onError: finish');
    expect(speech).toContain('restoreActivePreviewAfterSpeech');
    expect(speech).toContain('useApplicationAudioSession: true');
  });
});
