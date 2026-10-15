import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
const clamped = fs.readFileSync(path.resolve(__dirname, '..', 'ClampedText.tsx'), 'utf8');

describe('Profile preview: exact source playback across iPhone and desktop', () => {
  it('falls back to the original source when Apple previews are unavailable or expire', () => {
    expect(source).toContain("if (!isSaleStoryTrack(current) && resolveEmbeddedMusicPlayer(source)) {");
    expect(source).toContain('if (sourcePlayer && !trackAddedAt) {');
    expect(source).toContain('setResolvedPreviewUrl(null);');
    expect(source).toContain('setSourcePlayerOpen(true);');
    expect(source).toContain("skipUnavailablePreview('native_preview_play_failed')");
    expect(source).toContain("skipUnavailablePreview('web_preview_play_failed')");
    expect(source).toContain("SWIPE_EXACT_SOURCE_FALLBACK");
  });

  it('re-evaluates after delayed YouTube source metadata arrives', () => {
    expect(source).toContain('current?.externalUrls?.source, current?.externalUrls?.youtube, index');
    expect(source).toContain('!hasCatalogIdentity && !isSaleStoryTrack(current)');
  });

  it('requests autoplay from the legitimate YouTube player without misleading users about sound', () => {
    expect(source).toContain("&autoplay=1&start=0&end=30");
    expect(source).toContain('buildNativeYouTubeEmbedDocument(sourcePlayer');
    expect(source).toContain('nativeSourcePlayerDocument.baseUrl');
    expect(source).toContain("message?.type === 'youtube-error'");
    expect(source).toContain('mediaPlaybackRequiresUserAction: false');
    expect(source).toContain('domStorageEnabled: true');
    expect(source).toContain('testID="preview-youtube-autoplay-hint"');
    expect(source).toContain('setSourcePlayerAttempt((n) => n + 1)');
  });

  it('never bypasses a paid music teaser using its external source', () => {
    expect(source).toContain('!(Boolean(saleInfoByTrackId?.[current.id]) || offeredIds.has(current.id))');
    expect(source).toContain('if (sourcePlayer && !trackAddedAt)');
  });
});

describe('Swipe reaction counter placement and compact help labels', () => {
  it('displays the three reactions beside the title, not beneath the header', () => {
    const header = source.indexOf('testID="deck-reactions-near-title"');
    const end = source.indexOf('testID="deck-like-bar"');
    expect(header).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(header);
    expect(source).toContain('showHeaderCountPills');
    expect(source).toContain('testID="deck-reactions-animated-edge"');
    expect(source).toContain('color="#68F2B1"');
  });

  it('keeps fully accessible expansion without verbose visible labels', () => {
    expect(clamped).toContain("{open ? 'Moins' : 'Plus'}");
    expect(clamped).toContain("accessibilityLabel={open ? 'Moins' : 'Plus'}");
    expect(clamped).not.toContain("{open ? 'Réduire' : 'En savoir plus'}");
  });
});
