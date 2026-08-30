from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

repls = {
"<Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={44} />": "<Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={48} />",
"hitSlop={10}": "hitSlop={12}",
"invite: { marginTop: 8, borderWidth: 1, borderColor: 'rgba(229,242,102,.58)', borderRadius: 13, backgroundColor: 'rgba(13,13,16,.97)', padding: 8, gap: 7 },": "invite: { marginTop: 9, borderWidth: 2, borderColor: 'rgba(229,242,102,.72)', borderRadius: 15, backgroundColor: 'rgba(13,13,16,.98)', padding: 11, gap: 9, minHeight: 126 },",
"inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },": "inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },",
"inviteQuestion: { color: '#FFF', fontSize: 12, lineHeight: 15, fontWeight: '700' },": "inviteQuestion: { color: '#FFF', fontSize: 14, lineHeight: 18, fontWeight: '700' },",
"inviteName: { color: '#E5F266', fontWeight: '900' },": "inviteName: { color: '#E5F266', fontSize: 14, fontWeight: '900' },",
"inviteLabel: { color: '#E5F266', fontSize: 10, fontWeight: '900', marginTop: 2 },": "inviteLabel: { color: '#E5F266', fontSize: 12, lineHeight: 16, fontWeight: '900', marginTop: 3 },",
"inviteActions: { flexDirection: 'row', gap: 8 },": "inviteActions: { flexDirection: 'row', gap: 10, width: '100%' },",
"no: { minHeight: 48, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },": "no: { minHeight: 56, flex: 1, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,.34)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },",
"yes: { minHeight: 48, flex: 1, borderRadius: 12, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },": "yes: { minHeight: 56, flex: 1, borderRadius: 14, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },",
"noText: { color: '#FFF', fontSize: 11, fontWeight: '900' },": "noText: { color: '#FFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },",
"yesText: { color: '#15110B', fontSize: 11, fontWeight: '900' },": "yesText: { color: '#15110B', fontSize: 13, lineHeight: 17, fontWeight: '900' },",
"duelName: { color: '#FFF', fontSize: 10, fontWeight: '900' },": "duelName: { color: '#FFF', fontSize: 12, lineHeight: 16, fontWeight: '900' },",
"duelScore: { color: '#E5F266', fontSize: 12, fontWeight: '900' },": "duelScore: { color: '#E5F266', fontSize: 14, lineHeight: 18, fontWeight: '900' },",
"duelTimer: { color: '#FFF', fontSize: 9, fontWeight: '900', marginTop: 1 },": "duelTimer: { color: '#FFF', fontSize: 11, lineHeight: 14, fontWeight: '900', marginTop: 1 },",
"duelPoints: { color: '#FFF', fontSize: 10, fontWeight: '900', marginTop: 2 },": "duelPoints: { color: '#FFF', fontSize: 12, lineHeight: 16, fontWeight: '900', marginTop: 2 },",
}
for old, new in repls.items():
    if old not in s:
        raise SystemExit(f'missing anchor: {old[:80]}')
    s = s.replace(old, new)

old = """setRespondingChallengeId(item.id);\n    if (!accept) setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n    try {\n      const response = await respondBattleChallenge(item.id, accept);"""
new = """setRespondingChallengeId(item.id);\n    if (accept) {\n      setAudioReady(false);\n      void stopTrackPreview();\n    } else {\n      setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n    }\n    try {\n      const response = await respondBattleChallenge(item.id, accept);"""
if old not in s:
    raise SystemExit('respond anchor missing')
s = s.replace(old, new, 1)
p.write_text(s)

t = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
ts = t.read_text()
if "uses large phone touch targets for Battle decisions" not in ts:
    marker = "\n  it('pauses the solo round while the player decides on an invite, including audio loading', () => {"
    test = """\n  it('uses large phone touch targets for Battle decisions', () => {\n    expect(source).toContain(\"no: { minHeight: 56\");\n    expect(source).toContain(\"yes: { minHeight: 56\");\n    expect(source).toContain(\"noText: { color: '#FFF', fontSize: 13\");\n    expect(source).toContain(\"yesText: { color: '#15110B', fontSize: 13\");\n    expect(source).toContain(\"inviteQuestion: { color: '#FFF', fontSize: 14\");\n    expect(source).toContain('hitSlop={12}');\n  });\n"""
    if marker not in ts:
        raise SystemExit('test marker missing')
    ts = ts.replace(marker, test + marker, 1)
t.write_text(ts)
