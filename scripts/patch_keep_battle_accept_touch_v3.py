from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

old = """  const respond = async (item: KeepBattleIncomingChallenge, accept: boolean) => {\n    if (respondingChallengeId) return;\n    setRespondingChallengeId(item.id);\n    if (!accept) setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n    try {\n      const response = await respondBattleChallenge(item.id, accept);\n      if (accept && response.arenaId) {\n        await stopTrackPreview();\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setBrowseOnline(false); setAudioReady(false);\n        const loadedArena = response.arenaState || await loadArenaAfterAccept(response.arenaId);\n        setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n        setArena(loadedArena);\n        animateVersus();\n      }\n    } catch (e: any) {\n"""
new = """  const respond = async (item: KeepBattleIncomingChallenge, accept: boolean) => {\n    if (respondingChallengeId) return;\n    setRespondingChallengeId(item.id);\n    if (accept) {\n      setAudioReady(false);\n      void stopTrackPreview();\n    } else {\n      setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n    }\n    try {\n      const response = await respondBattleChallenge(item.id, accept);\n      if (accept) {\n        if (!response.arenaId) throw new Error('BATTLE_ACCEPTED_WITHOUT_ARENA');\n        await stopTrackPreview();\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setBrowseOnline(false); setAudioReady(false);\n        const loadedArena = response.arenaState || await loadArenaAfterAccept(response.arenaId);\n        setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n        setArena(loadedArena);\n        animateVersus();\n      }\n    } catch (e: any) {\n"""
if old not in s:
    raise SystemExit('respond anchor missing')
s = s.replace(old, new, 1)

# Make both copies of the inline invitation readable/tappable on a 390pt-wide phone.
s = s.replace('url={incoming[0].avatarUrl} size={44} />', 'url={incoming[0].avatarUrl} size={48} />')

# Give an explicit visual acknowledgement while ACCEPTER is travelling to Supabase.
needle = """</View><View style={s.inviteActions}><TouchableOpacity accessibilityRole=\"button\""""
repl = """</View>{respondingChallengeId === incoming[0].id ? <Text style={s.inviteConnecting}>CONNEXION AU BATTLE…</Text> : null}<View style={s.inviteActions}><TouchableOpacity accessibilityRole=\"button\""""
if needle not in s:
    raise SystemExit('solo invite actions anchor missing')
s = s.replace(needle, repl, 1)
# browse invitation has the same structure; patch the remaining occurrence as well.
if needle in s:
    s = s.replace(needle, repl, 1)

old_styles = """invite: { marginTop: 9, minHeight: 118, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 22, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#1B1222', justifyContent: 'center' }, inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 }, inviteActions: { flexDirection: 'row', gap: 10, width: '100%' }, inviteLabel: { color: '#E5F266', fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 4 }, inviteName: { color: '#FFF', fontSize: 16, lineHeight: 20, fontWeight: '900' }, inviteQuestion: { color: '#F3EDF7', fontSize: 15, lineHeight: 20, fontWeight: '800' }, no: { flex: 1, minHeight: 56, paddingHorizontal: 14, borderRadius: 28, borderWidth: 2, borderColor: '#75627F', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 14, fontWeight: '900' }, yes: { flex: 1, minHeight: 56, paddingHorizontal: 14, borderRadius: 28, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#17130B', fontSize: 14, fontWeight: '900' }, actionDisabled: { opacity: .62 },"""
new_styles = """invite: { marginTop: 10, minHeight: 142, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 24, borderWidth: 3, borderColor: '#E5F266', backgroundColor: '#1B1222', justifyContent: 'center' }, inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }, inviteActions: { flexDirection: 'row', gap: 12, width: '100%' }, inviteLabel: { color: '#E5F266', fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 4 }, inviteName: { color: '#FFF', fontSize: 17, lineHeight: 22, fontWeight: '900' }, inviteQuestion: { color: '#F3EDF7', fontSize: 16, lineHeight: 22, fontWeight: '800' }, inviteConnecting: { color: '#E5F266', fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: .5 }, no: { flex: 1, minHeight: 64, paddingHorizontal: 16, borderRadius: 32, borderWidth: 3, borderColor: '#8A7795', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' }, noText: { color: '#FFF', fontSize: 16, fontWeight: '900' }, yes: { flex: 1, minHeight: 64, paddingHorizontal: 16, borderRadius: 32, borderWidth: 3, borderColor: '#E5F266', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, yesText: { color: '#17130B', fontSize: 16, fontWeight: '900' }, actionDisabled: { opacity: .62 },"""
if old_styles not in s:
    raise SystemExit('invite style anchor missing')
s = s.replace(old_styles, new_styles, 1)
p.write_text(s)

# Lock the regression in the compact mobile contract.
t = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
ts = t.read_text()
marker = """  it('pauses the solo round while the player decides on an invite, including audio loading', () => {"""
addition = """  it('uses phone-sized Battle decision controls and immediate accept feedback', () => {\n    expect(source).toContain("minHeight: 142");\n    expect(source).toContain("minHeight: 64");\n    expect(source).toContain("borderWidth: 3");\n    expect(source).toContain("fontSize: 16");\n    expect(source).toContain('CONNEXION AU BATTLE…');\n    expect(source).toContain("if (!response.arenaId) throw new Error('BATTLE_ACCEPTED_WITHOUT_ARENA')");\n    expect(source).toContain('setAudioReady(false);\\n      void stopTrackPreview();');\n  });\n\n"""
if addition not in ts:
    if marker not in ts:
        raise SystemExit('test insertion anchor missing')
    ts = ts.replace(marker, addition + marker, 1)
t.write_text(ts)
