// @ts-nocheck
import fs from 'fs';
import path from 'path';

const capture = fs.readFileSync(path.resolve(__dirname, '..', 'micCapture.ts'), 'utf8');
const controls = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'TrackListenControls.tsx'), 'utf8');
const row = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'TrackRow.tsx'), 'utf8');
const history = fs.readFileSync(path.resolve(__dirname, '..', '..', 'store', 'useSessionHistoryStore.ts'), 'utf8');
const home = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');
const continuous = fs.readFileSync(path.resolve(__dirname, '..', 'continuousTabMusicSession.ts'), 'utf8');

describe('PC tab music session continues across multiple songs', () => {
  it('keeps a single shared stream across successive audio samples', () => {
    const monitor = capture.slice(capture.indexOf('export async function startTabAudioMonitor('), capture.indexOf('export function releaseCaptureResources()'));
    expect(monitor).toContain('while (!abort.signal.aborted');
    expect(monitor).toContain('await onSample(sample)');
    expect(monitor).toContain("transient sample/recognition failure; resuming next sample");
    expect(monitor).toContain('continue;');
  });
  it('keeps one tab capture linked to a real session until STOP', () => {
    expect(continuous).toContain('startTabAudioMonitor(async (sample) => {');
    expect(continuous).toContain('submitCapturedAudioRecognition(recognition)');
    expect(continuous).toContain("current.startSession({ captureMode: 'tab' })");
    expect(continuous).toContain('activeMonitor?.stop()');
    expect(continuous).toContain('session.requestEndSession()');
    expect(home).toContain('startContinuousTabMusic()');
  });
  it('does not prompt to restart a deliberately paused microphone during tab preview', () => {
    expect(controls).toContain('pausedMicForPreview.current');
    expect(controls).toContain('if (isPlaying || !pausedMicForPreview.current) return;');
    expect(controls).toContain('if (track.previewUrl || sourceOnlyVideo) return;');
  });
  it('keeps free-gated save, session swipe, and explicit story publication', () => {
    expect(row).toContain("savedEntry.status !== 'kept'");
    expect(row).toContain('pinStoryTrack(track.id');
    expect(history).toContain('addSharedLinkTrack:');
  });
});
