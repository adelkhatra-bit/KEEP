from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

# Retry arena read after an accepted RPC so a transient mobile/network read cannot leave the user stuck.
anchor = """  const respond = async (item: KeepBattleIncomingChallenge, accept: boolean) => {\n"""
helper = """  const loadArenaAfterAccept = async (arenaId: string) => {\n    let lastError: unknown = null;\n    for (let attempt = 0; attempt < 5; attempt += 1) {\n      try { return await loadKeepBattleArena(arenaId); }\n      catch (error) { lastError = error; await wait(180 + attempt * 140); }\n    }\n    throw lastError || new Error('BATTLE_ARENA_LOAD_FAILED');\n  };\n\n  const respond = async (item: KeepBattleIncomingChallenge, accept: boolean) => {\n"""
if anchor not in s:
    raise SystemExit('respond anchor missing')
s = s.replace(anchor, helper, 1)

old = """    setRespondingChallengeId(item.id);\n    setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n    try {\n      const response = await respondBattleChallenge(item.id, accept);\n      if (accept && response.arenaId) {\n        await stopTrackPreview();\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setBrowseOnline(false); setAudioReady(false);\n        setArena(await loadKeepBattleArena(response.arenaId));\n        animateVersus();\n      }\n"""
new = """    setRespondingChallengeId(item.id);\n    if (!accept) setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n    try {\n      const response = await respondBattleChallenge(item.id, accept);\n      if (accept && response.arenaId) {\n        await stopTrackPreview();\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setBrowseOnline(false); setAudioReady(false);\n        const loadedArena = await loadArenaAfterAccept(response.arenaId);\n        setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n        setArena(loadedArena);\n        animateVersus();\n      }\n"""
if old not in s:
    raise SystemExit('respond body anchor missing')
s = s.replace(old, new, 1)

old_invite = """{incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteLine}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={32} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {challengeRemaining}s</Text></View><TouchableOpacity hitSlop={4} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity hitSlop={4} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? '…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}"""
new_invite = """{incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteHead}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={38} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {challengeRemaining}s</Text></View></View><View style={s.inviteActions}><TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Refuser le Battle\" hitSlop={6} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Accepter le Battle\" hitSlop={6} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity></View></Animated.View> : null}"""
if old_invite not in s:
    raise SystemExit('solo invite anchor missing')
s = s.replace(old_invite, new_invite, 1)

old_browse = old_invite.replace('challengeRemaining', 'browseChallengeRemaining')
new_browse = new_invite.replace('challengeRemaining', 'browseChallengeRemaining')
if old_browse not in s:
    raise SystemExit('browse invite anchor missing')
s = s.replace(old_browse, new_browse, 1)

old_styles = """invite: { marginTop: 7, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 15, backgroundColor: '#241730', borderWidth: 1, borderColor: '#E5F266' }, inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 9 }, inviteLabel: { color: '#E5F266', fontSize: 12, lineHeight: 16, fontWeight: '900', marginTop: 3 }, inviteName: { color: '#FFF', fontSize: 13, fontWeight: '900' }, inviteQuestion: { color: '#F3EDF7', fontSize: 12, lineHeight: 16, fontWeight: '800' }, no: { minHeight: 48, minWidth: 84, paddingHorizontal: 12, borderRadius: 24, borderWidth: 1, borderColor: '#4B3C57', alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 12, fontWeight: '900' }, yes: { minHeight: 48, minWidth: 92, paddingHorizontal: 12, borderRadius: 24, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#17130B', fontSize: 12, fontWeight: '900' }, actionDisabled: { opacity: .55 },"""
new_styles = """invite: { marginTop: 7, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 18, backgroundColor: '#241730', borderWidth: 2, borderColor: '#E5F266' }, inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, inviteActions: { flexDirection: 'row', gap: 10, marginTop: 10 }, inviteLabel: { color: '#E5F266', fontSize: 12, lineHeight: 16, fontWeight: '900', marginTop: 3 }, inviteName: { color: '#FFF', fontSize: 15, fontWeight: '900' }, inviteQuestion: { color: '#F3EDF7', fontSize: 14, lineHeight: 19, fontWeight: '800' }, no: { flex: 1, minHeight: 52, paddingHorizontal: 12, borderRadius: 18, borderWidth: 2, borderColor: '#8D769F', alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 14, fontWeight: '900' }, yes: { flex: 1, minHeight: 52, paddingHorizontal: 12, borderRadius: 18, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#17130B', fontSize: 14, fontWeight: '900' }, actionDisabled: { opacity: .62 },"""
if old_styles not in s:
    raise SystemExit('invite style anchor missing')
s = s.replace(old_styles, new_styles, 1)

p.write_text(s)
