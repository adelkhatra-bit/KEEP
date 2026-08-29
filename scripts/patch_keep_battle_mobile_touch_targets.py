from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

# The first pass already hardened the action path. This pass deliberately scales the
# inline invite to the same visual/touch hierarchy as the large answer cards on phone.
repls = {
"url={incoming[0].avatarUrl} size={32}": "url={incoming[0].avatarUrl} size={40}",
"invite: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 13": "invite: { marginTop: 8, minHeight: 92, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 20",
"inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 7 }": "inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 10 }",
"inviteLabel: { color: '#E5F266', fontSize: 11, lineHeight: 14, fontWeight: '900', marginTop: 2 }": "inviteLabel: { color: '#E5F266', fontSize: 13, lineHeight: 17, fontWeight: '900', marginTop: 4 }",
"inviteName: { color: '#FFF', fontSize: 12, fontWeight: '900' }": "inviteName: { color: '#FFF', fontSize: 15, lineHeight: 19, fontWeight: '900' }",
"inviteQuestion: { color: '#F3EDF7', fontSize: 11, lineHeight: 14, fontWeight: '800' }": "inviteQuestion: { color: '#F3EDF7', fontSize: 14, lineHeight: 18, fontWeight: '800' }",
"no: { minHeight: 44, minWidth: 70, paddingHorizontal: 9, borderRadius: 22": "no: { minHeight: 50, minWidth: 92, paddingHorizontal: 12, borderRadius: 25",
"noText: { color: '#FFF', fontSize: 11, fontWeight: '900' }": "noText: { color: '#FFF', fontSize: 13, fontWeight: '900' }",
"yes: { minHeight: 44, minWidth: 76, paddingHorizontal: 9, borderRadius: 22": "yes: { minHeight: 50, minWidth: 98, paddingHorizontal: 12, borderRadius: 25",
"yesText: { color: '#17130B', fontSize: 11, fontWeight: '900' }": "yesText: { color: '#17130B', fontSize: 13, fontWeight: '900' }",
}
for old, new in repls.items():
    if old not in s:
        raise SystemExit(f'mobile scale anchor missing: {old[:55]}')
    s = s.replace(old, new)

# Increase the effective hit box again without changing layout.
s = s.replace('hitSlop={4} disabled={Boolean(respondingChallengeId)}', 'hitSlop={8} disabled={Boolean(respondingChallengeId)}')
p.write_text(s)

p = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
t = p.read_text()
t = t.replace("expect(source).toContain('minHeight: 44, minWidth: 70');", "expect(source).toContain('minHeight: 50, minWidth: 92');")
t = t.replace("expect(source).toContain('minHeight: 44, minWidth: 76');", "expect(source).toContain('minHeight: 50, minWidth: 98');")
t = t.replace("expect(source).toContain('hitSlop={4}');", "expect(source).toContain('hitSlop={8}');")
t = t.replace("expect(source).toContain(\"inviteQuestion: { color: '#F3EDF7', fontSize: 11, lineHeight: 14\");", "expect(source).toContain(\"inviteQuestion: { color: '#F3EDF7', fontSize: 14, lineHeight: 18\");")
t = t.replace("expect(source).toContain(\"inviteName: { color: '#FFF', fontSize: 12\");", "expect(source).toContain(\"inviteName: { color: '#FFF', fontSize: 15\");")
if "minHeight: 92" not in t:
    needle = "expect(source).toContain('respondingChallengeId');"
    t = t.replace(needle, "expect(source).toContain('minHeight: 92');\n    " + needle, 1)
p.write_text(t)
