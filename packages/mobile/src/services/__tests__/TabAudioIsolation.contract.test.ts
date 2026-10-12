// @ts-nocheck
import fs from 'fs';
import path from 'path';

const capture = fs.readFileSync(path.resolve(__dirname, '..', 'micCapture.ts'), 'utf8');
const home = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');

describe('Browser tab audio remains independent from the microphone (regression)', () => {
  const tab = capture.slice(capture.indexOf('export async function captureTabAudioSample('), capture.indexOf('export function releaseCaptureResources()'));
  const stream = capture.slice(capture.indexOf('async function ensureTabAudioStream()'), capture.indexOf('async function captureStreamToWav('));
  const wav = capture.slice(capture.indexOf('async function captureStreamToWav('), capture.indexOf('async function captureAudioSampleWeb('));

  it('starts a separate WebAudio context and never reuses the microphone cancellation version', () => {
    expect(tab).toContain('const tabAudioCtx = new AudioCtxCtor();');
    expect(tab).toContain('captureStreamToWav(audioOnly, null, onLevel, durationMs, undefined, tabAudioCtx)');
    expect(tab).not.toContain('const versionAtStart = cancellationVersion;');
    expect(wav).toContain('const audioCtx = isolatedAudioCtx ?? getWebAudioCtx();');
    expect(wav).toContain('if (versionAtStart === null)');
    expect(wav).toContain('if (versionAtStart !== null && versionAtStart !== cancellationVersion)');
  });

  it('does not stop the video track before the audio is sampled', () => {
    expect(stream).not.toContain('display.getVideoTracks().forEach((t) => t.stop())');
    expect(tab).toContain('display?.getTracks().forEach((track) => track.stop())');
    expect(tab).toContain('await tabAudioCtx.close().catch(() => {})');
  });

  it('requests browser screen sharing without first starting an idle microphone session', () => {
    const action = home.slice(home.indexOf('const testTabCapture = async () => {'), home.indexOf('// Keep the search modal mounted'));
    expect(action).toContain('const monitor = await startTabAudioMonitor(');
    expect(action).toContain("current.startSession({ captureMode: 'tab' })");
    expect(action.slice(0, action.indexOf('const monitor = await startTabAudioMonitor('))).not.toContain('startSession(');
  });
});
