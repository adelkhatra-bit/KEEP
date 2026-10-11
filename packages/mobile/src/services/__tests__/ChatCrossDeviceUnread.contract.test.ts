import fs from 'fs';
import path from 'path';
import { buildChatUnreadMap } from '../chatUnread';
import type { KeepNotification } from '../notificationService';

const dock = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'components', 'GlobalChatDock.tsx'),
  'utf8',
);

function notification(id: string, senderId: string, readAt: string | null): KeepNotification {
  return {
    id, type: 'AGORA_DIRECT', title: 'Message', body: 'Salut',
    data: { senderId }, createdAt: '2026-10-11T16:00:00Z', readAt,
  };
}

describe('PC/mobile chat read receipts', () => {
  it('removes a message from the computer badge once it has been read on phone', () => {
    const unread = notification('101', 'user-a', null);
    expect(buildChatUnreadMap([unread])).toEqual({ 'p:user-a': ['101'] });
    const phoneRead = { ...unread, readAt: '2026-10-11T16:01:00Z' };
    expect(buildChatUnreadMap([phoneRead])).toEqual({});
  });

  it('preserves only the other unread conversation after one thread was read', () => {
    const first = notification('101', 'user-a', '2026-10-11T16:01:00Z');
    const second = notification('102', 'user-b', null);
    expect(buildChatUnreadMap([first, second])).toEqual({ 'p:user-b': ['102'] });
  });

  it('refreshes the server-backed badge on UPDATE, focus and intermittent Realtime loss', () => {
    expect(dock).toContain('subscribeToNotificationChanges(effectiveProfileId');
    expect(dock).toContain("AppState.addEventListener('change'");
    expect(dock).toContain("window.addEventListener('focus'");
    expect(dock).toContain('30000');
    expect(dock).toContain("Platform.OS !== 'web' && AppState.currentState !== 'active'");
    expect(dock).toContain('setUnreadByTarget(buildChatUnreadMap(unreadChat))');
  });

  it('never plays a new-message sound or speaks from a stale notification alone', () => {
    expect(dock).toContain('const unreadNow = await refreshUnreadRef.current?.()');
    expect(dock).toContain('if (!unreadNow?.some((row) => row.id === item.id)) return;');
    expect(dock).toContain('if (!unreadNow?.length || useGlobalChatStore.getState().isOpen) return;');
    expect(dock).not.toContain('useGlobalChatStore.getState().addUnread(unreadKey, item.id)');
  });
});
