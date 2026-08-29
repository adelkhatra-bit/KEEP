from pathlib import Path

# Native mobile: register an interactive Battle category and execute REFUSER / ACCEPTER.
p = Path('packages/mobile/src/services/pushNotificationService.ts')
s = p.read_text()

if "respondBattleChallenge" not in s:
    s = s.replace("import { getSupabaseAccessToken, supabase } from './supabaseClient';", "import { getSupabaseAccessToken, supabase } from './supabaseClient';\nimport { respondBattleChallenge } from './keepBattleLiveService';", 1)

if "const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE';" not in s:
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
if old_listener in s:
    s = s.replace(old_listener, new_listener, 1)
elif "respondBattleChallenge(challengeId, accept)" not in s:
    raise SystemExit('native Battle response listener anchor missing')

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
if "ensureBattleChallengeCategory" not in s:
    if anchor not in s:
        raise SystemExit('notification category anchor missing')
    s = s.replace(anchor, helper + anchor, 1)

old_ensure = """  await ensureDetectedTrackCategory().catch(() => {});

  if (Platform.OS === 'android') {"""
new_ensure = """  await ensureDetectedTrackCategory().catch(() => {});
  await ensureBattleChallengeCategory().catch(() => {});

  if (Platform.OS === 'android') {"""
if "await ensureBattleChallengeCategory().catch(() => {});" not in s:
    if old_ensure not in s:
        raise SystemExit('push registration category anchor missing')
    s = s.replace(old_ensure, new_ensure, 1)
p.write_text(s)

# Backend Expo Push payload: attach the same category only for Battle invitations.
p = Path('packages/backend/src/lib/pushNotifications.ts')
s = p.read_text()
if "const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE';" not in s:
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
if "categoryId: BATTLE_CATEGORY" not in s:
    if old not in s:
        raise SystemExit('Expo payload anchor missing')
    s = s.replace(old, new, 1)
p.write_text(s)

# Battle card: invitation compactly embedded immediately below "Qui chante ?".
p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()
old_invite = """        {incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteTop}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={34} /><View style={{ flex: 1 }}><Text style={s.inviteLabel}>⚡ BATTLE · {themeLabel(incoming[0].themeCode)} · {challengeRemaining}s</Text><TouchableOpacity onPress={() => onOpenProfile(incoming[0].username)}><Text style={s.inviteName}>@{incoming[0].username}</Text></TouchableOpacity><Text style={s.inviteQuestion}>Style proposé : {themeLabel(incoming[0].themeCode)}. Accepter ce match ?</Text></View></View><View style={s.inviteActions}><TouchableOpacity style={s.no} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity style={s.yes} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>ACCEPTER</Text></TouchableOpacity></View></Animated.View> : null}"""
new_invite = """        {incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteLine}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={24} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {challengeRemaining}s</Text></View><TouchableOpacity style={s.no} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity style={s.yes} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>ACCEPTER</Text></TouchableOpacity></View></Animated.View> : null}"""
if old_invite in s:
    s = s.replace(old_invite, new_invite, 1)
elif "souhaite faire un Battle avec vous. Acceptez-vous ?" not in s:
    raise SystemExit('compact inline Battle invite anchor missing')

old_styles = """invite: { marginTop: 6, padding: 8, borderRadius: 14, backgroundColor: '#241730', borderWidth: 1.5, borderColor: '#E5F266' }, inviteTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, inviteLabel: { color: '#E5F266', fontSize: 8, fontWeight: '900' }, inviteName: { color: '#FFF', fontSize: 12, fontWeight: '900' }, inviteQuestion: { color: '#F3EDF7', fontSize: 9, lineHeight: 12, fontWeight: '800', marginTop: 1 }, inviteActions: { flexDirection: 'row', gap: 6, marginTop: 6 }, no: { flex: 1, minHeight: 32, borderRadius: 16, borderWidth: 1, borderColor: '#4B3C57', alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 9, fontWeight: '900' }, yes: { flex: 1, minHeight: 32, borderRadius: 16, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#17130B', fontSize: 9, fontWeight: '900' }"""
new_styles = """invite: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 11, backgroundColor: '#241730', borderWidth: 1, borderColor: '#E5F266' }, inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 5 }, inviteLabel: { color: '#E5F266', fontSize: 7, fontWeight: '900', marginTop: 1 }, inviteName: { color: '#FFF', fontSize: 9, fontWeight: '900' }, inviteQuestion: { color: '#F3EDF7', fontSize: 8, lineHeight: 10, fontWeight: '800' }, no: { minHeight: 26, paddingHorizontal: 7, borderRadius: 13, borderWidth: 1, borderColor: '#4B3C57', alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 7, fontWeight: '900' }, yes: { minHeight: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#17130B', fontSize: 7, fontWeight: '900' }"""
if old_styles in s:
    s = s.replace(old_styles, new_styles, 1)
elif "inviteLine: { flexDirection: 'row'" not in s:
    raise SystemExit('compact Battle invite styles anchor missing')
p.write_text(s)

# Contract test: prove native category + actions + backend categoryId + compact inline card.
p = Path('packages/mobile/src/screens/__tests__/BattleNotificationActions.contract.test.ts')
s = p.read_text()
if "backendPush" not in s:
    s = s.replace("  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');", "  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');\n  const backendPush = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'src', 'lib', 'pushNotifications.ts'), 'utf8');", 1)
else:
    s = s.replace("path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'lib', 'pushNotifications.ts')", "path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'src', 'lib', 'pushNotifications.ts')")

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

  it('keeps the incoming challenge compact directly under Qui chante', () => {
    const question = battle.indexOf("<Text style={s.question}>Qui chante ?</Text>");
    const invite = battle.indexOf('souhaite faire un Battle avec vous. Acceptez-vous ?');
    const answers = battle.indexOf('<View style={s.answers}>');
    expect(question).toBeGreaterThan(-1);
    expect(invite).toBeGreaterThan(question);
    expect(answers).toBeGreaterThan(invite);
    expect(battle).toContain("size={24}");
    expect(battle).toContain("<Text style={s.noText}>REFUSER</Text>");
    expect(battle).toContain("<Text style={s.yesText}>ACCEPTER</Text>");
  });

"""
if "keeps the incoming challenge compact directly under Qui chante" not in s:
    if needle not in s:
        raise SystemExit('Battle notification test anchor missing')
    s = s.replace(needle, test + needle, 1)
p.write_text(s)
