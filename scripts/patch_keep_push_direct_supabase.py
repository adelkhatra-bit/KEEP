from pathlib import Path

p = Path('packages/mobile/src/services/pushNotificationService.ts')
s = p.read_text()
s = s.replace("import { getSupabaseAccessToken, supabase } from './supabaseClient';", "import { supabase } from './supabaseClient';")
s = s.replace("const API_URL = process.env.EXPO_PUBLIC_API_URL;\n", "")
old = """  if (!API_URL) return { ok: false, reason: 'api_url_missing' };\n  const accessToken = await getSupabaseAccessToken();\n  if (!accessToken) return { ok: false, reason: 'not_logged_in' };\n\n  try {\n    const res = await fetch(`${API_URL}/api/notifications/push-token`, {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },\n      body: JSON.stringify({ token, platform: Platform.OS }),\n    });\n    if (!res.ok) return { ok: false, reason: `server_${res.status}` };\n    return { ok: true };\n  } catch {\n    return { ok: false, reason: 'network_error' };\n  }\n}"""
new = """  if (!supabase) return { ok: false, reason: 'supabase_not_configured' };\n\n  try {\n    const { data: sessionData } = await supabase.auth.getSession();\n    if (!sessionData.session?.user?.id) return { ok: false, reason: 'not_logged_in' };\n    const { error } = await supabase.rpc('keep_push_token_register', {\n      p_token: token,\n      p_platform: Platform.OS,\n    });\n    if (error) return { ok: false, reason: `supabase_${String(error.code || 'rpc_error')}` };\n    return { ok: true };\n  } catch {\n    return { ok: false, reason: 'network_error' };\n  }\n}\n\nexport async function unregisterCurrentPushToken(): Promise<void> {\n  if (Platform.OS === 'web' || !Device.isDevice || !supabase) return;\n  try {\n    const token = (await Notifications.getExpoPushTokenAsync()).data;\n    if (!token) return;\n    await supabase.rpc('keep_push_token_unregister', { p_token: token });\n  } catch {\n    // Best effort on logout; stale Expo tokens are also removed by receipt processing.\n  }\n}"""
if old not in s:
    raise SystemExit('push registration anchor missing')
s = s.replace(old, new, 1)
p.write_text(s)

# Add a focused source contract so this dependency cannot silently come back.
t = Path('packages/mobile/src/services/__tests__/pushNotificationService.directSupabase.test.ts')
t.parent.mkdir(parents=True, exist_ok=True)
t.write_text("""// @ts-nocheck\nimport fs from 'fs';\nimport path from 'path';\n\ndescribe('KEEP push registration has no Render intermediary', () => {\n  const source = fs.readFileSync(path.resolve(__dirname, '..', 'pushNotificationService.ts'), 'utf8');\n  it('registers the Expo device token directly through authenticated Supabase RPC', () => {\n    expect(source).toContain(\"rpc('keep_push_token_register'\");\n    expect(source).toContain('p_token: token');\n    expect(source).toContain('p_platform: Platform.OS');\n    expect(source).not.toContain('EXPO_PUBLIC_API_URL');\n    expect(source).not.toContain('/api/notifications/push-token');\n    expect(source).not.toContain('getSupabaseAccessToken');\n  });\n  it('can remove the current device token directly on logout', () => {\n    expect(source).toContain('unregisterCurrentPushToken');\n    expect(source).toContain(\"rpc('keep_push_token_unregister'\");\n  });\n});\n""")
