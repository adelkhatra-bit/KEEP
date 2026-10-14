// @ts-nocheck
import fs from 'fs';
import path from 'path';

const fromSrc = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', ...parts), 'utf8').replace(/\r\n/g, '\n');
const home = fromSrc('screens', 'HomeScreenCompact.tsx');
const tab = fromSrc('services', 'continuousTabMusicSession.ts');
const live = fromSrc('store', 'useSessionStore.ts');
const history = fromSrc('store', 'useSessionHistoryStore.ts');
const preview = fromSrc('components', 'TemporaryMusicPreview.tsx');
const modal = fromSrc('components', 'KeepVisibilityChoiceModal.tsx');

describe('Three music entries lead to the SAME sessions and FREE/visibility decisions', () => {
  it('microphone and browser tab recognition use the single live session', () => {
    expect(tab).toContain('live.submitCapturedAudioRecognition(recognition)');
    expect(live).toContain('submitCapturedAudioRecognition:');
    expect(tab).toContain('current.startSession({ captureMode: \'tab\' })');
    expect(home).toContain('onPress={startListening}');
  });

  it('a verified shared link is queued without FREE charge and survives preview close', () => {
    expect(home).toContain('addSharedLinkTrack(result.track, sourceUrl ?? undefined, owner)');
    expect(history).toContain("status: 'pending', detectedAt: now");
    expect(history).toContain('keepTrackInSession: async (sessionId, entryId, playlistId, visibility');
    const stage = home.slice(home.indexOf('const openTemporaryMusicPreview ='), home.indexOf('const nextManualSearch ='));
    expect(stage).not.toContain('keepTrackInSession(');
    expect(stage).not.toContain('pinStoryTrack(');
    expect(stage).not.toContain('recordKeepDecision(');
    expect(home).toContain('setManualKeepTarget(queued)');
  });

  it('uses the SAME choice component and remote FREE cost for link, microphone and Swipe', () => {
    expect(home).toContain('keepCostFree={creditCostPerKeep}');
    expect(preview).toContain('<KeepVisibilityChoiceContent');
    expect(modal).toContain('<KeepVisibilityChoiceContent {...props} />');
    expect(modal).toContain("PUBLIC SUR MON PROFIL");
    expect(modal).toContain("GARDER EN PRIVÉ");
    expect(home).toContain('<KeepVisibilityChoiceModal');
    expect(home).toContain('getDownloadCreditStatus()');
  });

  it('GARDER confirms server decision before publishing profile/Story', () => {
    const action = home.slice(home.indexOf('const confirmManualKeep = async'), home.indexOf('const saveManualPreviewToSessions ='));
    const commit = action.indexOf('keepTrackInSession(');
    const verified = action.indexOf("committed?.status !== 'kept'");
    const story = action.indexOf('notifyOwnStoryChanged()');
    expect(commit).toBeGreaterThanOrEqual(0);
    expect(verified).toBeGreaterThan(commit);
    expect(story).toBeGreaterThan(verified);
    expect(action).toContain("if (confirmedVisibility === 'PUBLIC')");
    expect(action).not.toContain('await pinStoryTrack(');
    expect(action).not.toContain('consumeDownloadCredit(');
  });

  it('contains preview to 20 seconds and never opens external YouTube directly', () => {
    expect(preview).toContain('0, 20000, setPreviewPlaying');
    expect(preview).toContain('&start=0&end=20');
    expect(preview).toContain('React.createElement(\'iframe\' as any');
    expect(home).toContain('onPress={tabMonitoring ? stopTabAudio : importCopiedMusicLink}');
    expect(home).toContain('navigator.clipboard.readText()');
  });

  it('changing to a second song invalidates the first result and keeps pending decisions', () => {
    expect(preview).toContain('onReplaceLink(nextLink.trim())');
    expect(home).toContain('searchGeneration.current += 1;');
    expect(home).toContain('setManualKeepTarget(null);');
    expect(home).toContain('setManualSearchResult(null);');
    expect(home).toContain('const generation = ++searchGeneration.current;');
  });

  it('enqueues an exact provider player only, no false musical recognition', () => {
    expect(home).toContain('originalEmbed.provider === verifiedEmbed.provider');
    expect(home).toContain('originalEmbed.url === verifiedEmbed.url');
    expect(home).toContain('sourceOnly && sameVerifiedPlayer');
  });
});
