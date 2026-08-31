from pathlib import Path
import re

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

# Scale the inline invitation to the same smartphone hierarchy as the answer cards.
s = re.sub(r"url=\{incoming\[0\]\.avatarUrl\} size=\{\d+\}", "url={incoming[0].avatarUrl} size={40}", s)

def replace_style(name, body):
    global s
    pattern = rf"{name}: \{{[^}}]*\}}"
    s2, n = re.subn(pattern, f"{name}: {{ {body} }}", s, count=1)
    if n != 1:
        raise SystemExit(f'style missing: {name}')
    s = s2

replace_style('invite', "marginTop: 8, minHeight: 92, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5F266', backgroundColor: '#1B1222', justifyContent: 'center'")
replace_style('inviteLine', "flexDirection: 'row', alignItems: 'center', gap: 10")
replace_style('inviteLabel', "color: '#E5F266', fontSize: 13, lineHeight: 17, fontWeight: '900', marginTop: 4")
replace_style('inviteName', "color: '#FFF', fontSize: 15, lineHeight: 19, fontWeight: '900'")
replace_style('inviteQuestion', "color: '#F3EDF7', fontSize: 14, lineHeight: 18, fontWeight: '800'")
replace_style('no', "minHeight: 50, minWidth: 92, paddingHorizontal: 12, borderRadius: 25, borderWidth: 1.5, borderColor: '#66556F', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center'")
replace_style('noText', "color: '#FFF', fontSize: 13, fontWeight: '900'")
replace_style('yes', "minHeight: 50, minWidth: 98, paddingHorizontal: 12, borderRadius: 25, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center'")
replace_style('yesText', "color: '#17130B', fontSize: 13, fontWeight: '900'")

s = re.sub(r'hitSlop=\{\d+\} disabled=\{Boolean\(respondingChallengeId\)\}', 'hitSlop={8} disabled={Boolean(respondingChallengeId)}', s)
p.write_text(s)

p = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
t = p.read_text()
t = re.sub(r"expect\(source\)\.toContain\('minHeight: \d+, minWidth: 70'\);", "expect(source).toContain('minHeight: 50, minWidth: 92');", t)
t = re.sub(r"expect\(source\)\.toContain\('minHeight: \d+, minWidth: 76'\);", "expect(source).toContain('minHeight: 50, minWidth: 98');", t)
t = t.replace("expect(source).toContain('hitSlop={4}');", "expect(source).toContain('hitSlop={8}');")
t = re.sub(r"expect\(source\)\.toContain\(\"inviteQuestion: \{ color: '#F3EDF7', fontSize: \d+, lineHeight: \d+\"\);", "expect(source).toContain(\"inviteQuestion: { color: '#F3EDF7', fontSize: 14, lineHeight: 18\");", t)
t = re.sub(r"expect\(source\)\.toContain\(\"inviteName: \{ color: '#FFF', fontSize: \d+\"\);", "expect(source).toContain(\"inviteName: { color: '#FFF', fontSize: 15\");", t)
if "expect(source).toContain('minHeight: 92');" not in t:
    t = t.replace("expect(source).toContain('respondingChallengeId');", "expect(source).toContain('minHeight: 92');\n    expect(source).toContain('respondingChallengeId');", 1)
p.write_text(t)
