from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

old_import = "import { buildKeepBattleArenaInviteLink, KeepBattleArenaState, KeepBattleTheme, loadKeepBattleArena, loadKeepBattleThemes, startKeepBattleArena, submitKeepBattleArenaQuizAnswer, subscribeKeepBattleArena } from '../services/keepBattleService';"
new_import = "import { buildKeepBattleArenaInviteLink, KeepBattleArenaState, KeepBattleArenaWinner, KeepBattleTheme, loadKeepBattleArena, loadKeepBattleArenaWinnerHistory, loadKeepBattleThemes, startKeepBattleArena, submitKeepBattleArenaQuizAnswer, subscribeKeepBattleArena } from '../services/keepBattleService';"
if old_import not in s:
    raise SystemExit('service import anchor missing')
s = s.replace(old_import, new_import, 1)

state_anchor = "  const [arenaInvitedIds, setArenaInvitedIds] = React.useState<string[]>([]);\n"
state_repl = state_anchor + "  const [winnerHistory, setWinnerHistory] = React.useState<KeepBattleArenaWinner[]>([]);\n"
if state_anchor not in s:
    raise SystemExit('state anchor missing')
s = s.replace(state_anchor, state_repl, 1)

effect_anchor = """  React.useEffect(() => {\n    if (arena?.status === 'WAITING' && arena.lastResult) celebrate();\n  }, [arena?.status, arena?.lastResult?.matchNo, celebrate]);\n"""
effect_repl = effect_anchor + """  React.useEffect(() => {\n    if (!arena?.id || !arena.lastResult) return;\n    void loadKeepBattleArenaWinnerHistory(arena.id, 20).then(setWinnerHistory).catch(() => setWinnerHistory([]));\n  }, [arena?.id, arena?.lastResult?.matchNo]);\n"""
if effect_anchor not in s:
    raise SystemExit('winner history effect anchor missing')
s = s.replace(effect_anchor, effect_repl, 1)

arena_anchor = """    const versusLabel = players.length > 2 ? `ÉQUIPE A (${teamA.length}) VS ÉQUIPE B (${teamB.length})` : `${first ? `@${first.username}` : 'KEEP'} VS ${second ? `@${second.username}` : 'KEEP'}`;\n"""
arena_repl = arena_anchor + """    const palmares = Array.from(winnerHistory.reduce((map, row) => {\n      const current = map.get(row.profileId) || { ...row, wins: 0 };\n      current.wins += 1;\n      if (row.matchNo > current.matchNo) Object.assign(current, row, { wins: current.wins });\n      map.set(row.profileId, current);\n      return map;\n    }, new Map<string, KeepBattleArenaWinner & { wins: number }>()).values()).sort((a, b) => b.wins - a.wins || b.matchNo - a.matchNo).slice(0, 3);\n"""
if arena_anchor not in s:
    raise SystemExit('arena palmares anchor missing')
s = s.replace(arena_anchor, arena_repl, 1)

finish_anchor = """        </Animated.View>\n        <Text style={s.finishQuestion}>Le groupe reste ensemble. Et maintenant ?</Text>\n"""
finish_repl = """        </Animated.View>\n        {palmares.length ? <View style={s.palmares}><Text style={s.palmaresTitle}>PALMARÈS · TOP 3</Text>{palmares.map((entry, index) => <TouchableOpacity key={entry.profileId} accessibilityRole=\"button\" onPress={() => onOpenProfile(entry.username)} style={s.palmaresRow}><Text style={s.palmaresRank}>{index + 1}</Text><Avatar name={entry.username} url={entry.avatarUrl} size={38} /><Text numberOfLines={1} style={s.palmaresName}>@{entry.username}</Text><Text style={s.palmaresWins}>{entry.wins} victoire{entry.wins > 1 ? 's' : ''}</Text></TouchableOpacity>)}</View> : null}\n        <Text style={s.finishQuestion}>Le groupe reste ensemble. Et maintenant ?</Text>\n"""
if finish_anchor not in s:
    raise SystemExit('finish palmares anchor missing')
s = s.replace(finish_anchor, finish_repl, 1)

style_anchor = """finishQuestion: { color: '#FFF', textAlign: 'center', fontSize: 12, fontWeight: '900', marginVertical: 12 },"""
style_repl = style_anchor + " palmares: { marginTop: 10, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: '#40334B', backgroundColor: '#120E17' }, palmaresTitle: { color: '#E5F266', fontSize: 13, lineHeight: 18, fontWeight: '900', letterSpacing: .7, marginBottom: 7 }, palmaresRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9 }, palmaresRank: { width: 24, color: '#E5F266', fontSize: 18, fontWeight: '900' }, palmaresName: { flex: 1, color: '#FFF', fontSize: 14, fontWeight: '900' }, palmaresWins: { color: '#FFF', fontSize: 11, fontWeight: '800' },"
if style_anchor not in s:
    raise SystemExit('palmares style anchor missing')
s = s.replace(style_anchor, style_repl, 1)
p.write_text(s)

t = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
ts = t.read_text()
needle = """  it('stops automatic multiplayer restart and shows rematch actions', () => {"""
addition = """  it('shows the real arena winner history as a clickable Top 3 palmares', () => {\n    expect(source).toContain('loadKeepBattleArenaWinnerHistory(arena.id, 20)');\n    expect(source).toContain('PALMARÈS · TOP 3');\n    expect(source).toContain('entry.wins} victoire');\n    expect(source).toContain('onOpenProfile(entry.username)');\n    expect(source).toContain('palmaresRow: { minHeight: 50');\n  });\n\n"""
if addition not in ts:
    if needle not in ts:
        raise SystemExit('palmares test anchor missing')
    ts = ts.replace(needle, addition + needle, 1)
t.write_text(ts)
