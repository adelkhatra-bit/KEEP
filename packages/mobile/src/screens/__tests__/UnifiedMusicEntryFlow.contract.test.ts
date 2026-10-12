// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
const home = read('../HomeScreenCompact.tsx');
const temporary = read('../../components/TemporaryMusicPreview.tsx');
const chooser = read('../../components/KeepVisibilityChoiceModal.tsx');
const swipe = read('../../components/MusicSwipeDeckModal.tsx');
const tab = read('../../services/continuousTabMusicSession.ts');
const sessions = read('../../store/useSessionHistoryStore.ts');

/** One music decision contract, independent of desktop/mobile design and capture method. */
describe('Same music decision workflow for microphone, PC tab and shared link', () => {
  it('PC tab hands recognition to the live microphone/session pipeline', () => {
    expect(tab).toContain('live.submitCapturedAudioRecognition(recognition)');
    expect(tab).toContain("current.startSession({ captureMode: 'tab' })");
    expect(home).toContain('submitCapturedAudioRecognition');
  });

  it('shared URLs enter Mes Sessions as pending without spending FREE', () => {
    expect(home).toContain('history.addSharedLinkTrack(result.track, sourceUrl ?? undefined, owner)');
    expect(sessions).toContain("status: 'pending', detectedAt: now");
    const enqueue = sessions.slice(sessions.indexOf('addSharedLinkTrack: ('), sessions.indexOf('deleteSession: ('));
    expect(enqueue).not.toContain('commitKeep(');
    expect(enqueue).not.toContain('recordKeepDecision(');
  });

  it('GARDER from the shared link uses the same server credit and visibility transaction as Swipe', () => {
    expect(home).toContain('keepTrackInSession(target.sessionId, target.entryId, manualKeepPlaylistId, visibility)');
    expect(sessions).toContain('await commitKeep(entry.track, entry.recommendations, playlistId, {');
    expect(home).toContain('costFree={creditCostPerKeep} playlists={playlists.map(');
    expect(temporary).toContain('<KeepVisibilityChoiceContent');
    expect(temporary).toContain('selectedPlaylistId={selectedPlaylistId} onSelectPlaylist={onSelectPlaylist}');
    expect(swipe).toContain('<KeepVisibilityChoiceModal');
    expect(chooser).toContain('export function KeepVisibilityChoiceContent(');
  });

  it('different YouTube video IDs are different cards even with matching uploader titles', () => {
    expect(home).toContain('id: `source-youtube:${youtubeVideoId}`');
    expect(home).toContain('providerIds: { ...found.providerIds, youtube: youtubeVideoId }');
    expect(sessions).toContain('if (normalizedSource && previousSource) return normalizedSource === previousSource;');
    expect(temporary).toContain('key={embed.url}');
  });

  it('a second link replaces the first player, while PUBLIC may publish Story only after KEEP', () => {
    expect(home).toContain('searchGeneration.current += 1');
    expect(home).toContain('setManualSearchResult(null)');
    expect(temporary).toContain('onReplaceLink(nextLink.trim())');
    const commit = home.slice(home.indexOf('const confirmManualKeep = async ('), home.indexOf('const saveManualPreviewToSessions ='));
    expect(commit.indexOf('keepTrackInSession(')).toBeGreaterThan(-1);
    expect(commit.indexOf('pinStoryTrack(')).toBeGreaterThan(commit.indexOf('keepTrackInSession('));
    expect(commit).toContain("if (visibility === 'PUBLIC')");
  });
});
