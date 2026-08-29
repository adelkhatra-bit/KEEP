from pathlib import Path
import re

# Mobile service: keep the arena state returned by the accept RPC so the target
# does not depend on a second network round trip before entering the Battle.
p = Path('packages/mobile/src/services/keepBattleLiveService.ts')
s = p.read_text()
s = s.replace(
"export async function respondBattleChallenge(challengeId: string, accept: boolean): Promise<{ status: string; arenaId?: string | null; arenaCode?: string | null }> {",
"export async function respondBattleChallenge(challengeId: string, accept: boolean): Promise<{ status: string; arenaId?: string | null; arenaCode?: string | null; arenaState?: any | null }> {",
1,
)
s = s.replace(
"        arenaCode: (data as any)?.arenaCode ? String((data as any).arenaCode) : null,\n",
"        arenaCode: (data as any)?.arenaCode ? String((data as any).arenaCode) : null,\n        arenaState: (data as any)?.arenaState ?? null,\n",
1,
)
p.write_text(s)

# Battle card: use the returned arena state immediately. Keep the retry loader as
# compatibility fallback for older server responses.
p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()
s = s.replace(
"        const loadedArena = await loadArenaAfterAccept(response.arenaId);",
"        const loadedArena = response.arenaState || await loadArenaAfterAccept(response.arenaId);",
1,
)

# Smartphone readability: make the whole invitation panel and both actions larger,
# not only the text. 56pt targets exceed the iOS/Android minimum touch target.
def replace_style(name, body):
    global s
    pattern = rf"{name}: \{{[^}}]*\}}"
    s2, n = re.subn(pattern, f"{name}: {{ {body} }}", s, count=1)
    if n != 1:
        raise SystemExit(f'style missing: {name}')
    s = s2

replace_style('invite', "marginTop: 9, minHeight: 118, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 22, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#1B1222', justifyContent: 'center'")
replace_style('inviteHead', "flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10")
replace_style('inviteActions', "flexDirection: 'row', gap: 10, width: '100%'")
replace_style('inviteLabel', "color: '#E5F266', fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 4")
replace_style('inviteName', "color: '#FFF', fontSize: 16, lineHeight: 20, fontWeight: '900'")
replace_style('inviteQuestion', "color: '#F3EDF7', fontSize: 15, lineHeight: 20, fontWeight: '800'")
replace_style('no', "flex: 1, minHeight: 56, paddingHorizontal: 14, borderRadius: 28, borderWidth: 2, borderColor: '#75627F', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center'")
replace_style('noText', "color: '#FFF', fontSize: 14, fontWeight: '900'")
replace_style('yes', "flex: 1, minHeight: 56, paddingHorizontal: 14, borderRadius: 28, borderWidth: 2, borderColor: '#E5F266', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center'")
replace_style('yesText', "color: '#17130B', fontSize: 14, fontWeight: '900'")
replace_style('duelName', "color: '#FFF', fontSize: 13, fontWeight: '900'")
replace_style('duelPoints', "color: '#FFF', fontSize: 13, fontWeight: '900', marginTop: 3")
replace_style('duelScore', "color: '#E5F266', fontSize: 15, fontWeight: '900'")
replace_style('duelTimer', "color: '#FFF', fontSize: 11, fontWeight: '900', marginTop: 2")
replace_style('power', "height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2032', flexDirection: 'row', position: 'relative', marginTop: 7")

# Larger avatar in invitation.
s = re.sub(r"url=\{incoming\[0\]\.avatarUrl\} size=\{\d+\}", "url={incoming[0].avatarUrl} size={44}", s)
s = re.sub(r"hitSlop=\{\d+\}", "hitSlop={10}", s)
p.write_text(s)

# Lock the new reliability behavior in tests.
p = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
t = p.read_text()
if "uses the arena state returned by accept" not in t:
    t += """

describe('KEEP Battle accept reliability', () => {
  const battle = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const live = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts'), 'utf8');

  it('uses the arena state returned by accept without requiring a second network call', () => {
    expect(live).toContain('arenaState: (data as any)?.arenaState ?? null');
    expect(battle).toContain('response.arenaState || await loadArenaAfterAccept(response.arenaId)');
  });

  it('uses large smartphone touch targets for accept and refuse', () => {
    expect(battle).toContain('minHeight: 56');
    expect(battle).toContain('borderWidth: 2');
    expect(battle).toContain('hitSlop={10}');
    expect(battle).toContain("inviteQuestion: { color: '#F3EDF7', fontSize: 15, lineHeight: 20");
  });
});
"""
p.write_text(t)
