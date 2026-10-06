// @ts-nocheck
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('[CHAT-UNREAD] déduplication visuelle sans perdre les messages à marquer lus', () => {
  const notifications = read('packages','mobile','src','services','notificationService.ts');
  const dock = read('packages','mobile','src','components','GlobalChatDock.tsx');
  const panel = read('packages','mobile','src','components','MusicAgoraPanel.tsx');

  it('permet au dock de charger les notifications brutes visibles sans déduplication sémantique', () => {
    expect(notifications).toContain("options: { dedupe?: boolean; unreadOnly?: boolean } = {}");
    expect(notifications).toContain("return options.dedupe === false ? visible : dedupeNotifications(visible);");
    expect(dock).toContain("loadNotifications(effectiveProfileId, { dedupe: false, unreadOnly: true })");
  });

  it('affiche un compteur par conversation et conserve tous les ids à lire', () => {
    expect(dock).toContain("const unreadCount = Object.keys(unreadByTarget).length;");
    expect(dock).toContain("setUnreadByTarget(buildChatUnreadMap(unreadChat))");
    expect(dock).not.toContain("setUnreadCount(0)");
    expect(panel).toContain("const ids = useGlobalChatStore.getState().consumeUnread(openThreadKey);");
    expect(panel).toContain("for (const id of ids) void markNotificationRead(currentProfileId, id)");
  });
});
