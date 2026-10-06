// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('audioPreviewService -- masked collection preview', () => {
  const preview = readNormalized(__dirname, '..', 'audioPreviewService.ts');
  const modal = readNormalized(__dirname, '..', '..', 'components', 'PlaylistSaleImmersivePreview.tsx');

  it('keeps one dedicated preview path for masked collections', () => {
    expect(preview).toContain('export async function playAntiShazamPreviewSegment(');
    expect(preview).toContain('export async function stopAntiShazamPreview(');
    expect(modal).toContain('playAntiShazamPreviewSegment');
    expect(modal).toContain('stopAntiShazamPreview');
  });

  it('uses one clean reliable 15 second excerpt instead of pitch/voice degradation', () => {
    expect(preview).toContain('const SECRET_PREVIEW_DURATION_MS = 15000;');
    expect(preview).toContain('const durationMs = SECRET_PREVIEW_DURATION_MS;');
    expect(preview).toContain('await playWebSegment(key, previewUrl, 0, durationMs, onStateChange, onEnded, false);');
    expect(preview).not.toContain('ANTI_SHAZAM_VOICE_LINES');
    expect(preview).not.toContain('setRateAsync(rateShift');
  });

  it('protects identity in the UI rather than breaking the listening experience', () => {
    expect(modal).toContain('PÉPITES À DÉCOUVRIR');
    expect(modal).toContain('Extrait masqué');
    expect(modal).toContain('mysteryLock');
    expect(modal).toContain('DÉBLOQUER LA COLLECTION');
  });

  it('stopping the masked preview cleans the shared audio preview without a new native speech module', () => {
    const start = preview.indexOf('export async function stopAntiShazamPreview(');
    const body = preview.slice(start, preview.indexOf('\n}\n', start));
    expect(preview).not.toContain("from 'expo-speech'");
    expect(preview).not.toContain('Speech.stop();');
    expect(body).toContain('stopTrackPreview');
  });

  it('does not route Battle through the masked collection preview', () => {
    const battle = readNormalized(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx');
    expect(battle).toContain('playTrackPreviewSegment');
    expect(battle).toContain('preloadTrackPreviewSegment');
    expect(battle).not.toContain('playAntiShazamPreviewSegment');
  });
});
