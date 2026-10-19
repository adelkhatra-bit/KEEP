// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Swipe keep responsiveness contract', () => {
  it('does not leave the deck locked forever when the keep callback never resolves', () => {
    expect(source).toContain('const KEEP_ACTION_TIMEOUT_MS = 20_000');
    expect(source).toContain("new Promise<{ kind: 'timeout' }>");
    expect(source).toContain("Alert.alert('Le serveur tarde à répondre'");
    expect(source).toContain('setProcessing(false)');
    expect(source).toContain('actionInFlight.current = false');
  });

  it('prevents a second request for the same track while a timed-out write is still pending', () => {
    expect(source).toContain('keepRequestsInFlightRef.current.has(keptTrack.id)');
    expect(source).toContain('keepRequestsInFlightRef.current.add(keptTrack.id)');
    expect(source).toContain('void request.then(');
    expect(source).toContain('Pour éviter un double débit');
  });

  it('does not advance or claim success after a timeout or rejected request', () => {
    const block = source.slice(source.indexOf('const confirmKeep ='), source.indexOf('const continueAfterKeepSuccess'));
    expect(block).toContain("if (outcome.kind === 'timeout')");
    expect(block).toContain("if (outcome.kind === 'error')");
    expect(block).toContain('Le morceau reste dans ta session');
    expect(block).toContain('await advance()');
  });
});
