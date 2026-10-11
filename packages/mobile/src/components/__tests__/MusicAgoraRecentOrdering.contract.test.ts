// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Loki chat recent-thread ordering', () => {
  const panel = read(__dirname, '..', 'MusicAgoraPanel.tsx');
  const dock = read(__dirname, '..', 'GlobalChatDock.tsx');
  const service = read(__dirname, '..', '..', 'services', 'musicAgoraService.ts');

  it('does not reopen a stale thread from the global chat drawer', () => {
    // Adel (02/10/2026) : le robot ouvre toujours la liste des conversations.
    expect(dock).toContain('openChat(null);');
    expect(dock).not.toContain('openChat(nextTarget);');
  });

  it('sorts direct and group inbox entries together by most recent activity', () => {
    expect(panel).toContain('const visibleInboxItems = useMemo(() => {');
    expect(panel).toContain('const timeDiff = b.sortTime - a.sortTime;');
    expect(panel).toContain('return timeDiff || b.sortId - a.sortId;');
  });

  it('normalizes server lists newest-first before rendering', () => {
    expect(service).toContain('new Date(b.lastCreatedAt || 0).getTime() - new Date(a.lastCreatedAt || 0).getTime()');
    expect(service).toContain('return timeDiff || b.lastMessageId - a.lastMessageId;');
  });
});
