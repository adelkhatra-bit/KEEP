import fs from 'fs';
import path from 'path';

describe('live music identification source integrity', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../nativeFirstRecognitionProvider.ts'), 'utf8');

  it('never races an old YouTube/social link against the live microphone sample', () => {
    expect(source).toContain('recognizeWithNativeShazam(audioSample)');
    expect(source).toContain('recognizeWithKeepMemoryFast(audioSample)');
    expect(source).not.toContain('recognizeSharedSourceKeyless()');
    expect(source).toContain('this.fallback.recognizeAfterMemory(audioSample)');
  });
});
