from pathlib import Path
p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()
s = s.replace("<View style={s.finishScore}><Text style={s.finishScoreBig}>{arena.lastResult.score}</Text><Text style={s.finishScoreSlash}> pts</Text></View>", "<View style={s.finishScore}><Text style={s.finishScoreBig}>{winner?.score ?? arena.lastResult.score}</Text><Text style={s.finishScoreSlash}> pts</Text></View>")
p.write_text(s)
