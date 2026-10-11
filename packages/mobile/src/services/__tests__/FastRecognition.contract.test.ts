import fs from 'fs';
import path from 'path';

describe('Fast recognition contract', () => {
  const native = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'nativeFirstRecognitionProvider.ts'), 'utf8');
  const core = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'keepMusicCoreRecognition.ts'), 'utf8');
  const session = fs.readFileSync(path.resolve(__dirname, '..', '..', 'store', 'useSessionStore.ts'), 'utf8');
  const server = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-music-core', 'index.ts'), 'utf8');
  const fallback = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-music-fallback', 'index.ts'), 'utf8');
  const seed = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', '_shared', 'fingerprintSeed.ts'), 'utf8');
  const shazam = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'nativeShazamRecognition.ts'), 'utf8');

  it('races ShazamKit and KEEP fingerprint memory before paid providers', () => {
    expect(native).toContain('recognizeWithNativeShazam(audioSample)');
    expect(native).toContain('recognizeWithKeepMemoryFast(audioSample)');
    expect(native).toContain('firstRecognition([');
    expect(native).toContain('recognizeAfterMemory(audioSample)');
    expect(core).toContain('async recognizeAfterMemory');
  });

  it('routes paid server recognition through configured ACRCloud while AudD is disabled', () => {
    expect(core).toContain('const AUDD_PRIMARY_ENABLED = false;');
    expect(core).toContain("const acr = await recognitionAttempt('keep-music-fallback'");
    expect(core).toContain('if (AUDD_PRIMARY_ENABLED) {');
  });

  it('does not discard paid ACRCloud matches behind the old score 55 threshold', () => {
    expect(fallback).toContain('const MIN_ACR_SCORE = 40;');
    expect(fallback).toContain('const MIN_CATALOG_CORROBORATED_SCORE = 22;');
    expect(fallback).not.toContain('const MIN_ACR_SCORE = 55;');
  });

  it('never sends M4A/AAC preview bytes to mpg123', () => {
    expect(seed).toContain('function isMp3Payload');
    expect(seed).toContain('function isMp4AacPayload');
    expect(seed).toContain('if (!isMp3Payload(audioBytes, contentType))');
    expect(seed).toContain('decoder.decode(audioBytes)');
  });

  it('persists one-per-launch ShazamKit diagnostics for real TestFlight evidence', () => {
    expect(shazam).toContain("area: 'shazamkit_recognition'");
    expect(shazam).toContain("'SHAZAM_MATCH_OK'");
    expect(shazam).toContain("'SHAZAM_NATIVE_ERROR'");
    expect(shazam).toContain("console.warn('[ShazamKit] échec natif'");
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
