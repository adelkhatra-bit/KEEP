// @ts-nocheck
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('[LISTEN-COST-GUARD] estimated track end', () => {
  const core = read('packages','mobile','src','services','keepMusicCoreRecognition.ts');
  const nativeFirst = read('packages','mobile','src','services','nativeFirstRecognitionProvider.ts');
  const types = read('packages','music','src','types.ts');
  const resolver = read('packages','music','src','TrackResolver.ts');
  const acr = read('supabase','functions','keep-music-fallback','index.ts');
  const audd = read('supabase','functions','keep-music-recognition-v2','index.ts');

  it('transports catalogue duration and recognition offset end to end', () => {
    expect(types).toContain('durationSec?: number;');
    expect(types).toContain('recognizedOffsetSec?: number;');
    expect(resolver).toContain('durationSec: result.durationSec');
    expect(acr).toContain('durationSec: enrichment.durationSec');
    expect(acr).toContain('music.play_offset_ms');
    expect(audd).toContain('catalog?.trackTimeMillis');
    expect(audd).toContain('parseTimecodeSeconds(result.timecode)');
  });

  it('keeps paid providers closed until the estimated end while free paths stay active', () => {
    expect(core).toContain('paidProviderSuppressedUntil');
    expect(core).toContain('estimatedPaidProviderSuppressionMs');
    expect(core).toContain('Date.now() >= paidProviderSuppressedUntil');
    expect(core).toContain('MAX_RECOGNIZED_TRACK_REMAINING_MS');
    expect(nativeFirst).toContain('noteSuccessfulRecognitionForPaidSuppression(fast)');
  });

  it('never removes the 20 second hard minimum', () => {
    expect(core).toContain('const PAID_PROVIDER_MIN_GAP_MS = 20 * 1000;');
    expect(core).toContain('PAID_PROVIDER_MIN_GAP_MS,');
  });
});
