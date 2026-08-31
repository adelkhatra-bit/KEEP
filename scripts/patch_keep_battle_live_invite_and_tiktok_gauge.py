from pathlib import Path

# 1) Battle screen must keep polling incoming/outgoing challenges anywhere inside Battle,
# not only while solo/browse flags happen to be true.
p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()
s = s.replace("if (!enabled || (!solo && !browseOnline)) return;", "if (!enabled || arena) return;", 1)
s = s.replace("if (!enabled || (!solo && !browseOnline) || arena) return undefined;", "if (!enabled || arena) return undefined;", 1)

# When the user is browsing players, show the exact same in-app invitation instead of
# forcing them out to Notifications.
old_browse = """  if (browseOnline) {\n    return <View style={s.root}><View style={s.header}>"""
new_browse = """  if (browseOnline) {\n    const browseChallengeRemaining = incoming[0] ? Math.max(0, Math.ceil((new Date(incoming[0].expiresAt).getTime() - now) / 1000)) : 0;\n    return <View style={s.root}><View style={s.header}>"""
if old_browse not in s:
    raise SystemExit('browse anchor missing')
s = s.replace(old_browse, new_browse, 1)
anchor = """</View><Text style={s.browseText}>Choisis d’abord le style du match. Le joueur invité verra ce style avant d’accepter ou refuser.</Text>"""
insert = """</View>{incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteLine}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={24} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {browseChallengeRemaining}s</Text></View><TouchableOpacity style={s.no} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity style={s.yes} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>ACCEPTER</Text></TouchableOpacity></View></Animated.View> : null}<Text style={s.browseText}>Choisis d’abord le style du match. Le joueur invité verra ce style avant d’accepter ou refuser.</Text>"""
if anchor not in s:
    raise SystemExit('browse invitation insertion anchor missing')
s = s.replace(anchor, insert, 1)

# TikTok LIVE Match inspiration: in 1v1 the gauge names the actual two players,
# shows the live scores on each side and keeps one central pressure bar.
old_duel = """{first && second ? <View style={s.duel}><View style={s.duelNames}><Text style={s.duelName}>ÉQUIPE A · {teamA.length}</Text><Text style={s.duelScore}>{teamAScore} — {teamBScore}</Text><Text style={[s.duelName, { textAlign: 'right' }]}>ÉQUIPE B · {teamB.length}</Text></View><View style={s.power}><View style={[s.powerLeft, { width: `${leftShare}%` }]} /><View style={s.powerMiddle} /><View style={s.powerRight} /></View><View style={s.teamMembers}>{players.map((player, index) => <TouchableOpacity key={player.profileId} style={s.teamChip} onPress={() => onOpenProfile(player.username)}><Text style={s.teamChipText}>{index % 2 === 0 ? 'A' : 'B'} · @{player.username}</Text></TouchableOpacity>)}</View></View> : null}"""
new_duel = """{first && second ? <View style={s.duel}><View style={s.duelNames}><TouchableOpacity style={{ flex: 1 }} onPress={() => players.length === 2 && onOpenProfile(first.username)}><Text style={s.duelName}>{players.length === 2 ? `@${first.username}` : `ÉQUIPE A · ${teamA.length}`}</Text><Text style={s.duelPoints}>{teamAScore} pts</Text></TouchableOpacity><View style={s.duelCenter}><Text style={s.duelScore}>VS</Text><Text style={s.duelTimer}>{arena.status === 'ACTIVE' ? `${Math.ceil(left / 1000)}s` : 'PRÊT'}</Text></View><TouchableOpacity style={{ flex: 1 }} onPress={() => players.length === 2 && onOpenProfile(second.username)}><Text style={[s.duelName, { textAlign: 'right' }]}>{players.length === 2 ? `@${second.username}` : `ÉQUIPE B · ${teamB.length}`}</Text><Text style={[s.duelPoints, { textAlign: 'right' }]}>{teamBScore} pts</Text></TouchableOpacity></View><View style={s.power}><View style={[s.powerLeft, { width: `${leftShare}%` }]} /><View style={s.powerMiddle} /><View style={s.powerRight} /></View>{players.length > 2 ? <View style={s.teamMembers}>{players.map((player, index) => <TouchableOpacity key={player.profileId} style={s.teamChip} onPress={() => onOpenProfile(player.username)}><Text style={s.teamChipText}>{index % 2 === 0 ? 'A' : 'B'} · @{player.username}</Text></TouchableOpacity>)}</View> : null}</View> : null}"""
if old_duel not in s:
    raise SystemExit('duel gauge anchor missing')
