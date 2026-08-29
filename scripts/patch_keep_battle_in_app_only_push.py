from pathlib import Path

p = Path('packages/backend/src/lib/pushNotifications.ts')
s = p.read_text()
s = s.replace("const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE';\n", "")
old = """  const normalizedType = String(data?.type || data?.notificationType || '').toUpperCase();
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
new = """  const messages = rows.map(({ token: to }) => ({
    to,
    title,
    body,
    data: data ?? {},
    sound: 'default',
    priority: 'high',
  }));"""
if old not in s:
    raise SystemExit('Battle push category block not found')
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('packages/mobile/src/screens/__tests__/BattleNotificationActions.contract.test.ts')
s = p.read_text()
marker = "    expect(push).not.toContain(\".then(() => Linking.openURL('keep://notifications'))\");\n"
replacement = marker + "    expect(backendPush).not.toContain('categoryId: BATTLE_CATEGORY');\n    expect(backendPush).not.toContain(\"const BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE'\");\n"
if "backendPush).not.toContain('categoryId: BATTLE_CATEGORY')" not in s:
    s = s.replace("  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');\n", "  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');\n  const backendPush = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'src', 'lib', 'pushNotifications.ts'), 'utf8');\n", 1)
    s = s.replace(marker, replacement, 1)
p.write_text(s)
