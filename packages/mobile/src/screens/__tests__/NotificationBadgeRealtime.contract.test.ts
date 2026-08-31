// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('notification badge realtime contract', () => {
  const profile = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'notificationService.ts'), 'utf8');

  it('recomputes the bell count after notification insert update delete', () => {
    expect(service).toContain("event: '*'");
    expect(service).toContain('subscribeToNotificationChanges');
    expect(profile).toContain('loadUnreadNotificationCount');
    expect(profile).toContain('subscribeToNotificationChanges(user.id, refreshUnread)');
    expect(profile).toContain("navigation?.addListener?.('focus', refreshUnread)");
  });
});
