import { noSoundMessage } from '../micNoSoundMessage';

describe('message « aucun son » (web)', () => {
  it('sur iOS natif, explique le repli quand YouTube est interrompu', () => {
    expect(noSoundMessage(undefined, true)).toContain('Lance la musique sur un autre appareil');
  });
  it('sur iPhone, explique que le son joué par le même iPhone est filtré par iOS', () => {
    const nav = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', maxTouchPoints: 5 };
    expect(noSoundMessage(nav)).toContain('ne peut pas entendre la musique jouée par ce même iPhone');
  });

  it('sur iPad (se présente comme un Mac tactile), même explication', () => {
    const nav = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', maxTouchPoints: 5 };
    expect(noSoundMessage(nav)).toContain('iOS la filtre du micro');
  });

  it('ailleurs (PC, Mac sans écran tactile, Android), garde le message générique', () => {
    for (const nav of [
      { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36', maxTouchPoints: 0 },
      { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', maxTouchPoints: 0 },
      { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/140.0 Mobile Safari/537.36', maxTouchPoints: 5 },
    ]) expect(noSoundMessage(nav)).toContain('Aucun son détecté');
  });
});
