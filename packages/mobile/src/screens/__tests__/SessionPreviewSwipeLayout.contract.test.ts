import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const recap = fs.readFileSync(path.join(root, 'screens', 'SessionRecapScreen.tsx'), 'utf8');
const row = fs.readFileSync(path.join(root, 'components', 'TrackRow.tsx'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'components', 'TrackListenControls.tsx'), 'utf8');
const fr = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'locales', 'fr.json'), 'utf8'));

describe('Session iPhone + PC: compact design, reliable pre-listen, usable swipe', () => {
  test('displays Session instead of Ta session Loki Music without removing naming or sharing', () => {
    expect(fr.session.recapTitle).toBe('Session');
    expect(recap).not.toContain('<Text style={styles.headerEyebrow}>SESSION</Text>');
    expect(recap).toContain("t('session.recapTitle')");
    expect(recap).toContain('onPress={handleTitleSave}');
    expect(recap).toContain('onPress={handleShare}');
    expect(recap).toContain('testID="session-open-swipe"');
  });

  test('keeps a single primary Swipe entry with accessible action buttons and no duplicated CTA', () => {
    expect(recap.match(/SWIPER ·/g)).toHaveLength(1);
    expect(recap).toContain('optimisticPass');
    expect(recap).toContain('onPass={handleSwipePass}');
    expect(recap).toContain('onKeep={handleSwipeKeep}');
    expect(recap).toContain('accessibilityLabel="Supprimer cette session"');
    expect(recap).toContain("primaryActionsRow: { flexDirection: 'row'");
    expect(recap).toContain("sessionActionsRow: { alignItems: 'stretch'");
  });

  test('offers a real full-width pre-listen for each pending, kept and recoverable removed song', () => {
    expect(row).toContain('style={styles.previewSlot}');
    expect(row).toContain('<TrackListenControls track={track} previewKey={`session:${entry.id}`} compactPreview />');
    expect(preview).toContain('compactPreview?: boolean');
    expect(preview).toContain('testID={`session-preview-${previewKey}`}');
    expect(preview).toContain('playSnippet(30000)');
    expect(preview).toContain('PRÉ-ÉCOUTER · 30 s');
    expect(preview).toContain('ARRÊTER L’EXTRAIT');
    expect(preview).toContain('if (previewPlaying) {');
    expect(preview).toContain('stopTrackPreviewFast(previewKey);');
    expect(row).toContain('width: 44, height: 44');
  });

  test('does not leave unavailable Apple previews forever unresolved or lose microphone recovery', () => {
    expect(preview).toContain('.catch(() => { if (live) setResolvedPreviewUrl(null); })');
    expect(preview).toContain('resolveTrackPreviewUrl(track, { forceRefresh: true })');
    expect(preview).toContain('resumeListeningOnStop(false)');
    expect(preview).toContain('stopTrackPreviewFast(previewKey)');
  });

  test('preserves stored sessions and only advances on confirmed keep or manual pass', () => {
    expect(recap).toContain("if (refreshed?.status !== 'kept')");
    expect(recap).toContain('const handleSwipePass = async (track: CanonicalTrack)');
    expect(recap).toContain('passTrackInSession(sessionId, entry.id)');
    expect(recap).toContain('restoreTrackInSession(sessionId, entryId)');
    expect(recap).toContain('setSwipeTracks(pending)');
    expect(recap).toContain("setSwipeOpen(false);");
    expect(recap).toContain('const [showPassed, setShowPassed] = useState(false)');
  });
});
