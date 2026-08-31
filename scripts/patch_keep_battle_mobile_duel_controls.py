from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

repls = {
"<Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={44} />": "<Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={50} />",
"hitSlop={10}": "hitSlop={14}",
"invite: { marginTop: 9, minHeight: 118, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 22, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#1B1222', justifyContent: 'center' },": "invite: { marginTop: 9, minHeight: 138, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 24, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#1B1222', justifyContent: 'center' },",
"inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 },": "inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },",
"inviteLabel: { color: '#E5F266', fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 4 },": "inviteLabel: { color: '#E5F266', fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 4 },",
"inviteName: { color: '#FFF', fontSize: 16, lineHeight: 20, fontWeight: '900' },": "inviteName: { color: '#FFF', fontSize: 17, lineHeight: 22, fontWeight: '900' },",
"inviteQuestion: { color: '#F3EDF7', fontSize: 15, lineHeight: 20, fontWeight: '800' },": "inviteQuestion: { color: '#F3EDF7', fontSize: 16, lineHeight: 22, fontWeight: '800' },",
"no: { flex: 1, minHeight: 56, paddingHorizontal: 14, borderRadius: 28, borderWidth: 2, borderColor: '#75627F', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' },": "no: { flex: 1, minHeight: 60, paddingHorizontal: 16, borderRadius: 30, borderWidth: 2, borderColor: '#8B7696', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' },",
"noText: { color: '#FFF', fontSize: 14, fontWeight: '900' },": "noText: { color: '#FFF', fontSize: 15, lineHeight: 20, fontWeight: '900' },",
"yes: { flex: 1, minHeight: 56, paddingHorizontal: 14, borderRadius: 28, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' },": "yes: { flex: 1, minHeight: 60, paddingHorizontal: 16, borderRadius: 30, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' },",
"yesText: { color: '#17130B', fontSize: 14, fontWeight: '900' },": "yesText: { color: '#17130B', fontSize: 15, lineHeight: 20, fontWeight: '900' },",
}
for old, new in repls.items():
    if old not in s:
        raise SystemExit(f'missing anchor: {old[:90]}')
    s = s.replace(old, new)

old = """setRespondingChallengeId(item.id);\n    if (!accept) setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n    try {\n      const response = await respondBattleChallenge(item.id, accept);"""
new = """setRespondingChallengeId(item.id);\n    if (accept) {\n      setAudioReady(false);\n      void stopTrackPreview();\n    } else {\n      setIncoming((rows) => rows.filter((x) => x.id !== item.id));\n    }\n    try {\n      const response = await respondBattleChallenge(item.id, accept);"""
if old not in s:
    raise SystemExit('respond anchor missing')
s = s.replace(old, new, 1)
p.write_text(s)

t = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
ts = t.read_text()
if "uses extra-large phone touch targets for Battle decisions" not in ts:
    marker = "\n  it('pauses the solo round while the player decides on an invite, including audio loading', () => {"
    test = """\n  it('uses extra-large phone touch targets for Battle decisions', () => {\n    expect(source).toContain(\"no: { flex: 1, minHeight: 60\");\n    expect(source).toContain(\"yes: { flex: 1, minHeight: 60\");\n    expect(source).toContain(\"inviteQuestion: { color: '#F3EDF7', fontSize: 16\");\n    expect(source).toContain('hitSlop={14}');\n  });\n"""
    if marker not in ts:
        raise SystemExit('test marker missing')
    ts = ts.replace(marker, test + marker, 1)
t.write_text(ts)
