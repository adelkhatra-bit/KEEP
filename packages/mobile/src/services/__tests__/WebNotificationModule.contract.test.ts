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

  it('keeps the web push path on Supabase Realtime without native notification APIs', () => {
    const source = read('pushNotificationService.ts');
    expect(source).toContain('startWebRealtimeNotificationBridge');
    expect(source).toContain("reason: realtime ? 'web_realtime_enabled' : 'web_realtime_unavailable'");
  });
});
