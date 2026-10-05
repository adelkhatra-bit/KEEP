import fs from 'fs';
import path from 'path';
const home = fs.readFileSync(path.join(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');

describe('Accueil épuré + bandelette + robot des sessions (Adel 05/10/2026)', () => {
  it('aucun gros titre à l\'accueil au repos ; « À toi de jouer » seulement pendant l\'écoute', () => {
    expect(home).toContain('title="À toi de jouer"');
    expect(home).not.toContain('>Identifier</Text>');
    expect(home).not.toContain('Ça joue quoi');
    const idleTop = home.indexOf('<TopBar navigation={navigation} readyCount={detected} />');
    expect(idleTop).toBeGreaterThan(0);
  });
  it('bandelette communicative sur l\'accueil, seulement si l\'écran a la place', () => {
    expect(home).toContain('HOME_TICKER_MESSAGES');
    expect(home).toContain('roomForHomeTicker');
    expect(home).toContain('testID="home-led-ticker"');
  });
  it('la bande lumineuse reste au-dessus de l\'animation d\'écoute', () => {
    expect(home).toContain("livePanel: { marginBottom: 8, overflow: 'hidden', zIndex: 1 }");
    expect(fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'LedTicker.tsx'), 'utf8')).toContain('zIndex: 20');
  });
  it('le « robot » prévient (bulle qui glisse) et un appui mène directement aux sessions', () => {
    expect(home).toContain('testID="home-sessions-nudge"');
    expect(home).toContain('Va vérifier ta session');
    expect(home).toMatch(/setNudgeOpen\(false\); navigation\.navigate\('SessionHistory'\)/);
  });
  it('le ☰ s\'anime avec une pastille quand des sessions sont prêtes', () => {
    expect(home).toContain('testID="home-sessions-menu"');
    expect(home).toContain('roundReady');
  });
});
