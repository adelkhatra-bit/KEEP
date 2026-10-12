import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'keepMusicCoreRecognition.ts'), 'utf8');
const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');

describe('YouTube manual recognition and tab capture', () => {
  it('forwards the actual platform to the server resolver', () => {
    const classifier = fs.readFileSync(path.resolve(__dirname, '..', 'sharedSourcePlatform.ts'), 'utf8');
    expect(classifier).toContain("host === 'youtu.be'");
    expect(classifier).toContain("host === 'youtube.com'");
    expect(source).toContain('platform: sharedSourcePlatformFromUrl(input.url)');
  });
  it('shows tab audio on PC in active listening and idle home, without exposing it on native mobile', () => {
    expect(screen).toContain('submitCapturedAudioRecognition(recognition)');
    expect(screen).toContain('pauseListening()');
    expect(screen).toContain('resumeListening()');
    expect(screen).toContain('Suivre les morceaux de YouTube (PC)');
    expect(screen).toContain("desktopHome && Platform.OS === 'web'");
    expect(screen).toContain('testID="home-tab-audio-option"');
    expect(screen).toContain('lien d’une vidéo YouTube');
  });
});
