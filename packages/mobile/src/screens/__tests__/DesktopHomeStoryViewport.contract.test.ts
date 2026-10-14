import fs from 'fs';
import path from 'path';

const home = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');
const deck = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');

describe('Desktop Home and Story viewport contracts', () => {
  it('uses one shared responsive Home, without a separate HTML implementation', () => {
    expect(home).toContain("import { useLayoutMode } from '../layout/layoutMode'");
    expect(home).toContain('desktopHome && s.desktopIdleHero');
    expect(home).toContain('desktopHome && s.desktopIdleFit');
    expect(home).toContain('<LokiIdleOrb />');
    expect(home).toContain('◉  TROUVER LE MORCEAU');
  });
  it('hides duplicate hamburger on PC while preserving mobile sessions and PC timer', () => {
    expect(home).toContain('{!isDesktop ? <TouchableOpacity onPress={openSessions}');
    expect(home).toContain('testID="home-sessions-menu"');
    expect(home).toContain('<WebCompanionCountdown />');
    expect(home).toContain('readyCount > 0 ? (');
  });
  it('gives the desktop Story modal a real viewport-bound height instead of a zero-height flex child', () => {
    expect(deck).toContain('testID="story-viewport"');
    expect(deck).toContain('testID="story-player"');
    expect(deck).toContain('height: Math.max(410, windowHeight - 32)');
    expect(deck).toContain("desktopPlayer:{flex:0,flexBasis:'auto',flexGrow:0,flexShrink:0");
    expect(deck).toContain('desktopHeaderCompact');
  });
  it('keeps the previous full-height mobile Story layout', () => {
    expect(deck).toContain('s.container, desktopSwipeLayout && s.desktopPlayer');
    expect(deck).toContain("container:{flex:1,width:'100%',maxWidth:560");
    expect(deck).toContain("outer:{flex:1,minHeight:0,width:'100%'");
  });
});
