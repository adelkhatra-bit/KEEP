import fs from 'fs';
import path from 'path';

describe('TrackListenControls — durées réelles des extraits de session', () => {
  const controls = fs.readFileSync(path.resolve(__dirname, '..', 'TrackListenControls.tsx'), 'utf8');
  const audio = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'audioPreviewService.ts'), 'utf8');

  it('affiche uniquement 10, 20, 25 et 30 secondes', () => {
    expect(controls).toContain('▶ 10s');
    expect(controls).toContain('▶ 20s');
    expect(controls).toContain('▶ 25s');
    expect(controls).toContain('▶ 30s');
    expect(controls).not.toContain('▶ 0s');
  });

  it('chaque bouton transmet une durée et démarre au début du preview', () => {
    expect(controls).toContain('playSnippet(10000)');
    expect(controls).toContain('playSnippet(20000)');
    expect(controls).toContain('playSnippet(25000)');
    expect(controls).toContain('playSnippet(30000)');
    expect(controls).toContain('playTrackPreviewSegment(previewKey, resolvedPreviewUrl, 0, durationMillis, resumeListeningOnStop, onPreviewFinished, true)');
  });

  it('préserve le décalage Battle par défaut mais autorise explicitement le départ à zéro', () => {
    expect(audio).toContain('startFromBeginning = false');
    expect(audio).toContain('!startFromBeginning');
    expect(audio).toContain('startFromBeginning ? Math.max(0, positionMillis) : (positionMillis > 0 ? positionMillis : 9000)');
  });
});