s = s.replace(old_duel, new_duel, 1)
style_anchor = "duelScore: { color: '#E5F266', fontSize: 12, fontWeight: '900' },"
style_repl = "duelScore: { color: '#E5F266', fontSize: 12, fontWeight: '900' }, duelCenter: { minWidth: 46, alignItems: 'center', justifyContent: 'center' }, duelTimer: { color: '#FFF', fontSize: 9, fontWeight: '900', marginTop: 1 }, duelPoints: { color: '#FFF', fontSize: 10, fontWeight: '900', marginTop: 2 },"
if style_anchor not in s:
    raise SystemExit('duel style anchor missing')
s = s.replace(style_anchor, style_repl, 1)
p.write_text(s)

# 2) Native/web push: Battle invite remains a wake-up when the app is backgrounded,
# but is silent in foreground because the card itself is the UI.
p = Path('packages/mobile/src/services/pushNotificationService.ts')
s = p.read_text()
old_handler = """Notifications.setNotificationHandler({\n  handleNotification: async () => ({\n    shouldShowAlert: true,\n    shouldPlaySound: true,\n    shouldSetBadge: true,\n    shouldShowBanner: true,\n    shouldShowList: true,\n  }),\n});"""
new_handler = """Notifications.setNotificationHandler({\n  handleNotification: async (notification) => {\n    const content = notification.request.content;\n    const data = (content.data || {}) as Record<string, unknown>;\n    const inlineBattle = battleLike(data.type, content.title, data) && String(data.presentation || '') === 'battle_inline';\n    return {\n      shouldShowAlert: !inlineBattle,\n      shouldPlaySound: !inlineBattle,\n      shouldSetBadge: !inlineBattle,\n      shouldShowBanner: !inlineBattle,\n      shouldShowList: !inlineBattle,\n    };\n  },\n});"""
if old_handler not in s:
    raise SystemExit('notification handler anchor missing')
s = s.replace(old_handler, new_handler, 1)
# A normal tap on a Battle push should simply foreground KEEP; never bounce to Notifications/home.
s = s.replace("    void Linking.openURL('keep://notifications');\n", "    return;\n", 1)
s = s.replace("    if (battleLike(data.type, content.title, data)) void Linking.openURL('keep://notifications');", "    if (battleLike(data.type, content.title, data)) return;", 1)
# Web foreground must also use the in-card Battle invite, not a top toast.
web_anchor = """        const row = (payload as any)?.new ?? {};\n        const title = String(row.title || 'Nouveau sur KEEP');"""
web_repl = """        const row = (payload as any)?.new ?? {};\n        if (String(row?.data?.presentation || '') === 'battle_inline') return;\n        const title = String(row.title || 'Nouveau sur KEEP');"""
if web_anchor not in s:
    raise SystemExit('web notification bridge anchor missing')
s = s.replace(web_anchor, web_repl, 1)
p.write_text(s)

# 3) Backend push restores action buttons only for actual incoming Battle challenge rows.
p = Path('packages/backend/src/lib/pushNotifications.ts')
s = p.read_text()
s = s.replace("const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';\n", "const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';\nconst BATTLE_CATEGORY = 'KEEP_BATTLE_CHALLENGE';\n", 1)
old_messages = """  const messages = rows.map(({ token: to }) => ({\n    to,\n    title,\n    body,\n    data: data ?? {},\n    sound: 'default',\n    priority: 'high',\n  }));"""
new_messages = """  const normalizedType = String(data?.type || data?.notificationType || '').toUpperCase();\n  const isBattleInvite = normalizedType === 'BATTLE_CHALLENGE' && String(data?.presentation || '') === 'battle_inline';\n  const messages = rows.map(({ token: to }) => ({\n    to,\n    title,\n    body,\n    data: data ?? {},\n    sound: 'default',\n    priority: 'high',\n    ...(isBattleInvite ? { categoryId: BATTLE_CATEGORY } : {}),\n  }));"""
if old_messages not in s:
    raise SystemExit('backend push anchor missing')
s = s.replace(old_messages, new_messages, 1)
p.write_text(s)

# 4) Tests: lock the regression and the TikTok-style one-bar 1v1 presentation.
p = Path('packages/mobile/src/screens/__tests__/BattleNotificationActions.contract.test.ts')
s = p.read_text()
if "suppresses foreground Battle push" not in s:
    s += """\n\ndescribe('Battle foreground invitation regression', () => {\n  it('suppresses foreground Battle push and keeps the player in place', () => {\n    const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');\n    expect(push).toContain("String(data.presentation || '') === 'battle_inline'");\n    expect(push).toContain('shouldShowBanner: !inlineBattle');\n    expect(push).not.toContain("void Linking.openURL('keep://notifications')");\n  });\n\n  it('renders the 1v1 gauge with real player names, points and one central bar', () => {\n    const battle = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');\n    expect(battle).toContain('players.length === 2 ? `@${first.username}`');\n    expect(battle).toContain('{teamAScore} pts');\n    expect(battle).toContain('{teamBScore} pts');\n    expect(battle).toContain('style={[s.powerLeft, { width: `${leftShare}%` }]}');\n  });\n});\n"""
p.write_text(s)
