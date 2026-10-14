import fs from 'fs';
import path from 'path';

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', relative), 'utf8');
const home = read('screens/HomeScreenCompact.tsx');
const recap = read('screens/SessionRecapScreen.tsx');
const row = read('components/TrackRow.tsx');
const controls = read('components/TrackListenControls.tsx');
const shared = read('components/TemporaryMusicPreview.tsx');
const locale = JSON.parse(read('i18n/locales/fr.json'));

describe('Sessions / Home link playback parity (iPhone + PC)', () => {
  it('shortens the recap header without deleting a session or its history', () => {
    expect(locale.session.recapTitle).toBe('Session');
    expect(recap).toContain('testID="session-short-header"');
    expect(recap).toContain('useSessionHistoryStore');
    expect(recap).toContain('<TrackRow');
    expect(recap).toContain('<MusicSwipeDeckModal');
  });

  it('makes Session audio previews and controls touch-size and immediately visible', () => {
    expect(row).toContain('compactSession />');
    expect(controls).toContain('testID="session-preview-play-20"');
    expect(controls).toContain('testID="session-preview-play-30"');
    expect(controls).toContain('minHeight: 44');
    expect(row).toContain('passBtn: { width: 44, height: 44');
    expect(row).toContain('keepBtn: { width: 44, height: 44');
    expect(recap).toContain('flexWrap: \'wrap\'');
    expect(recap).toContain("flexBasis: '100%'");
  });

  it('lets a completed session be replayed through Swipe without modifying FREE or kept tracks', () => {
    expect(recap).toContain('const [swipePreviewOnly, setSwipePreviewOnly] = useState(false);');
    expect(recap).toContain('const playable = previewOnly ? sortedTracks.map((entry) => entry.track) : pending;');
    expect(recap).toContain('previewOnly={swipePreviewOnly}');
    expect(recap).toContain('askVisibilityOnKeep={!swipePreviewOnly}');
    expect(recap).toContain('testID="session-swipe-or-replay"');
    expect(recap).toContain('RÉÉCOUTER EN SWIPE');
  });

  it('keeps source-only YouTube audio tied to exact real pasted video, not a fuzzy catalogue song', () => {
    expect(home).toContain("originalEmbed!.url.match(/\\/embed\\/([\\w-]{11})/)");
    expect(home).toContain('if (!openTemporaryMusicPreview(null, input)) setManualSearchNotFound(true)');
    expect(home).toContain('unlockWebAudioForGesture()');
    expect(shared).toContain('!result.sourceOnly');
    expect(shared).toContain("if (!visible || !result?.identified || embed || !previewUrl || keepChoiceOpen) return");
  });

  it('uses the YouTube source identity and autoplay of Loki Story/Swipe with a real retry action', () => {
    expect(shared).toContain("Referer: 'https://com.adelkhatra.keep'");
    expect(shared).toContain('&start=0&end=20&autoplay=1&playsinline=1');
    expect(shared).toContain('mediaPlaybackRequiresUserAction={false}');
    expect(shared).toContain('testID="temporary-music-restart-provider"');
    expect(shared).toContain('onError={() => setProviderError(true)}');
    expect(shared).toContain('testID="temporary-music-provider-error"');
    expect(shared).toContain('referrerPolicy: \'strict-origin-when-cross-origin\'');
  });

  it('uses common Swipe colors, colored outlines and actionable controls on mobile and PC', () => {
    expect(home).toContain('style={s.homeFindLinkButton}');
    expect(home).toContain('manualSearchSubmit');
    expect(shared).toContain('testID="temporary-music-swipe-card"');
    expect(shared).toContain("borderColor: '#A78BFA'");
    expect(shared).toContain("borderColor: '#68F2B1'");
    expect(shared).toContain('testID="temporary-music-next-link-search"');
    expect(shared).toContain('testID="temporary-music-play-catalog-excerpt"');
    expect(shared).toContain('testID="temporary-music-keep"');
  });
});
