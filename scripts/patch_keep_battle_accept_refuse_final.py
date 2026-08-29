from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

# 1. Retry arena reads after ACCEPTED: creation and first client read can race.
anchor = """  const shareArenaInvite = React.useCallback(async (state: KeepBattleArenaState) => {\n    const link = buildKeepBattleArenaInviteLink(state.arenaCode);\n    await Share.share({ message: `Rejoins notre KEEP Battle ⚡\\n${state.seats.length} joueur${state.seats.length > 1 ? 's' : ''} déjà dans le groupe\\n${link}` });\n  }, []);\n"""
if 'const loadArenaWithRetry = React.useCallback' not in s:
    if anchor not in s:
        raise SystemExit('shareArenaInvite anchor missing')
    s = s.replace(anchor, anchor + """\n  const loadArenaWithRetry = React.useCallback(async (arenaId: string): Promise<KeepBattleArenaState> => {\n    let lastError: unknown = null;\n    for (let attempt = 0; attempt < 8; attempt += 1) {\n      try {\n        return await loadKeepBattleArena(arenaId);\n      } catch (error) {\n        lastError = error;\n        await wait(140 + attempt * 120);\n      }\n    }\n    throw lastError instanceof Error ? lastError : new Error('BATTLE_ARENA_LOAD_FAILED');\n  }, []);\n""", 1)

s = s.replace('setArena(await loadKeepBattleArena(accepted.arenaId));', 'setArena(await loadArenaWithRetry(accepted.arenaId));')
s = s.replace('setArena(await loadKeepBattleArena(response.arenaId));', 'setArena(await loadArenaWithRetry(response.arenaId));')

# 2. While a response is in flight, polling must never reinsert the same invite.
s = s.replace('setIncoming(inbox);', 'setIncoming(inbox.filter((x) => x.id !== respondingChallengeId));', 1)
old_dep = '}, [enabled, solo, browseOnline, handledOutgoingId, animateVersus, shareInvite]);'
new_dep = '}, [enabled, solo, browseOnline, handledOutgoingId, respondingChallengeId, animateVersus, shareInvite, loadArenaWithRetry]);'
if old_dep in s:
    s = s.replace(old_dep, new_dep, 1)
elif new_dep not in s:
    raise SystemExit('refreshSocial dependency anchor missing')

# 3. ACCEPT immediately stops current preview, REFUSE leaves the paused solo state intact.
old_respond = """    try {\n      const response = await respondBattleChallenge(item.id, accept);\n      if (accept && response.arenaId) {\n        await stopTrackPreview();\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setBrowseOnline(false); setAudioReady(false);\n        setArena(await loadArenaWithRetry(response.arenaId));\n        animateVersus();\n      }\n"""
new_respond = """    try {\n      if (accept) {\n        await stopTrackPreview();\n        setAudioReady(false);\n      }\n      const response = await respondBattleChallenge(item.id, accept);\n      if (accept && response.arenaId) {\n        const loadedArena = await loadArenaWithRetry(response.arenaId);\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setBrowseOnline(false); setPausedSoloRemaining(null); setAudioReady(false);\n        setArena(loadedArena);\n        animateVersus();\n      }\n"""
if old_respond in s:
    s = s.replace(old_respond, new_respond, 1)
elif 'const loadedArena = await loadArenaWithRetry(response.arenaId);' not in s:
    raise SystemExit('respond accept anchor missing')

# 4. One reusable, accessible invite card: text first, 50pt actions beneath it.
avatar = """  const Avatar = ({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) => url\n    ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />\n    : <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}><Text style={s.avatarLetter}>{initial(name)}</Text></View>;\n"""
if 'const renderBattleInvite =' not in s:
    if avatar not in s:
        raise SystemExit('Avatar anchor missing')
    helper = avatar + """\n  const renderBattleInvite = (item: KeepBattleIncomingChallenge, seconds: number) => (\n    <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}>\n      <View style={s.inviteHeader}>\n        <Avatar name={item.username} url={item.avatarUrl} size={38} />\n        <View style={{ flex: 1 }}>\n          <Text style={s.inviteQuestion}><Text style={s.inviteName}>@{item.username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text>\n          <Text style={s.inviteLabel}>⚡ {themeLabel(item.themeCode)} · {seconds}s</Text>\n        </View>\n      </View>\n      <View style={s.inviteActions}>\n        <TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Refuser le Battle\" hitSlop={8} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(item, false); }}>\n          <Text style={s.noText}>{respondingChallengeId === item.id ? '…' : 'REFUSER'}</Text>\n        </TouchableOpacity>\n        <TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Accepter le Battle\" hitSlop={8} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(item, true); }}>\n          <Text style={s.yesText}>{respondingChallengeId === item.id ? '…' : 'ACCEPTER'}</Text>\n        </TouchableOpacity>\n      </View>\n    </Animated.View>\n  );\n"""
    s = s.replace(avatar, helper, 1)

