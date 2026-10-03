// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Loki Music push registration has no Render intermediary', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'pushNotificationService.ts'), 'utf8');
  it('registers the Expo device token directly through authenticated Supabase RPC', () => {
    expect(source).toContain("rpc('keep_push_token_register_v2'");
    expect(source).toContain('p_token: token');
    expect(source).toContain('p_platform: Platform.OS');
    expect(source).toContain('getExpoPushTokenAsync({ projectId })');
    expect(source).toContain('p_build_number: meta.buildNumber');
    expect(source).toContain('devicePushToken: nextToken');
    expect(source).toContain('expoProjectId()');
    expect(source).toContain('addPushTokenListener');
    expect(source).toContain('registerExpoTokenWithSupabase');
    expect(source).not.toContain('EXPO_PUBLIC_API_URL');
    expect(source).not.toContain('/api/notifications/push-token');
    expect(source).not.toContain('getSupabaseAccessToken');
  });
  it('can remove the current device token directly on logout', () => {
    expect(source).toContain('unregisterCurrentPushToken');
    expect(source).toContain("rpc('keep_push_token_unregister'");
  });
});
