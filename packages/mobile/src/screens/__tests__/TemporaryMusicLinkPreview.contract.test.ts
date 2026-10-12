// @ts-nocheck
import fs from 'fs';
import path from 'path';

const home = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');
const temporary = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'TemporaryMusicPreview.tsx'), 'utf8');
const sharedSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'sharedMusicSourceService.ts'), 'utf8');
const history = fs.readFileSync(path.resolve(__dirname, '..', '..', 'store', 'useSessionHistoryStore.ts'), 'utf8');
const tab = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'continuousTabMusicSession.ts'), 'utf8');
const live = fs.readFileSync(path.resolve(__dirname, '..', '..', 'store', 'useSessionStore.ts'), 'utf8');

const between = (s: string, start: string, end: string) => {
  const a = s.indexOf(start);
  const b = s.indexOf(end, a + start.length);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return s.slice(a, b);
};
const search = between(home, 'const runManualSearch = async (inputOverride?: string) => {', 'const refreshCreditBadge = async () => {');
const preview = between(home, 'const openTemporaryMusicPreview = (', 'const nextManualSearch = () => {');
const confirm = between(home, "const confirmManualKeep = async (visibility: 'PUBLIC' | 'PRIVATE') => {", 'const saveManualPreviewToSessions = () => {');

describe('One KEEP / FREE / story contract for microphone, PC tab, and copied links', () => {
  it('searches the exact pasted link without activating the microphone or charging FREE', () => {
    expect(search).toContain('searchTrackByText(input)');
    expect(search).toContain('openTemporaryMusicPreview(found, input)');
    expect(search).not.toMatch(/submitManualSearch\(|startSession\(|commitKeep\(|recordKeepDecision\(/);
    expect(sharedSource).toContain('supportedSharedMusicUrl');
    expect(preview).toContain('addSharedLinkTrack(');
    expect(preview).toContain('setManualKeepTarget(queued)');
    expect(preview).toContain('setManualResultSaved(Boolean(queued))');
    expect(history).toContain("status: 'pending'");
  });

  it('allows one GARDER action with the existing Public / Private / FREE chooser', () => {
    expect(home).toContain('onKeep={requestManualKeep}');
    expect(home).toContain('onChooseVisibility={(visibility) => { void confirmManualKeep(visibility); }}');
    expect(temporary).toContain('KeepVisibilityChoiceContent');
    expect(temporary).toContain('costFree={keepCostFree}');
    expect(confirm).toContain('keepTrackInSession(target.sessionId, target.entryId, manualKeepPlaylistId, visibility)');
    expect(confirm).toContain("committed?.status !== 'kept'");
    expect(history).toContain('await commitKeep(entry.track, entry.recommendations, playlistId');
    expect(live).toContain('await commitKeep(entry.track, entry.recommendations, playlistId');
  });

  it('shows an own PUBLIC kept song in Story through the existing decision, without a duplicate pin', () => {
    expect(confirm).toContain("if (visibility === 'PUBLIC')");
    expect(confirm).toContain('notifyOwnStoryChanged()');
    expect(confirm).not.toContain('await pinStoryTrack(');
  });

  it('keeps tab monitoring linked to the same microphone session pipeline', () => {
    expect(tab).toContain('await live.submitCapturedAudioRecognition(recognition)');
    expect(live).toContain("return applyDetectedTrack(set, get, recognition, 'listen')");
    expect(tab).toContain("current.startSession({ captureMode: 'tab' })");
  });

  it('replaces one link without leaving Loki or preserving the previous embedded player', () => {
    expect(home).toContain('const nextManualSearch = () => {');
    expect(home).toContain('setManualSearchResult(null)');
    expect(home).toContain('if (generation !== searchGeneration.current) return');
    expect(home).toContain('onReplaceLink={(link) => { void runManualSearch(link); }}');
    expect(home).toContain("navigation?.addListener?.('blur', closeManualSearchPreview)");
    expect(temporary).toContain('key={embed.url}');
    expect(home.match(/\{manualResultPreview\}/g)?.length).toBe(2);
  });
});
