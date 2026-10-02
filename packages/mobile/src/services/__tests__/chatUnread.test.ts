jest.mock('../supabaseClient', () => ({ supabase: null }));
jest.mock('../../config/brand', () => ({ APP_NAME: 'Loki Music' }));
import fs from 'fs';
import path from 'path';
import { buildChatUnreadMap, chatUnreadKey, isChatNotification } from '../chatUnread';
import { dedupeNotifications, KeepNotification } from '../notificationService';

// Adel (02/10/2026) : voir où sont les messages non lus (contour + compteur).
const n = (id: string, type: string, data: Record<string, unknown>, readAt: string | null = null, body = '@samedi a envoyé un message.'): KeepNotification => ({
  id, type, title: 'TESTE', body, data, readAt, createdAt: new Date(Date.now() - Number(id.replace(/\D/g, '') || 0) * 1000).toISOString(),
});

describe('non-lus du tchat', () => {
  it('« Tchat disponible » is an announcement, never an unread message', () => {
    expect(isChatNotification({ type: 'CHAT_ACTIVATION_AVAILABLE' })).toBe(false);
    expect(isChatNotification({ type: 'AGORA_GROUP_MESSAGE' })).toBe(true);
    expect(isChatNotification({ type: 'AGORA_DIRECT' })).toBe(true);
  });

  it('groups unread by conversation (group first, else sender)', () => {
    expect(chatUnreadKey({ data: { groupId: 'g1', senderId: 's1' } })).toBe('g:g1');
    expect(chatUnreadKey({ data: { senderId: 's1' } })).toBe('p:s1');
    const map = buildChatUnreadMap([
      n('1', 'AGORA_GROUP_MESSAGE', { groupId: 'g1', senderId: 's1', messageId: 1 }),
      n('2', 'AGORA_GROUP_MESSAGE', { groupId: 'g1', senderId: 's1', messageId: 2 }),
      n('3', 'AGORA_DIRECT', { senderId: 's1', messageId: 9 }),
      n('4', 'AGORA_DIRECT', { senderId: 's1', messageId: 10 }, '2026-10-02T00:00:00Z'),
      n('5', 'CHAT_ACTIVATION_AVAILABLE', {}),
    ]);
    expect(map).toEqual({ 'g:g1': ['1', '2'], 'p:s1': ['3'] });
  });

  it('identical group notifications for DIFFERENT messages are not merged (real text in base)', () => {
    const items = [
      n('1', 'AGORA_GROUP_MESSAGE', { groupId: 'g1', messageId: 26 }),
      n('2', 'AGORA_GROUP_MESSAGE', { groupId: 'g1', messageId: 27 }),
      n('3', 'AGORA_GROUP_MESSAGE', { groupId: 'g1', messageId: 27 }),
    ];
    expect(dedupeNotifications(items).map((i) => i.id)).toEqual(['1', '2']);
  });

  it('the group asked at opening is applied once (Retour no longer bounces back)', () => {
    const panel = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'MusicAgoraPanel.tsx'), 'utf8');
    expect(panel).toContain('if (appliedInitialGroupRef.current === initialGroupId) return;');
    expect(panel).toContain('const ids = useGlobalChatStore.getState().consumeUnread(openThreadKey);');
  });
});
