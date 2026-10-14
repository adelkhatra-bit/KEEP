import fs from 'fs';
import path from 'path';

const service = fs.readFileSync(path.resolve(__dirname, '..', 'keepBattleExperienceService.ts'), 'utf8');
const game = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');

describe('Solo iOS/web: 1 correct, 3 different credible artists', () => {
  it('never invents three wrong artists by borrowing names from other rounds', () => {
    expect(service).not.toContain('otherThemeCandidates');
    expect(service).not.toContain('sameThemeCandidates');
    expect(service).not.toContain('round.choices = unique.slice(0, 4)');
    expect(service).toContain("throw new Error('BATTLE_SOLO_CHOICES_INVALID')");
    expect(service).toContain('new Set(names).size !== 4');
    expect(service).toContain('names.filter((name) => name === correct).length !== 1');
    expect(service).toContain('normalizeArtist(round.artist) !== correct');
  });

  it('does not shorten two different credits into an identical correct answer', () => {
    expect(service).not.toContain('cleanedChoices');
    expect(service).not.toContain('primaryArtistLabel(String(round.artist');
    expect(service).toContain("artist: String(round.artist || '').trim()");
    expect(game).toContain('const answerChoiceLabel = (choice: string, choices: string[]) => {');
    expect(game).toContain('full.slice(-12).trim()');
    expect(game).toContain('choices.indexOf(choice) + 1');
    expect(game).toContain('numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}');
  });
});
