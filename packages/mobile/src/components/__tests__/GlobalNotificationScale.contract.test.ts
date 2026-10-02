// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'GlobalNotificationBanner.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Global notification scalability', () => {
  it('does not poll battle decisions every sub-second for every connected user', () => {
    expect(source).not.toContain('BATTLE_DECISION_POLL_MS');
    expect(source).not.toContain('setInterval(tick, 800)');
    expect(source).not.toContain('setInterval(tick, BATTLE_DECISION_POLL_MS)');
  });

  it('refreshes battle server truth on mount, foreground and realtime notification', () => {
    expect(source).toContain('tick();');
    expect(source).toContain("AppState.addEventListener('change'");
    expect(source).toContain('subscribeToNotifications(user.id');
    expect(source).toContain('if (battleChallenge || battleRematch)');
    expect(source).toContain('void refreshBlockingBattleDecision();');
  });
});
