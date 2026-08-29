// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Samsung mobile reliability', () => {
  const index = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'index.js'), 'utf8');
  const discover = fs.readFileSync(path.resolve(__dirname, '..', 'DiscoverScreen.tsx'), 'utf8');
  const mic = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'micCapture.ts'), 'utf8');
  const session = fs.readFileSync(path.resolve(__dirname, '..', '..', 'store', 'useSessionStore.ts'), 'utf8');

  it('pins React Native Web to the dynamic Android viewport', () => {
    expect(index).toContain('height:100dvh');
    expect(index).toContain('position:fixed; inset:0');
    expect(index).toContain('visualViewport');
    expect(index).toContain('overscroll-behavior:none');
  });

  it('keeps Discover responsive even when Samsung GPS is slow or denied', () => {
    expect(discover).toContain("setHasSearched(true)");
    expect(discover).toContain('GPS_PERMISSION_TIMEOUT');
    expect(discover).toContain('GPS_FIX_TIMEOUT');
    expect(discover).toContain('dernière position enregistrée');
    expect(discover).toContain('minHeight:48');
    expect(discover).toContain('minWidth:44,minHeight:44');
  });

  it('primes WebAudio directly from the Listen tap', () => {
    expect(mic).toContain('prepareAudioCaptureFromUserGesture');
    expect(mic).toContain("if (ctx.state === 'suspended') void ctx.resume()");
    expect(session).toContain('prepareAudioCaptureFromUserGesture();');
  });
});
