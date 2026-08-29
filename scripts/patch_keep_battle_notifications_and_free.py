from pathlib import Path
import re

# Notifications center: Battle invitation is informational only.
p = Path('packages/mobile/src/screens/NotificationsScreen.tsx')
s = p.read_text()
s = s.replace("import { respondBattleChallenge } from '../services/keepBattleLiveService';\n", '')
s = s.replace("  const [battleBusyId, setBattleBusyId] = useState<string | null>(null);\n", '')
s = re.sub(r"\n  const openBattle = \(arenaId\?: string \| null\) => \{.*?\n  \};\n\n  const answerBattleInvite = async \(item: KeepNotification, accept: boolean\) => \{.*?\n  \};\n", "\n", s, flags=re.S)
s = s.replace("onPress={() => { if (isBattleInvite(item)) openBattle(); else void readOne(item); }}", "onPress={() => { void readOne(item); }}")
s = re.sub(r"\n\s*\{isBattleInvite\(item\) \? <View style=\{styles\.battleActions\}>.*?</View> : null\}", "", s, flags=re.S)
p.write_text(s)

# Native push: keep wake-up notification, never attach ACCEPTER/REFUSER actions.
p = Path('packages/mobile/src/services/pushNotificationService.ts')
s = p.read_text()
s = s.replace("import { respondBattleChallenge } from './keepBattleLiveService';\n", '')
s = s.replace("const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE';\n", '')
s = s.replace("export const BATTLE_REFUSE_ACTION = 'KEEP_BATTLE_REFUSE';\n", '')
s = s.replace("export const BATTLE_ACCEPT_ACTION = 'KEEP_BATTLE_ACCEPT';\n", '')
s = s.replace("let battleTapSubscription: Notifications.EventSubscription | null = null;\n", '')
s = re.sub(r"\nfunction installBattleNotificationTapRouter\(\) \{.*?\n\}\n\ninstallBattleNotificationTapRouter\(\);\n", "\n", s, flags=re.S)
s = re.sub(r"\nasync function ensureBattleChallengeCategory\(\): Promise<void> \{.*?\n\}\n", "\n", s, flags=re.S)
s = s.replace("  await ensureBattleChallengeCategory().catch(() => {});\n", '')
p.write_text(s)

# Backend transport: plain push only, no interactive Battle category.
p = Path('packages/backend/src/lib/pushNotifications.ts')
s = p.read_text()
s = s.replace("const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE';\n", '')
s = s.replace("  const normalizedType = String(data?.type || data?.notificationType || '').toUpperCase();\n  const isBattleInvite = normalizedType === 'BATTLE_CHALLENGE' && String(data?.presentation || '') === 'battle_inline';\n", '')
s = s.replace("    ...(isBattleInvite ? { categoryId: BATTLE_CATEGORY } : {}),\n", '')
p.write_text(s)

# Profile notification badge: refresh on every INSERT/UPDATE/DELETE and on focus.
p = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
s = p.read_text()
s = s.replace("import { loadNotifications } from '../services/notificationService';", "import { loadUnreadNotificationCount, subscribeToNotificationChanges } from '../services/notificationService';")
old = """  useEffect(() => {
    let live = true;
    if (!user || accountRequired) {
      setUnreadCount(0);
      return () => { live = false; };
    }
    loadNotifications(user.id)
      .then((items) => live && setUnreadCount(items.filter((item) => !item.readAt).length))
      .catch(() => live && setUnreadCount(0));
    return () => { live = false; };
  }, [accountRequired, user?.id]);
"""
new = """  useEffect(() => {
    let live = true;
    if (!user || accountRequired) {
      setUnreadCount(0);
      return () => { live = false; };
    }
    const refreshUnread = () => {
      void loadUnreadNotificationCount(user.id)
        .then((count) => { if (live) setUnreadCount(count); })
        .catch(() => { if (live) setUnreadCount(0); });
    };
    refreshUnread();
    const unsubscribeChanges = subscribeToNotificationChanges(user.id, refreshUnread);
    const unsubscribeFocus = navigation?.addListener?.('focus', refreshUnread);
    return () => {
      live = false;
      unsubscribeChanges();
      unsubscribeFocus?.();
    };
  }, [accountRequired, navigation, user?.id]);
"""
if old not in s:
    raise SystemExit('Profile unread block not found')
s = s.replace(old, new)
p.write_text(s)

# Battle solo: start next round much sooner; loading happens immediately after the result card.
p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()
s = s.replace("const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 950);", "const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 360);")
s = s.replace("const id = setTimeout(() => { setSoloFinished(true); celebrate(); }, 950);", "const id = setTimeout(() => { setSoloFinished(true); celebrate(); }, 520);")
p.write_text(s)

# Regression contract.
p = Path('packages/mobile/src/screens/__tests__/BattleNotificationActions.contract.test.ts')
s = p.read_text()
for title in [
    'still supports the legacy notification route safely without making it the Battle entry point',
    'keeps native action buttons only for real incoming Battle wake-up pushes',
    'keeps the legacy notification screen safe if an old notification is opened',
]:
    s = re.sub(r"\n  it\('" + re.escape(title) + r"'.*?\n  \}\);", "", s, flags=re.S)
if "keeps Battle decision out of Notifications" not in s:
    insert = """
  it('keeps Battle decision out of Notifications and native push actions', () => {
    expect(notifications).not.toContain('respondBattleChallenge(challengeId, accept)');
    expect(notifications).not.toContain('accessibilityLabel=\"Refuser le Battle\"');
    expect(notifications).not.toContain('accessibilityLabel=\"Accepter le Battle\"');
    expect(push).not.toContain('KEEP_BATTLE_REFUSE');
    expect(push).not.toContain('KEEP_BATTLE_ACCEPT');
    expect(backendPush).not.toContain('categoryId: BATTLE_CATEGORY');
    expect(battle).toContain('void respond(incoming[0], false)');
    expect(battle).toContain('void respond(incoming[0], true)');
  });
"""
    idx = s.rfind('});')
    s = s[:idx] + insert + s[idx:]
p.write_text(s)

p = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
s = p.read_text()
if "advances solo rapidly after an answer" not in s:
    insert = """
  it('advances solo rapidly after an answer', () => {
    expect(source).toContain('setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 360)');
    expect(source).not.toContain('setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 950)');
  });
"""
    idx = s.rfind('});')
    s = s[:idx] + insert + s[idx:]
p.write_text(s)

# Dedicated badge regression test.
p = Path('packages/mobile/src/screens/__tests__/NotificationBadgeRealtime.contract.test.ts')
p.write_text("""// @ts-nocheck
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
""")
