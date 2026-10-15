// @ts-nocheck
import fs from 'fs';
import path from 'path';

const store = fs.readFileSync(path.resolve(__dirname, '..', 'useSessionHistoryStore.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('session deletion and anti-resurrection contract', () => {
  it('tombstones a deleted session and its saved decisions without deleting profile Keeps', () => {
    const deletion = store.slice(store.indexOf('deleteSession: (sessionId)'), store.indexOf('// Clear the visible history'));
    expect(deletion).toContain('dismissedSessionIds: Array.from(new Set([...s.dismissedSessionIds, sessionId]))');
    expect(deletion).toContain('dismissedKeepDecisionIds: Array.from(new Set([...s.dismissedKeepDecisionIds, ...decisionIds]))');
    expect(deletion).toContain('dismissedFavoriteImportIds');
    expect(deletion).not.toContain('deleteKeepDecision');
  });

  it('clear-all records tombstones before server reconciliation can restore old sessions', () => {
    const clear = store.slice(store.indexOf('clearSessions: () => set('), store.indexOf('renameSession: (sessionId, title) => set('));
    expect(clear).toContain('sessions: []');
    expect(clear).toContain('...s.sessions.map((session) => session.id)');
    expect(clear).toContain('session.tracks.map((track) => track.keepDecisionId)');
    expect(clear).toContain("track.id.startsWith('favimport-')");
  });

  it('does not accept late session upserts after the user dismissed that session', () => {
    const add = store.slice(store.indexOf('addSession: (session)'), store.indexOf('// Each shared link'));
    expect(add).toContain('s.dismissedSessionIds.includes(session.id)');
    expect(add).toContain('if (s.dismissedSessionIds.includes(session.id)) return s;');
  });

  it('does not reimport dismissed provider favorites, but allows genuinely new imports', () => {
    expect(store).toContain('const dismissedProviderIds = new Set(state.dismissedFavoriteImportIds)');
    expect(store).toContain('!dismissedProviderIds.has(`favimport-${item.id}`)');
    expect(store).toContain('dismissedSessionIds: state.dismissedSessionIds.filter((id) => id !== FAVORITES_IMPORT_SESSION_ID)');
  });
});
