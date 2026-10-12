// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Mes Sessions compact header help contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'SessionHistoryScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('keeps the header compact without plan or redundant history eyebrow', () => {
    expect(source).toContain('accessibilityLabel="Comprendre Mes Sessions"');
    expect(source).not.toContain('SESSION_PLAN_BADGE');
    expect(source).not.toContain('<Text style={styles.headerEyebrow}>HISTORIQUE</Text>');
    expect(source).not.toContain('getDownloadCreditStatus');
  });

  it('always shows one total for pending music, including the PC monitoring session', () => {
    expect(source).toContain('testID="session-history-pending-total"');
    expect(source).toContain('const totalPending = useMemo(');
    expect(source).toContain('total + pendingTracks(item)');
    expect(source).toContain('SWIPER TOUTES · {pendingCount}');
    expect(source).toContain("stopContinuousTabMusic();");
    expect(source).toContain("openSwipe: pendingCount > 0");
  });

  it('keeps the recap pending count and swipe-all action across phone and computer', () => {
    const recap = fs.readFileSync(path.resolve(__dirname, '..', 'SessionRecapScreen.tsx'), 'utf8');
    expect(recap).toContain('testID="session-recap-pending-total"');
    expect(recap).toContain('SWIPER TOUTES · {pendingCount}');
    expect(recap).toContain('tracks={swipeTracks}');
    expect(recap).toContain('onKeep={handleSwipeKeep}');
    expect(recap).toContain('onPass={handleSwipePass}');
  });

  it('does not open YouTube outside Loki or silently consume FREE in continuous PC capture', () => {
    const tab = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'continuousTabMusicSession.ts'), 'utf8');
    expect(tab).toContain('startTabAudioMonitor(');
    expect(tab).toContain('recognizeFreshTabAudio(sample)');
    expect(tab).toContain('submitCapturedAudioRecognition(recognition)');
    expect(tab).toContain("session.requestEndSession();");
    expect(tab).not.toContain('Linking.openURL');
    expect(tab).not.toContain('youtube.com/watch?');
  });

  it('explains the session workflow behind a question-mark help sheet', () => {
    expect(source).toContain('title="Mes Sessions"');
    expect(source).toContain("title: 'Retrouver une écoute'");
    expect(source).toContain("title: 'Swiper ce qui reste'");
    expect(source).toContain("title: 'Garder sans doublon'");
    expect(source).toContain("title: 'Supprimer une session'");
  });
});
