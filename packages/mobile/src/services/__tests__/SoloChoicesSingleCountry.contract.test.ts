import fs from 'fs';
import path from 'path';

const service = fs.readFileSync(path.resolve(__dirname, '..', 'keepBattleExperienceService.ts'), 'utf8');
const currentSql = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261013174500_solo_same_country_harder_distractors.sql'), 'utf8');

describe('Solo answers must not change country in the mobile client', () => {
  it('trusts only four original full artist names returned by Supabase', () => {
    expect(service).toContain('choices: rawChoices,');
    expect(service).toContain("throw new Error('BATTLE_SOLO_CHOICES_INVALID')");
    expect(service).toContain('new Set(labels).size !== 4');
    expect(service).toContain('labels.filter((label) => label === normalize(round.correctAnswer)).length !== 1');
  });

  it('never borrows foreign-genre decoys from other rounds when options are missing', () => {
    expect(service).not.toContain('otherThemeCandidates');
    expect(service).not.toContain('sameThemeCandidates');
    expect(service).not.toContain('allCandidates');
    expect(service).not.toContain('round.choices = unique.slice(0, 4)');
  });

  it('keeps the native country-matching SQL and checks before debiting the first Solo', () => {
    expect(currentSql).toContain('d.country_code is not distinct from p.country_code');
    expect(currentSql).toContain('jsonb_array_length(x.choices)=4');
    expect(service).toContain("if (rounds.length < 5) throw new Error('BATTLE_CATALOG_TOO_SMALL');");
  });
});
