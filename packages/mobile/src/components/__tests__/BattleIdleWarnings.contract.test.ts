import fs from 'fs';
import path from 'path';
import { ARENA_AFK_LIMIT, arenaMissWarning, SOLO_IDLE_AUTO_CLOSE_MS, soloIdleNotice } from '../../services/battleHomeInfo';

// Adel (02/10/2026) : « il faut bien marquer ce qui va être débité » et « le
// temps faudrait l'augmenter, une personne peut prendre un appel urgent ».
const game = fs.readFileSync(path.join(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');

describe('Solo : « Tu es toujours là ? »', () => {
  it('leaves one full minute before closing', () => {
    expect(SOLO_IDLE_AUTO_CLOSE_MS).toBe(60_000);
  });

  it('says exactly what happens, and that no Free is taken (Solo never debits)', () => {
    expect(soloIdleNotice(59.2, { limit: 10, remaining: 4, unlimited: false })).toBe(
      'Personne n’a répondu aux 2 derniers morceaux. Sans réponse dans 60 s, la partie s’arrête et compte dans tes Solos du jour (il t’en restera 4 sur 10), sans Free gagné. Aucun Free n’est retiré de ton solde.',
    );
    expect(soloIdleNotice(5, { limit: 0, remaining: 0, unlimited: true })).toContain('Aucun Free n’est retiré');
  });

  it('keeps both choices: Arrêter and Je suis là !', () => {
    expect(game).toContain('<Text style={s.idleStopText}>Arrêter</Text>');
    expect(game).toContain('<Text style={s.idleGoText}>Je suis là !</Text>');
    expect(game).toContain('soloIdleNotice((idlePromptAt + SOLO_IDLE_AUTO_CLOSE_MS - now) / 1000, soloDailyStatus)');
  });
});

describe('Battle en ligne : avertissement avant la sortie pour absence', () => {
  it('warns only after 2 missed questions, with the real stake', () => {
    expect(ARENA_AFK_LIMIT).toBe(3);
    expect(arenaMissWarning(0, 3)).toBeNull();
    expect(arenaMissWarning(1, 3)).toBeNull();
    expect(arenaMissWarning(2, 3)).toBe('⚠️ 2 questions sans réponse : encore une et tu sors du Battle, −3 Free débités.');
    expect(arenaMissWarning(3, 3)).toBeNull();
  });

  it('is shown above the answers and disappears as soon as the player answers', () => {
    expect(game).toContain('{!round.answered && arenaMissWarning(arenaMissStreak, stakeForRounds(arena.roundCount))');
    expect(game).toContain('tracker.streak = arena.round.answered ? 0 : tracker.streak + 1;');
  });
});
