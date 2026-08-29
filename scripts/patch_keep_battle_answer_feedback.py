from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

# Give the player enough time to visually confirm the selected and correct answers.
s = s.replace("const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 360);", "const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 1050);", 1)
s = s.replace("const id = setTimeout(() => { setSoloFinished(true); celebrate(); }, 520);", "const id = setTimeout(() => { setSoloFinished(true); celebrate(); }, 1050);", 1)

old = """<View style={s.answers}>{round.choices.slice(0, 3).map((choice, i) => <TouchableOpacity key={choice} disabled={!audioReady || answered || Boolean(incoming[0]) || pausedSoloRemaining !== null} onPress={() => answerSolo(choice)} style={[s.answer, answered && choice === round.correctAnswer && s.answerCorrect]}><Text style={s.answerNo}>{i + 1}</Text><Text style={s.answerText}>{choice}</Text></TouchableOpacity>)}</View>"""
new = """<View style={s.answers}>{round.choices.slice(0, 3).map((choice, i) => { const selected = soloAnswer === choice; const isCorrectChoice = choice === round.correctAnswer; const selectedWrong = answered && selected && !isCorrectChoice; return <TouchableOpacity key={choice} accessibilityRole=\"button\" accessibilityState={{ selected }} disabled={!audioReady || answered || Boolean(incoming[0]) || pausedSoloRemaining !== null} onPress={() => answerSolo(choice)} style={[s.answer, answered && isCorrectChoice && s.answerCorrect, selectedWrong && s.answerWrong, selected && isCorrectChoice && s.answerSelectedCorrect]}><Text style={[s.answerNo, answered && isCorrectChoice && s.answerNoCorrect, selectedWrong && s.answerNoWrong]}>{answered && isCorrectChoice ? '✓' : selectedWrong ? '×' : i + 1}</Text><Text style={[s.answerText, answered && isCorrectChoice && s.answerTextCorrect, selectedWrong && s.answerTextWrong]}>{choice}{answered && isCorrectChoice ? '  ·  BONNE RÉPONSE' : selectedWrong ? '  ·  TON CHOIX' : ''}</Text></TouchableOpacity>; })}</View>"""
if old not in s:
    raise SystemExit('solo answers anchor missing')
s = s.replace(old, new, 1)

style_anchor = """answerCorrect: { borderColor: '#69E5A4' }, answerNo:"""
style_repl = """answerCorrect: { borderColor: '#69E5A4', backgroundColor: '#163326', borderWidth: 2 }, answerWrong: { borderColor: '#FF5E76', backgroundColor: '#3A1720', borderWidth: 2 }, answerSelectedCorrect: { borderColor: '#69E5A4', backgroundColor: '#163326', borderWidth: 2 }, answerNoCorrect: { backgroundColor: '#69E5A4', color: '#102218' }, answerNoWrong: { backgroundColor: '#FF5E76', color: '#FFF' }, answerTextCorrect: { color: '#B9FFD8' }, answerTextWrong: { color: '#FFD0D8' }, answerNo:"""
if style_anchor not in s:
    raise SystemExit('answer styles anchor missing')
s = s.replace(style_anchor, style_repl, 1)

p.write_text(s)

# Lock the feedback behavior in the compact regression test.
t = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
ts = t.read_text()
insert_at = ts.rfind('});')
block = """

  it('visually confirms the tapped solo answer and reveals the correct one', () => {
    expect(source).toContain('const selected = soloAnswer === choice');
    expect(source).toContain('const selectedWrong = answered && selected && !isCorrectChoice');
    expect(source).toContain('s.answerWrong');
    expect(source).toContain('BONNE RÉPONSE');
    expect(source).toContain('TON CHOIX');
    expect(source).toContain('}, 1050)');
  });
"""
if 'visually confirms the tapped solo answer' not in ts:
    ts = ts[:insert_at] + block + ts[insert_at:]
t.write_text(ts)
