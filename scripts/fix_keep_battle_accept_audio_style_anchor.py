from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

# The base branch already had larger touch targets, so the first patch's older style anchors
# did not match. Normalize from the current production style values.
s = s.replace(
"invite: { marginTop: 7, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 15, backgroundColor: '#241730', borderWidth: 1, borderColor: '#E5F266' }",
"invite: { marginTop: 7, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 16, backgroundColor: '#241730', borderWidth: 2, borderColor: '#E5F266' }",
1,
)
s = s.replace(
"inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 9 }",
"inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 }, inviteActions: { flexDirection: 'row', gap: 8, marginTop: 10 }",
1,
)
s = s.replace(
"inviteLabel: { color: '#E5F266', fontSize: 12, lineHeight: 16, fontWeight: '900', marginTop: 3 }",
"inviteLabel: { color: '#E5F266', fontSize: 12, lineHeight: 16, fontWeight: '900', marginTop: 4 }",
1,
)
s = s.replace(
"inviteName: { color: '#FFF', fontSize: 13, fontWeight: '900' }",
"inviteName: { color: '#FFF', fontSize: 14, fontWeight: '900' }",
1,
)
s = s.replace(
"inviteQuestion: { color: '#F3EDF7', fontSize: 12, lineHeight: 16, fontWeight: '800' }",
"inviteQuestion: { color: '#F3EDF7', fontSize: 13, lineHeight: 17, fontWeight: '800' }",
1,
)
s = s.replace(
"no: { minHeight: 48, minWidth: 84, paddingHorizontal: 12, borderRadius: 24, borderWidth: 1, borderColor: '#4B3C57', alignItems: 'center', justifyContent: 'center' }",
"no: { flex: 1, minHeight: 50, paddingHorizontal: 12, borderRadius: 25, borderWidth: 2, borderColor: '#6D5B7B', alignItems: 'center', justifyContent: 'center' }",
1,
)
s = s.replace(
"noText: { color: '#FFF', fontSize: 12, fontWeight: '900' }",
"noText: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: .3 }",
1,
)
s = s.replace(
"yes: { minHeight: 48, minWidth: 92, paddingHorizontal: 12, borderRadius: 24, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }",
"yes: { flex: 1, minHeight: 50, paddingHorizontal: 12, borderRadius: 25, borderWidth: 2, borderColor: '#F4FF82', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }",
1,
)
s = s.replace(
"yesText: { color: '#17130B', fontSize: 12, fontWeight: '900' }",
"yesText: { color: '#17130B', fontSize: 12, fontWeight: '900', letterSpacing: .3 }",
1,
)

if 'inviteHeader:' not in s or 'inviteActions:' not in s:
    raise SystemExit('invite mobile styles not installed')

p.write_text(s)