# Replace both old inline cards exactly.
old_solo = """{incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteLine}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={32} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {challengeRemaining}s</Text></View><TouchableOpacity hitSlop={4} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity hitSlop={4} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? '…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}"""
old_browse = old_solo.replace('challengeRemaining', 'browseChallengeRemaining')
s = s.replace(old_solo, '{incoming[0] ? renderBattleInvite(incoming[0], challengeRemaining) : null}', 1)
s = s.replace(old_browse, '{incoming[0] ? renderBattleInvite(incoming[0], browseChallengeRemaining) : null}', 1)

# 5. Mobile sizing: 50px controls, 12-14px labels, clear spacing on 390 width.
style_repls = {
"invite: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 14, backgroundColor: '#241730', borderWidth: 1, borderColor: '#E5F266' }": "invite: { marginTop: 7, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 16, backgroundColor: '#241730', borderWidth: 2, borderColor: '#E5F266' }",
"inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 7 }": "inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, inviteActions: { flexDirection: 'row', gap: 8, marginTop: 9 }",
"inviteLabel: { color: '#E5F266', fontSize: 9, fontWeight: '900', marginTop: 2 }": "inviteLabel: { color: '#E5F266', fontSize: 11, lineHeight: 14, fontWeight: '900', marginTop: 3 }",
"inviteName: { color: '#FFF', fontSize: 12, fontWeight: '900' }": "inviteName: { color: '#FFF', fontSize: 14, fontWeight: '900' }",
"inviteQuestion: { color: '#F3EDF7', fontSize: 11, lineHeight: 14, fontWeight: '800' }": "inviteQuestion: { color: '#F3EDF7', fontSize: 13, lineHeight: 17, fontWeight: '800' }",
"no: { minHeight: 44, minWidth: 76, paddingHorizontal: 10, borderRadius: 22, borderWidth: 1, borderColor: '#4B3C57', alignItems: 'center', justifyContent: 'center' }": "no: { flex: 1, minHeight: 50, paddingHorizontal: 12, borderRadius: 25, borderWidth: 2, borderColor: '#6D5B7B', alignItems: 'center', justifyContent: 'center' }",
"noText: { color: '#FFF', fontSize: 10, fontWeight: '900' }": "noText: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: .3 }",
"yes: { minHeight: 44, minWidth: 76, paddingHorizontal: 10, borderRadius: 22, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }": "yes: { flex: 1, minHeight: 50, paddingHorizontal: 12, borderRadius: 25, borderWidth: 2, borderColor: '#F4FF82', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }",
"yesText: { color: '#17130B', fontSize: 10, fontWeight: '900' }": "yesText: { color: '#17130B', fontSize: 12, fontWeight: '900', letterSpacing: .3 }",
}
for old, new in style_repls.items():
    if old in s:
        s = s.replace(old, new, 1)

# Some branch revisions already use 11/12 fonts; enforce final values by style key if still old.
s = s.replace("inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },", "inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, inviteActions: { flexDirection: 'row', gap: 8, marginTop: 9 },")

# Contract markers.
required = [
    'const loadArenaWithRetry = React.useCallback',
    'inbox.filter((x) => x.id !== respondingChallengeId)',
    'const loadedArena = await loadArenaWithRetry(response.arenaId)',
    'finally {\n      setRespondingChallengeId(null);',
    'accessibilityLabel="Refuser le Battle"',
    'accessibilityLabel="Accepter le Battle"',
    'minHeight: 50',
    'inviteActions:',
]
for marker in required:
    if marker not in s:
        raise SystemExit(f'missing final marker: {marker}')

p.write_text(s)
