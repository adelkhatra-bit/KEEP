import type { KeepNotification } from './notificationService';

/**
 * Adel (02/10/2026) : « quand j'ouvre le tchat, je veux voir où il y a des
 * messages : un contour qui s'allume, un compteur ». Source unique : les
 * notifications de messages déjà créées par le serveur (AGORA_DIRECT,
 * AGORA_GROUP_MESSAGE, AGORA_GROUP_INVITE…), rangées par conversation.
 */

// « Tchat disponible » est une annonce système, pas un message : elle
// gonflait le compteur rouge du tchat (13 non lues en base le 02/10).
const NOT_A_MESSAGE = new Set(['CHAT_ACTIVATION_AVAILABLE']);

export function isChatNotification(item: Pick<KeepNotification, 'type'>): boolean {
  const type = String(item.type || '').toUpperCase();
  if (NOT_A_MESSAGE.has(type)) return false;
  return type.startsWith('AGORA') || type.startsWith('CHAT');
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Clé de conversation : `g:<groupe>` ou `p:<expéditeur>` (message privé). */
export function chatUnreadKey(item: Pick<KeepNotification, 'data'>): string | null {
  const data = item.data ?? {};
  const groupId = str(data.groupId ?? data.group_id);
  if (groupId) return `g:${groupId}`;
  const senderId = str(data.senderId ?? data.sender_id ?? data.actorId ?? data.actor_id);
  return senderId ? `p:${senderId}` : null;
}

export type ChatUnreadMap = Record<string, string[]>;

export function buildChatUnreadMap(items: KeepNotification[]): ChatUnreadMap {
  const map: ChatUnreadMap = {};
  for (const item of items) {
    if (item.readAt || !isChatNotification(item)) continue;
    const key = chatUnreadKey(item);
    if (!key) continue;
    (map[key] ||= []).push(item.id);
  }
  return map;
}
