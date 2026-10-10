import fs from 'fs';
import path from 'path';

describe('OTA native-module compatibility', () => {
  const mascot = fs.readFileSync(path.resolve(__dirname, '..', 'LokiMascotVoice.tsx'), 'utf8');
  const dock = fs.readFileSync(path.resolve(__dirname, '..', 'GlobalChatDock.tsx'), 'utf8');

  it('does not eagerly load expo-speech at application startup', () => {
    expect(mascot).not.toContain("import * as Speech from 'expo-speech'");
    expect(mascot).toContain("import { speakLokiText, stopLokiSpeech } from '../services/lokiSpeechService';");
    expect(dock).not.toContain("import * as Speech from 'expo-speech'");
    expect(dock).toContain("import { speakLokiText } from '../services/lokiSpeechService';");
    // e8d46e91 : expo-speech n'est plus une dépendance du binaire TestFlight 62 ; aucun import, même paresseux.
    expect(mascot).not.toContain('expo-speech');
    expect(dock).not.toContain("import('expo-speech')");
  });
});
