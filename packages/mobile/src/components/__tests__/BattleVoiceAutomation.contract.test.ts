import fs from 'fs';
import path from 'path';

describe('Battle result voice and Solo exit contract', () => {
  const battle = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const voice = fs.readFileSync(path.resolve(__dirname, '..', 'LokiMascotVoice.tsx'), 'utf8');
  const audio = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'audioPreviewService.ts'), 'utf8');
  const speech = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'lokiSpeechService.ts'), 'utf8');

  it('offers a real cancel before Solo starts', () => {
    expect(battle).toContain('visible={Boolean(soloSavePrompt)}');
    expect(battle).toContain('accessibilityLabel="Annuler le Battle solo"');
    expect(battle).toContain('accessibilityLabel="Jouer sans enregistrer"');
    expect(battle).toContain('accessibilityLabel="Enregistrer ce Battle solo"');
    expect(battle).not.toContain("{ text: 'Non merci', style: 'cancel', onPress: () => { void runStartSolo(false); } }");
  });

  it('uses more of the Solo screen and lowers the answer grid', () => {
    expect(battle).toContain('style={[s.visual, s.soloVisual, { maxHeight: soloVisualMax, maxWidth: soloVisualMax }]}');
    expect(battle).toContain("soloVisual: { height: undefined, width: '100%', aspectRatio: 1");
    expect(battle).not.toContain('maxWidth: 330');
    expect(battle).toContain("soloCardActive: { flexGrow: 1, justifyContent: 'flex-start', paddingHorizontal: 3, paddingTop: 3, paddingBottom: 0 }");
    expect(battle).toContain("soloQuestionBlock: { marginTop: 'auto', paddingTop: 8 }");
    expect(battle).toContain("soloAnswersActive: { marginTop: 8, paddingTop: 0, paddingBottom: 0 }");
  });

  it('automatically ducks preview audio and uses a more natural French voice', () => {
    expect(speech).toContain('duckActivePreviewForSpeech(0.16)');
    expect(voice).toContain('pitch: 1.02');
    expect(voice).toContain('rate: 0.94');
    expect(voice).toContain("speakLokiText(line.text");
    expect(speech).toContain('useApplicationAudioSession: true');
    expect(audio).toContain('export async function duckActivePreviewForSpeech');
    expect(audio).toContain('export async function restoreActivePreviewAfterSpeech');
  });

  it('speaks the online Battle result without another microphone action', () => {
    expect(battle).toContain('textOverride={battleResultMessage(');
    expect(battle).toContain("moodOverride={arena.lastResult.won ? 'party' : 'oops'}");
    expect(battle).toContain('compact');
  });

  it('rotates online result phrases instead of repeating the same copy every match', () => {
    expect(battle).toContain('BATTLE_RESULT_MESSAGE_USED');
    expect(battle).toContain('BATTLE_RESULT_MESSAGE_CACHE');
    expect(battle).toContain('used.has(index)');
    expect(battle).toContain('BATTLE_RESULT_MESSAGE_LAST');
  });

  it('requires explicit confirmation before refusing an in-arena rematch', () => {
    expect(battle).toContain("'Refuser la revanche ?'");
    expect(battle).toContain('Confirme uniquement si tu veux réellement refuser cette revanche.');
    expect(battle).not.toContain("onPress={() => { setRematchResponding(true); void respondKeepBattleArenaRematch(arena.id, false)");
  });
});
