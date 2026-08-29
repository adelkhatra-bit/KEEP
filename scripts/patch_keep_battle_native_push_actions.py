from pathlib import Path

# Native mobile: register an interactive Battle category and execute REFUSER / ACCEPTER.
p = Path('packages/mobile/src/services/pushNotificationService.ts')
s = p.read_text()

if "respondBattleChallenge" not in s:
    s = s.replace("import { getSupabaseAccessToken, supabase } from './supabaseClient';", "import { getSupabaseAccessToken, supabase } from './supabaseClient';\nimport { respondBattleChallenge } from './keepBattleLiveService';", 1)

s = s.replace("const TRACK_CATEGORY = 'KEEP_TRACK';", "const TRACK_CATEGORY = 'KEEP_TRACK';\nconst BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE';\nexport const BATTLE_REFUSE_ACTION = 'KEEP_BATTLE_REFUSE';\nexport const BATTLE_ACCEPT_ACTION = 'KEEP_BATTLE_ACCEPT';", 1)

old_listener = """  battleTapSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.actionIdentifier === TRACK_KEEP_ACTION || response.actionIdentifier === TRACK_PASS_ACTION) return;
    const content = response.notification.request.content;
    const data = (content.data || {}) as Record<string, unknown>;
    if (!battleLike(data.type, content.title, data)) return;
    void Linking.openURL('keep://notifications');
  });"""
new_listener = """  battleTapSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.actionIdentifier === TRACK_KEEP_ACTION || response.actionIdentifier === TRACK_PASS_ACTION) return;
    const content = response.notification.request.content;
    const data = (content.data || {}) as Record<string, unknown>;
    if (!battleLike(data.type, content.title, data)) return;
    const challengeId = String(data.challengeId || data.challenge_id || '');
    const action = response.actionIdentifier;
    if ((action === BATTLE_REFUSE_ACTION || action === BATTLE_ACCEPT_ACTION) && challengeId) {
      const accept = action === BATTLE_ACCEPT_ACTION;
      void respondBattleChallenge(challengeId, accept)
        .then(() => Linking.openURL('keep://notifications'))
        .catch(() => Linking.openURL('keep://notifications'));
      return;
    }
    void Linking.openURL('keep://notifications');
  });"""
if old_listener not in s:
    raise SystemExit('native Battle response listener anchor missing')
s = s.replace(old_listener, new_listener, 1)

anchor = """async function ensureDetectedTrackCategory(): Promise<void> {
"""
helper = """async function ensureBattleChallengeCategory(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync(BATTLE_CATEGORY, [
    {
      identifier: BATTLE_REFUSE_ACTION,
      buttonTitle: 'REFUSER',
      options: { opensAppToForeground: true, isAuthenticationRequired: false, isDestructive: true },
    },
    {
      identifier: BATTLE_ACCEPT_ACTION,
      buttonTitle: 'ACCEPTER',
      options: { opensAppToForeground: true, isAuthenticationRequired: false, isDestructive: false },
    },
  ]);
}

"""
if helper not in s:
    if anchor not in s:
        raise SystemExit('notification category anchor missing')
    s = s.replace(anchor, helper + anchor, 1)

old_ensure = """  await ensureDetectedTrackCategory().catch(() => {});

  if (Platform.OS === 'android') {"""
new_ensure = """  await ensureDetectedTrackCategory().catch(() => {});
  await ensureBattleChallengeCategory().catch(() => {});

  if (Platform.OS === 'android') {"""
if old_ensure not in s:
    raise SystemExit('push registration category anchor missing')
s = s.replace(old_ensure, new_ensure, 1)
p.write_text(s)

# Backend Expo Push payload: attach the same category only for Battle invitations.
p = Path('packages/backend/src/lib/pushNotifications.ts')
s = p.read_text()
if "BATTLE_CATEGORY" not in s:
    s = s.replace("const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';", "const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';\nconst BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE';", 1)

old = """  const messages = rows.map(({ token: to }) => ({
    to,
    title,
    body,
    data: data ?? {},
    sound: 'default',
    priority: 'high',
  }));"""
new = """  const normalizedType = String(data?.type || data?.notificationType || '').toUpperCase();
  const isBattleInvite = Boolean(data?.challengeId || data?.challenge_id)
    || ['BATTLE_CHALLENGE', 'KEEP_BATTLE_CHALLENGE', 'BATTLE_INVITE', 'KEEP_BATTLE_INVITE'].includes(normalizedType)
    || title.toUpperCase().includes('BATTLE');
  const messages = rows.map(({ token: to }) => ({
    to,
    title,
    body,
    data: data ?? {},
    sound: 'default',
    priority: 'high',
    ...(isBattleInvite ? { categoryId: BATTLE_CATEGORY } : {}),
  }));"""
if old not in s:
    raise SystemExit('Expo payload anchor missing')
s = s.replace(old, new, 1)
p.write_text(s)

# Contract test: prove native category + actions + backend categoryId are wired.
p = Path('packages/mobile/src/screens/__tests__/BattleNotificationActions.contract.test.ts')
s = p.read_text()
if "backendPush" not in s:
    s = s.replace("  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');", "  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');\n  const backendPush = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'lib', 'pushNotifications.ts'), 'utf8');", 1)

needle = """  it('routes native Battle notification taps into the notification action screen', () => {
"""
test = """  it('exposes REFUSER / ACCEPTER directly on native Battle push notifications', () => {
    expect(push).toContain("const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE'");
    expect(push).toContain("buttonTitle: 'REFUSER'");
    expect(push).toContain("buttonTitle: 'ACCEPTER'");
    expect(push).toContain('setNotificationCategoryAsync(BATTLE_CATEGORY');
    expect(push).toContain('respondBattleChallenge(challengeId, accept)');
    expect(backendPush).toContain("categoryId: BATTLE_CATEGORY");
    expect(backendPush).toContain("const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE'");
  });

"""
if test not in s:
    if needle not in s:
        raise SystemExit('Battle notification test anchor missing')
    s = s.replace(needle, test + needle, 1)
p.write_text(s)
