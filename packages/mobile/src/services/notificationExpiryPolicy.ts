/**
 * Presentation-only retention. No database deletion and no impact on financial
 * or moderation audit records.
 */
export const IMPORTANT_NOTIFICATION_TYPE = /(?:PAYMENT|PAYOUT|PURCHASE|ORDER|SALE|TICKET|REFUND|DISPUTE|SECURITY|ACCOUNT|PLAN_GIFT|EVENT_APPROVED|EVENT_REJECTED|EVENT_FIELD_REJECTED|ADMIN_CREDIT|FREE_CREDIT|MODERATION)/;
export const EPHEMERAL_BATTLE_TYPE = /^(?:BATTLE_PLAYER_AVAILABLE|BATTLE_ARENA_REMATCH|BATTLE_REMATCH|BATTLE_CHALLENGE|BATTLE_INVITE|BATTLE_INVITATION|BATTLE_ARENA_INVITE)$/;

export function notificationIsCurrent(item: { type: string; createdAt: string }, now = new Date()): boolean {
  const created = new Date(item.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const current = now.getTime();
  if (created > current + 5 * 60 * 1000) return false;
  const type = String(item.type || '').trim().toUpperCase();
  if (IMPORTANT_NOTIFICATION_TYPE.test(type)) return true;
  if (EPHEMERAL_BATTLE_TYPE.test(type)) return current - created < 2 * 60 * 60 * 1000;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return created >= todayStart;
}
