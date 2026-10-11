import { battleWinReason, answerVisualState, dedupeAnswerChoices, formatFreeRecharge, nextMonthlyFreeRecharge, sameAnswer, soloEncouragement, soloPlanRuleCopy, soloQuotaCopy } from '../battleHomeInfo';

describe('battleHomeInfo — réponses Battle', () => {
  it('bonne réponse toujours verte, mauvaise choisie toujours rouge (bug Adel 29/09/2026)', () => {
    expect(answerVisualState('Aya Nakamura', 'Aya Nakamura', 'Dadju', true)).toBe('correct');
    expect(answerVisualState('Dadju', 'Aya Nakamura', 'Dadju', true)).toBe('wrong');
    expect(answerVisualState('Tiakola', 'Aya Nakamura', 'Dadju', true)).toBe('idle');
    expect(answerVisualState('Dadju', 'Aya Nakamura', 'Dadju', false)).toBe('idle');
  });
  it('ignore la casse : la bonne réponse reste verte et comptée juste', () => {
    expect(sameAnswer('aya nakamura', 'Aya Nakamura ')).toBe(true);
    expect(answerVisualState('aya nakamura', 'Aya Nakamura', 'aya nakamura', true)).toBe('correct');
  });
  it('timeout : aucune réponse choisie, seule la bonne est verte', () => {
    expect(answerVisualState('Aya Nakamura', 'Aya Nakamura', null, true)).toBe('correct');
    expect(answerVisualState('Dadju', 'Aya Nakamura', null, true)).toBe('idle');
  });
  it('dédoublonnage : garde la bonne réponse si deux choix ont le même libellé', () => {
    const label = (v: string) => v.split(/\s*feat\.?\s*/i)[0];
    const out = dedupeAnswerChoices(['Aya feat. X', 'Dadju', 'Aya', 'Tiakola', 'Ninho'], 'Aya', label);
    expect(out).toEqual(['Aya', 'Dadju', 'Tiakola', 'Ninho']);
  });
});

describe('battleHomeInfo — quota Solo et recharge Free', () => {
  it('dit combien de solos restent, sur combien, et quand ça se recharge', () => {
    const q = soloQuotaCopy({ limit: 3, remaining: 2, unlimited: false, resetsAt: '2026-09-30T00:00:00' })!;
    expect(q.headline).toBe('2 Solos disponibles');
    expect(q.detail).toContain('journée Battle jusqu’à');
    expect(q.exhausted).toBe(false);
    const done = soloQuotaCopy({ limit: 3, remaining: 0, unlimited: false, resetsAt: null })!;
    expect(done.exhausted).toBe(true);
    expect(done.headline).toBe('0 Solo disponible');
    expect(soloQuotaCopy({ limit: null, remaining: null, unlimited: true })!.headline).toBe('Solos disponibles : illimités');
    expect(soloQuotaCopy(null)).toBeNull();
  });
  it('recharge mensuelle = création du profil + tranches de 30 jours (miroir serveur)', () => {
    const created = '2026-09-01T00:00:00Z';
    const now = Date.parse('2026-09-29T12:00:00Z');
    expect(nextMonthlyFreeRecharge(created, now)!.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(nextMonthlyFreeRecharge(created, Date.parse('2026-10-02T00:00:00Z'))!.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(nextMonthlyFreeRecharge(null)).toBeNull();
    expect(formatFreeRecharge(new Date(2026, 9, 1), 5)).toBe('+5 Free le 01/10');
    expect(formatFreeRecharge(new Date(2026, 9, 1), 0)).toBeNull();
  });
  it('un encouragement par morceau, message spécial au premier et au dernier', () => {
    expect(soloEncouragement(0, 8)).toContain('bonne chance');
    expect(soloEncouragement(7, 8)).toContain('Dernier morceau');
    expect(soloEncouragement(1, 8)).not.toBe(soloEncouragement(2, 8));
  });

  it('règle par profil : 10 Solos par jour en gratuit, illimité avec une formule', () => {
    expect(soloPlanRuleCopy({ limit: 10, remaining: 9, unlimited: false, plan: 'FREE' })!.short).toBe('Disponibles : 9 · quota du jour 10');
    expect(soloPlanRuleCopy({ limit: 10, remaining: 9, unlimited: false, plan: 'PREMIUM' })!.short).toBe('Disponibles : 9 · quota du jour 10');
    expect(soloPlanRuleCopy({ limit: null, remaining: null, unlimited: true })!.short).toBe('Solos disponibles : illimités');
    expect(soloPlanRuleCopy(null)).toBeNull();
  });
});

describe('battleWinReason', () => {
  it('explique en une phrase pourquoi on a gagné', () => {
    expect(battleWinReason([{ username: 'adel4A', placement: 1, correct: 7, responseMs: 29800 }, { username: 'samedi', placement: 2, correct: 4, responseMs: 9800 }])).toBe('🎯 Gagné aux bonnes réponses · 7 contre 4');
    expect(battleWinReason([{ username: 'samedi', placement: 2, correct: 7, responseMs: 31200 }, { username: 'adel4A', placement: 1, correct: 7, responseMs: 29800 }])).toBe('⚡ Égalité à 7 bonnes réponses · adel4A plus rapide (29.8 s contre 31.2 s)');
    expect(battleWinReason([{ username: 'solo', placement: 1, correct: 3, responseMs: 1000 }])).toBeNull();
  });
});
