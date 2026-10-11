import { composeTickerBatch, composeTickerMessage, hashMessage, tickerCombinationCount } from '../tickerMessageLibrary';

describe('Bibliothèque des bandelettes (Adel 05/10/2026)', () => {
  it('sait composer plus d\'un million de messages différents', () => {
    expect(tickerCombinationCount()).toBeGreaterThan(1000000);
  });
  it('un lot ne contient que des messages tous différents', () => {
    const batch = composeTickerBatch(12, 'test-a');
    expect(batch).toHaveLength(12);
    expect(new Set(batch).size).toBe(12);
  });
  it('deux connexions différentes donnent des lots différents', () => {
    const a = composeTickerBatch(10, 'connexion-1');
    const b = composeTickerBatch(10, 'connexion-2');
    expect(a.join('|')).not.toBe(b.join('|'));
  });
  it('évite les messages déjà montrés récemment', () => {
    const first = composeTickerBatch(10, 'm1');
    const second = composeTickerBatch(10, 'm1', new Set(first.map(hashMessage)));
    expect(second.some((message) => first.includes(message))).toBe(false);
  });
  it('un message reste court et lisible (une ligne de bandelette)', () => {
    for (let i = 0; i < 300; i += 1) {
      const message = composeTickerMessage(['RULE', 'CHALLENGE', 'COMMUNITY', 'MATCH'][i % 4] as any, `s${i}`);
      expect(message.length).toBeLessThanOrEqual(140);
      expect(message).not.toMatch(/undefined|\s{2,}/);
    }
  });
  it('les règles importantes du système sont expliquées', () => {
    const joined = Array.from({ length: 400 }, (_, i) => composeTickerMessage('RULE', `r${i}`)).join(' ');
    for (const keyword of ['FREE', 'story', 'GARDER', 'public', 'privé', '24 h', 'crédité']) expect(joined).toContain(keyword);
  });
});
