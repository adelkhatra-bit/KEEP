import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const history = fs.readFileSync(path.join(root, 'screens', 'SessionHistoryScreen.tsx'), 'utf8');
const recap = fs.readFileSync(path.join(root, 'screens', 'SessionRecapScreen.tsx'), 'utf8');

describe('Session Swipe re-entry and replay', () => {
  it('unlocks audio and opens Swipe from a saved session, even after decisions', () => {
    expect(history).toContain('unlockWebAudioForGesture()');
    expect(history).toContain("navigation.replace('SessionRecap', { sessionId: item.id, openSwipe: true })");
  });

  it('auto-opens replay when a completed session has tracks but none pending', () => {
    expect(recap).toContain('const playable = previewOnly ? sortedTracks.map((entry) => entry.track) : pending;');
    expect(recap).toContain('session?.tracks.length');
    expect(recap).not.toContain('!pendingSwipeTracks.length || swipeOpen');
    expect(recap).toContain('}, 450);');
  });
});
