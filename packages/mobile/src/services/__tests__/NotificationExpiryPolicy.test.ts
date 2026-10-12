import { notificationIsCurrent } from '../notificationService';

describe('notification retention in the user bell', () => {
  const now = new Date('2026-10-12T15:00:00');
  const item = (type: string, createdAt: string) => ({ type, createdAt });

  it('shows fresh notifications from today', () => {
    expect(notificationIsCurrent(item('AGORA_DIRECT', '2026-10-12T10:00:00'), now)).toBe(true);
  });
  it('hides yesterday ordinary notifications without deleting the database row', () => {
    expect(notificationIsCurrent(item('AGORA_DIRECT', '2026-10-11T23:59:00'), now)).toBe(false);
  });
  it('expires Battle invites after two hours, even on the same day', () => {
    expect(notificationIsCurrent(item('BATTLE_PLAYER_AVAILABLE', '2026-10-12T12:00:00'), now)).toBe(false);
    expect(notificationIsCurrent(item('BATTLE_ARENA_REMATCH', '2026-10-12T14:00:00'), now)).toBe(true);
  });
  it('preserves important purchase, account and moderation notifications', () => {
    for (const type of ['PLAYLIST_SALE_PAYMENT_READY', 'PLAN_GIFTED', 'EVENT_APPROVED', 'ADMIN_CREDIT_GRANT', 'SECURITY_ALERT']) {
      expect(notificationIsCurrent(item(type, '2026-09-08T10:00:00'), now)).toBe(true);
    }
  });
  it('does not display invalid timestamps or future-dated alerts', () => {
    expect(notificationIsCurrent(item('EVENT_INVITE', 'bad'), now)).toBe(false);
    expect(notificationIsCurrent(item('EVENT_INVITE', '2026-10-13T10:00:00'), now)).toBe(false);
  });
});
