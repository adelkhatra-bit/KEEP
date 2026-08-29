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

# Native push: keep the wake-up notification, but never attach ACCEPTER/REFUSER actions.
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

# Lock regression contract to the intended UX.
p = Path('packages/mobile/src/screens/__tests__/BattleNotificationActions.contract.test.ts')
s = p.read_text()
s = re.sub(r"\n  it\('still supports the legacy notification route safely without making it the Battle entry point'.*?\n  \}\);", "", s, flags=re.S)
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
