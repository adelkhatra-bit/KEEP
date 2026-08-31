from pathlib import Path

p = Path('packages/mobile/src/services/micCapture.ts')
s = p.read_text()

s = s.replace(
"let webStream: MediaStream | null = null;\nlet webAudioCtx: AudioContext | null = null;",
"let webStream: MediaStream | null = null;\nlet webAudioCtx: AudioContext | null = null;\nlet webRecorder: MediaRecorder | null = null;"
)

s = s.replace(
"audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },",
"audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },"
)

old = "async function captureAudioSampleWeb(onLevel?: (level: number) => void, durationMs = DEFAULT_SAMPLE_DURATION_MS): Promise<Blob> {"
if old not in s:
    raise SystemExit('web capture anchor missing')
s = s.replace(old, "async function captureAudioSampleWebLegacy(onLevel?: (level: number) => void, durationMs = DEFAULT_SAMPLE_DURATION_MS): Promise<Blob> {", 1)

insert_anchor = "\nexport function releaseCaptureResources(): void {"
if insert_anchor not in s:
    raise SystemExit('release anchor missing')

insert = r'''

function preferredRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

async function captureAudioSampleWeb(onLevel?: (level: number) => void, durationMs = DEFAULT_SAMPLE_DURATION_MS): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') return captureAudioSampleWebLegacy(onLevel, durationMs);

  const versionAtStart = cancellationVersion;
  const stream = await ensureWebStream();
  if (versionAtStart !== cancellationVersion) {
    releaseCaptureResources();
    throw new MicCaptureCancelledError();
  }

  const chunks: BlobPart[] = [];
  const mimeType = preferredRecorderMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    return captureAudioSampleWebLegacy(onLevel, durationMs);
  }
  webRecorder = recorder;

  let levelTimer: ReturnType<typeof setInterval> | null = null;
  let levelCtx: AudioContext | null = null;
  let levelSource: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  try {
    if (onLevel) {
      levelCtx = getWebAudioCtx();
      if (levelCtx.state === 'suspended') await levelCtx.resume().catch(() => {});
      if (levelCtx.state === 'running') {
        levelSource = levelCtx.createMediaStreamSource(stream);
        analyser = levelCtx.createAnalyser();
        analyser.fftSize = 1024;
        levelSource.connect(analyser);
        const values = new Float32Array(analyser.fftSize);
        levelTimer = setInterval(() => {
          if (!analyser) return;
          analyser.getFloatTimeDomainData(values);
          let squareSum = 0;
          for (let i = 0; i < values.length; i += 1) squareSum += values[i] * values[i];
          const rms = Math.sqrt(squareSum / Math.max(1, values.length));
          if (rms <= WEB_VISUAL_RMS_FLOOR) onLevel(0);
          else onLevel(Math.min(1, Math.pow(Math.min(1, (rms - WEB_VISUAL_RMS_FLOOR) * 16), 0.42) * 1.18));
        }, 70);
      }
    }
  } catch {
    // Le niveau visuel est best-effort : MediaRecorder doit continuer même si
    // Safari refuse/suspend WebAudio pour l'analyse visuelle.
  }

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error('Capture micro Safari interrompue.'));
    recorder.onstop = () => resolve();
  });

  try {
    recorder.start(250);
    await waitForSampleOrCancel(safeSampleDuration(durationMs), versionAtStart);
    if (versionAtStart !== cancellationVersion) {
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped.catch(() => {});
      throw new MicCaptureCancelledError();
    }
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
  } finally {
    if (levelTimer) clearInterval(levelTimer);
    try { levelSource?.disconnect(); } catch {}
    try { analyser?.disconnect(); } catch {}
    if (webRecorder === recorder) webRecorder = null;
  }

  const type = recorder.mimeType || mimeType || 'audio/mp4';
  const blob = new Blob(chunks, { type });
  if (blob.size < 1200) throw new Error('Aucun son exploitable capté par le micro du téléphone.');
  return blob;
}
'''
s = s.replace(insert_anchor, insert + insert_anchor, 1)

cancel_anchor = "  activeDelayCancel?.();\n\n  const recording = activeRecording;"
if cancel_anchor not in s:
    raise SystemExit('cancel anchor missing')
s = s.replace(
    cancel_anchor,
    "  activeDelayCancel?.();\n\n  const recorder = webRecorder;\n  webRecorder = null;\n  if (recorder && recorder.state !== 'inactive') {\n    try { recorder.stop(); } catch {}\n  }\n\n  const recording = activeRecording;",
    1,
)

p.write_text(s)

# Regression contract for mobile Safari microphone path.
t = Path('packages/mobile/src/services/__tests__/mobileSafariMic.contract.test.ts')
t.write_text(r'''// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('mobile Safari microphone capture', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'micCapture.ts'), 'utf8');

  it('uses MediaRecorder first and keeps WebAudio only as fallback/visual metering', () => {
    expect(source).toContain("typeof MediaRecorder === 'undefined'");
    expect(source).toContain('new MediaRecorder(stream');
    expect(source).toContain("['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']");
    expect(source).toContain('captureAudioSampleWebLegacy');
  });

  it('captures music without voice-call processing', () => {
    expect(source).toContain('echoCancellation: false');
    expect(source).toContain('noiseSuppression: false');
    expect(source).toContain('autoGainControl: false');
    expect(source).toContain('channelCount: 1');
  });

  it('stops MediaRecorder immediately when ARRÊTER is pressed', () => {
    expect(source).toContain('const recorder = webRecorder');
    expect(source).toContain("recorder.state !== 'inactive'");
    expect(source).toContain('recorder.stop()');
  });
});
''')
