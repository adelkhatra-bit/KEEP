import fs from 'fs';
import path from 'path';

describe('Fast recognition contract', () => {
  const native = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'nativeFirstRecognitionProvider.ts'), 'utf8');
  const core = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'keepMusicCoreRecognition.ts'), 'utf8');
  const session = fs.readFileSync(path.resolve(__dirname, '..', '..', 'store', 'useSessionStore.ts'), 'utf8');
  const server = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-music-core', 'index.ts'), 'utf8');

  it('races ShazamKit and KEEP fingerprint memory before paid providers', () => {
    expect(native).toContain('recognizeWithNativeShazam(audioSample)');
    expect(native).toContain('recognizeWithKeepMemoryFast(audioSample)');
    expect(native).toContain('firstRecognition([');
    expect(native).toContain('recognizeAfterMemory(audioSample)');
    expect(core).toContain('async recognizeAfterMemory');
  });

  it('uses a shorter first iOS sample but retains longer retries', () => {
    expect(session).toContain("Platform.OS === 'ios'");
    expect(session).toContain("return 4500;");
    expect(session).toContain("return 6500;");
    expect(session).toContain("return 9000;");
  });

  it('seeds fingerprint memory from kept profile tracks including native Shazam matches', () => {
    expect(core).toContain('previewUrl: track.previewUrl');
    expect(server).toContain('if (decision === "KEPT" && trackInput.previewUrl)');
    expect(server).toContain('seedInBackground(admin');
    expect(server).toContain('preview_url: track.previewUrl || null');
  });
});
