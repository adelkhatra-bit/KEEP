import fs from 'fs';
import path from 'path';

describe('live music identification source integrity', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../nativeFirstRecognitionProvider.ts'), 'utf8');
  it('never races an old YouTube/social share against live microphone audio', () => {
    expect(source).toContain('recognizeWithNativeShazam(audioSample)');
    expect(source).toContain('recognizeWithKeepMemoryFast(audioSample)');
    expect(source).not.toContain('recognizeSharedSourceKeyless()');
    expect(source).toContain('this.fallback.recognizeAfterMemory(audioSample)');
  });
});
