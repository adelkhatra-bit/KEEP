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
    expect(home).toContain("useTickerMessages('home')");
    expect(home).toContain('tickerMessageLibrary');
    expect(home).toContain('roomForHomeTicker');
    expect(home).toContain('testID="home-led-ticker"');
  });
  it('la bande lumineuse reste au-dessus de l\'animation d\'écoute', () => {
    expect(home).toContain("livePanel: { marginBottom: 8, overflow: 'hidden', zIndex: 1 }");
    expect(fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'LedTicker.tsx'), 'utf8')).toContain('zIndex: 20');
  });
  it('le robot du Tchat prévient des sessions (bulle, vibration, son) et un appui mène aux sessions', () => {
    expect(home).toContain("robotSay('SESSIONS'");
    const dock = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'GlobalChatDock.tsx'), 'utf8');
    expect(dock).toContain('testID="robot-says"');
    expect(dock).toContain('ROBOT_ACTIONS[robotMessage.kind]');
    const svc = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'robotCoachService.ts'), 'utf8');
    expect(svc).toContain('Vibration.vibrate');
    expect(svc).toContain("playNotificationCue('DEFAULT')");
  });
  it('la bandelette de l\'accueil est la MÊME que celle de l\'écoute (style par défaut, seulement étirée)', () => {
    expect(home).toContain("style={{ alignSelf: 'stretch', width: '100%' }}");
    expect(home).not.toContain('borderRadius: 18, borderWidth: 1.5');
    expect(home).not.toContain("robotSay('NO_FREE')");
  });
  it('le ☰ s\'anime avec une pastille quand des sessions sont prêtes', () => {
    expect(home).toContain('testID="home-sessions-menu"');
    expect(home).toContain('roundReady');
  });
});
