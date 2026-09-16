// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KeepMusicCoreRecognition sticky cache contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'keepMusicCoreRecognition.ts'), 'utf8');

  it('rearms the sticky match window after a primary AudD match', () => {
    expect(source).toMatch(/if \(primary\.ok && primary\.payload\?\.recognition\) \{\s*recognitionBackoffUntil = 0;\s*fallbackUnavailableUntil = 0;\s*armStickyMatch\(\);/s);
  });

  it('rearms the sticky match window after fallback or keyless matches too', () => {
    expect(source).toMatch(/if \(fallback\.ok && fallback\.payload\?\.recognition\) \{\s*fallbackUnavailableUntil = 0;\s*recognitionBackoffUntil = 0;\s*armStickyMatch\(\);/s);
    expect(source).toMatch(/if \(keyless\) \{\s*recognitionBackoffUntil = 0;\s*armStickyMatch\(\);/s);
  });
});
