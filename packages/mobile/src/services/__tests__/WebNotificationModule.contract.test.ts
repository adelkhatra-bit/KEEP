import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');

describe('Web notification module isolation', () => {
  it.each(['pushNotificationService.ts', 'recognitionNotificationService.ts'])('%s never evaluates expo-notifications on web import', (name) => {
    const source = read(name);
    expect(source).not.toContain("import * as Notifications from 'expo-notifications'");
    expect(source).toContain("require('expo-notifications')");
    expect(source).toContain("Platform.OS === 'web'");
  });

  it('keeps web presentation owned by the single GlobalNotificationBanner realtime path', () => {
    const source = read('pushNotificationService.ts');
    expect(source).toContain("reason: 'web_in_app_banner_owned_by_global_notification_banner'");
    expect(source).not.toContain('startWebRealtimeNotificationBridge');
    expect(source).not.toContain('showWebKeepToast');
  });
});
