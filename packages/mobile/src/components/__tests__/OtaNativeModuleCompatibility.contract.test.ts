import fs from 'fs';
import path from 'path';

describe('OTA native-module compatibility', () => {
  const mascot = fs.readFileSync(path.resolve(__dirname, '..', 'LokiMascotVoice.tsx'), 'utf8');

  it('does not eagerly load expo-speech at application startup', () => {
    expect(mascot).not.toContain("import * as Speech from 'expo-speech'");
    expect(mascot).toContain("await import('expo-speech').catch(() => null)");
  });
});
