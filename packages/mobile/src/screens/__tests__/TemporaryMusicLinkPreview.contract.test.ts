// @ts-nocheck
import fs from 'fs';
import path from 'path';

const home = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');
const sharedSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'sharedMusicSourceService.ts'), 'utf8');
const searchBlock = home.slice(home.indexOf('const runManualSearch = async () => {'), home.indexOf('const refreshCreditBadge = async () => {'));
const clipboardBlock = home.slice(home.indexOf('const recordSharedLinkResult = async'), home.indexOf('const testTabCapture = async'));

describe('Temporary link/music preview is shared by PC and mobile', () => {
  it('only looks up metadata, never adds a pasted link to a session, library or history', () => {
    expect(searchBlock).toContain('searchTrackByText(input)');
    expect(searchBlock).toContain('openTemporaryMusicPreview(found, input)');
    // Preview lookup is read-only; saving is an explicit, separate user action.
    expect(home).toContain('const saveManualPreviewToSessions = () =>');
    expect(home).toContain('onSave={saveManualPreviewToSessions}');
    expect(home).toContain('addSharedLinkTrack(');
    expect(home).toContain('onNext={nextManualSearch}');
    expect(searchBlock).not.toMatch(/submitManualSearch\(|submitSharedLinkRecognition\(|startSession\(|commitKeep\(|persistLiveSession\(/);
    expect(clipboardBlock).toContain('searchTrackByText(supportedUrl)');
    expect(clipboardBlock).not.toMatch(/submitManualSearch\(|submitSharedLinkRecognition\(|startSession\(|commitKeep\(|persistLiveSession\(/);
  });

  it('closes and clears results on user dismissal or tab change, including stale async lookup', () => {
    expect(home).toContain('const closeManualSearchPreview = () => {');
    expect(home).toContain('setManualSearchResult(null)');
    expect(home).toContain("navigation?.addListener?.('blur', closeManualSearchPreview)");
    expect(home).toContain('if (generation !== searchGeneration.current) return');
    expect(home).toContain('testID="close-manual-search-preview"');
    expect(home).toContain('onPress={closeManualSearchPreview}');
    expect(home).toContain('onRequestClose={closeManualSearchPreview}');
  });

  it('uses one feature flow on both viewports, with the native design preserved', () => {
    expect(home).toContain('const manualResultPreview = manualSearchResult ? (');
    expect(home).toContain('testID="home-manual-search-result"');
    expect(home.match(/\{manualResultPreview\}/g)?.length).toBe(2);
    expect(home).toContain('Aperçu non enregistré');
    expect(sharedSource).toContain('supportedSharedMusicUrl');
  });
});
