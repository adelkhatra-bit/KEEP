from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

# Track the currently handled challenge so taps give immediate visual feedback and cannot double-fire.
anchor = "  const [handledOutgoingId, setHandledOutgoingId] = React.useState('');\n"
if anchor not in s:
    raise SystemExit('state anchor missing')
s = s.replace(anchor, anchor + "  const [respondingChallengeId, setRespondingChallengeId] = React.useState<string | null>(null);\n", 1)

old_respond = """  const respond = async (item: KeepBattleIncomingChallenge, accept: boolean) => {\n    try {\n      const response = await respondBattleChallenge(item.id, accept);\n      setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n      if (accept && response.arenaId) {\n        await stopTrackPreview();\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setAudioReady(false);\n        setArena(await loadKeepBattleArena(response.arenaId));\n        animateVersus();\n      }\n    } catch { Alert.alert('Battle', 'Cette invitation a expiré.'); }\n  };"""
new_respond = """  const respond = async (item: KeepBattleIncomingChallenge, accept: boolean) => {\n    if (respondingChallengeId) return;\n    setRespondingChallengeId(item.id);\n    setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n    try {\n      const response = await respondBattleChallenge(item.id, accept);\n      if (accept && response.arenaId) {\n        await stopTrackPreview();\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setBrowseOnline(false); setAudioReady(false);\n        setArena(await loadKeepBattleArena(response.arenaId));\n        animateVersus();\n      }\n    } catch {\n      await refreshSocial();\n      Alert.alert('Battle', 'Impossible de traiter cette invitation. Réessaie immédiatement.');\n    } finally {\n      setRespondingChallengeId(null);\n    }\n  };"""
if old_respond not in s:
    raise SystemExit('respond function anchor missing')
s = s.replace(old_respond, new_respond, 1)

# Enlarge both in-card action pairs and guarantee a 48pt+ effective touch target using hitSlop.
s = s.replace(
    "<TouchableOpacity style={s.no} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity style={s.yes} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>ACCEPTER</Text></TouchableOpacity>",
    "<TouchableOpacity hitSlop={4} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity hitSlop={4} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? '…' : 'ACCEPTER'}</Text></TouchableOpacity>"
)

# Increase avatar in the inline invitation for smartphone legibility.
s = s.replace("url={incoming[0].avatarUrl} size={24}", "url={incoming[0].avatarUrl} size={32}")

# Mobile-readable invite and duel typography. Keep the card compact enough for 390x844.
repls = {
"invite: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 11": "invite: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 13",
"inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 5 }": "inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 7 }",
"inviteLabel: { color: '#E5F266', fontSize: 7, fontWeight: '900', marginTop: 1 }": "inviteLabel: { color: '#E5F266', fontSize: 11, lineHeight: 14, fontWeight: '900', marginTop: 2 }",
"inviteName: { color: '#FFF', fontSize: 9, fontWeight: '900' }": "inviteName: { color: '#FFF', fontSize: 12, fontWeight: '900' }",
"inviteQuestion: { color: '#F3EDF7', fontSize: 8, lineHeight: 10, fontWeight: '800' }": "inviteQuestion: { color: '#F3EDF7', fontSize: 11, lineHeight: 14, fontWeight: '800' }",
"no: { minHeight: 26, paddingHorizontal: 7, borderRadius: 13": "no: { minHeight: 44, minWidth: 70, paddingHorizontal: 9, borderRadius: 22",
"noText: { color: '#FFF', fontSize: 7, fontWeight: '900' }": "noText: { color: '#FFF', fontSize: 11, fontWeight: '900' }",
"yes: { minHeight: 26, paddingHorizontal: 7, borderRadius: 13": "yes: { minHeight: 44, minWidth: 76, paddingHorizontal: 9, borderRadius: 22",
"yesText: { color: '#17130B', fontSize: 7, fontWeight: '900' }": "yesText: { color: '#17130B', fontSize: 11, fontWeight: '900' }",
"duelName: { color: '#FFF', fontSize: 10, fontWeight: '900' }": "duelName: { color: '#FFF', fontSize: 12, lineHeight: 15, fontWeight: '900' }",
"duelScore: { color: '#E5F266', fontSize: 12, fontWeight: '900' }": "duelScore: { color: '#E5F266', fontSize: 14, fontWeight: '900' }",
"duelTimer: { color: '#FFF', fontSize: 9, fontWeight: '900', marginTop: 1 }": "duelTimer: { color: '#FFF', fontSize: 11, fontWeight: '900', marginTop: 1 }",
"duelPoints: { color: '#FFF', fontSize: 10, fontWeight: '900', marginTop: 2 }": "duelPoints: { color: '#FFF', fontSize: 12, fontWeight: '900', marginTop: 2 }",
}
for old, new in repls.items():
    if old not in s:
        raise SystemExit(f'style anchor missing: {old[:40]}')
    s = s.replace(old, new, 1)

# Add disabled feedback without changing the visual system.
style_anchor = "yesText: { color: '#17130B', fontSize: 11, fontWeight: '900' },"
s = s.replace(style_anchor, style_anchor + " actionDisabled: { opacity: .55 },", 1)

p.write_text(s)

# Contract tests for readable touch targets and immediate action feedback.
p = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
t = p.read_text()
needle = "  it('keeps the horizontal music-style selector compact on 390x844', () => {"
block = """  it('uses smartphone-sized Battle action targets and readable invite text', () => {\n    expect(source).toContain('minHeight: 44, minWidth: 70');\n    expect(source).toContain('minHeight: 44, minWidth: 76');\n    expect(source).toContain('hitSlop={4}');\n    expect(source).toContain("inviteQuestion: { color: '#F3EDF7', fontSize: 11, lineHeight: 14");\n    expect(source).toContain("inviteName: { color: '#FFF', fontSize: 12");\n    expect(source).toContain('respondingChallengeId');\n    expect(source).toContain('setIncoming((rows) => rows.filter((x) => x.id !== item.id))');\n  });\n\n"""
if needle not in t:
    raise SystemExit('test insertion anchor missing')
t = t.replace(needle, block + needle, 1)
p.write_text(t)
