from pathlib import Path
import re

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

# Keep the interaction code intact; this pass only makes the invitation clearly
# visible/tappable on a 390x844 smartphone. Apple/Android touch guidance is met
# with 68px action targets and a strong enclosing contour.
def replace_style(name, body):
    global s
    pattern = rf"{name}: \{{[^}}]*\}}"
    s2, n = re.subn(pattern, f"{name}: {{ {body} }}", s, count=1)
    if n != 1:
        raise SystemExit(f'style missing: {name}')
    s = s2

replace_style('invite', "marginTop: 10, minHeight: 154, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 26, borderWidth: 4, borderColor: '#E5F266', backgroundColor: '#1B1222', justifyContent: 'center'")
replace_style('inviteHead', "flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12")
replace_style('inviteActions', "flexDirection: 'row', gap: 12, width: '100%'")
replace_style('inviteLabel', "color: '#E5F266', fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 4")
replace_style('inviteName', "color: '#FFF', fontSize: 17, lineHeight: 22, fontWeight: '900'")
replace_style('inviteQuestion', "color: '#F3EDF7', fontSize: 16, lineHeight: 22, fontWeight: '800'")
replace_style('no', "flex: 1, minHeight: 68, paddingHorizontal: 16, borderRadius: 34, borderWidth: 4, borderColor: '#A18DAD', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center'")
replace_style('noText', "color: '#FFF', fontSize: 17, fontWeight: '900'")
replace_style('yes', "flex: 1, minHeight: 68, paddingHorizontal: 16, borderRadius: 34, borderWidth: 4, borderColor: '#F4FF82', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center'")
replace_style('yesText', "color: '#17130B', fontSize: 17, fontWeight: '900'")

# Keep a forgiving hit area around both actions.
s = re.sub(r'hitSlop=\{\d+\} disabled=\{Boolean\(respondingChallengeId\)\}', 'hitSlop={12} disabled={Boolean(respondingChallengeId)}', s)

required = [
    "invite: { marginTop: 10, minHeight: 154",
    "borderWidth: 4, borderColor: '#E5F266'",
    "no: { flex: 1, minHeight: 68",
    "yes: { flex: 1, minHeight: 68",
    "hitSlop={12}",
    "CONNEXION AU BATTLE…",
    "if (!response.arenaId) throw new Error('BATTLE_ACCEPTED_WITHOUT_ARENA')",
]
for marker in required:
    if marker not in s:
        raise SystemExit(f'missing mobile marker: {marker}')

p.write_text(s)

# Update only the assertions that encode the previous dimensions.
t = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
ts = t.read_text()
ts = ts.replace("expect(source).toContain('minHeight: 142');", "expect(source).toContain('minHeight: 154');")
ts = ts.replace("expect(source).toContain('minHeight: 64');", "expect(source).toContain('minHeight: 68');")
ts = ts.replace("expect(source).toContain('borderWidth: 3');", "expect(source).toContain('borderWidth: 4');")
ts = ts.replace("expect(source).toContain(\"invite: { marginTop: 10, minHeight: 142\");", "expect(source).toContain(\"invite: { marginTop: 10, minHeight: 154\");")
ts = ts.replace("expect(source).toContain('no: { flex: 1, minHeight: 64');", "expect(source).toContain('no: { flex: 1, minHeight: 68');")
ts = ts.replace("expect(source).toContain('yes: { flex: 1, minHeight: 64');", "expect(source).toContain('yes: { flex: 1, minHeight: 68');")
ts = ts.replace("expect(source).toContain('hitSlop={10}');", "expect(source).toContain('hitSlop={12}');")
ts = ts.replace("expect(source).toContain(\"borderWidth: 3, borderColor: '#E5F266'\");", "expect(source).toContain(\"borderWidth: 4, borderColor: '#E5F266'\");")
t.write_text(ts)
