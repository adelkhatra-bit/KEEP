import fs from 'fs';
import path from 'path';

describe('Battle result voice and Solo exit contract', () => {
  const battle = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const voice = fs.readFileSync(path.resolve(__dirname, '..', 'LokiMascotVoice.tsx'), 'utf8');
  const audio = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'audioPreviewService.ts'), 'utf8');

  it('offers a real cancel before Solo starts', () => {
    expect(battle).toContain('visible={Boolean(soloSavePrompt)}');
    expect(battle).toContain('accessibilityLabel="Annuler le Battle solo"');
    expect(battle).toContain('accessibilityLabel="Jouer sans enregistrer"');
    expect(battle).toContain('accessibilityLabel="Enregistrer ce Battle solo"');
    expect(battle).not.toContain("{ text: 'Non merci', style: 'cancel', onPress: () => { void runStartSolo(false); } }");
  });

  it('uses more of the Solo screen and lowers the answer grid', () => {
    expect(battle).toContain('style={[s.visual, s.soloVisual]}');
    expect(battle).toContain('soloVisual: { height: 168 }');
    expect(battle).toContain('soloQuestion: { marginTop: 14 }');
    expect(battle).toContain('soloAnswers: { marginTop: 10 }');
  });

  it('automatically ducks preview audio and uses a more natural French voice', () => {
    expect(voice).toContain('duckActivePreviewForSpeech(0.14)');
    expect(voice).toContain('pitch: 1.02');
    expect(voice).toContain('rate: 0.94');
    expect(voice).toContain("speakLokiText(");
    expect(audio).toContain('export async function duckActivePreviewForSpeech');
    expect(audio).toContain('export async function restoreActivePreviewAfterSpeech');
  });

  it('speaks the online Battle result without another microphone action', () => {
    expect(battle).toContain('textOverride={battleResultMessage(');
    expect(battle).toContain("moodOverride={arena.lastResult.won ? 'party' : 'oops'}");
    expect(battle).toContain('compact');
  });
});
