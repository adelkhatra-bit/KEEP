import fs from 'fs';
import path from 'path';

// Retours joueurs du 02/10/2026 (soir) — chaque règle est verrouillée ici.
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
const home = read('screens', 'HomeScreenCompact.tsx');
const session = read('screens', 'SessionRecapScreen.tsx');
const dock = read('components', 'GlobalChatDock.tsx');
const panel = read('components', 'MusicAgoraPanel.tsx');
const profile = read('screens', 'ProfilePublicScreen.tsx');
const taste = read('components', 'MusicTasteQuestionnaire.tsx');

describe('retours joueurs 02/10', () => {
  it('Loki Pulse de l’accueil : vrai GARDER (plus le mode aperçu « déjà dans ta collection »)', () => {
    // Le bloc contrôlé est celui de Loki Pulse (visible={homePulseOpen}) : la story
    // personnelle (lecture seule, 05/10/2026) a son propre MusicSwipeDeckModal.
    const pulseStart = home.lastIndexOf('<MusicSwipeDeckModal', home.indexOf('visible={homePulseOpen}'));
    const block = home.slice(pulseStart, home.indexOf('/>', home.indexOf('onClose={() => {', pulseStart)));
    expect(block).not.toMatch(/\bpreviewOnly\b/);
    expect(block).toContain('askVisibilityOnKeep');
    expect(home).toContain('keepLokiPulseTrack(track,');
    expect(profile).toContain('keepLokiPulseTrack(track, visibility, freeCostPerKeep)');
  });

  it('Session : PASSER = morceau suivant, rien n’est retiré', () => {
    expect(session).toContain('const handleSwipePass = async (_track: CanonicalTrack) => true;');
    expect(session).toContain('RETIRÉS · {passedTracks.length} · récupérables');
  });

  it('mini-tchat : clavier sans double remontée, seulement les conversations à lire', () => {
    expect(dock).toContain("? { left: 6, right: 6, bottom: 6, height: Math.min(MINI_KEYBOARD_MAX, webVisualViewport.height - 12) }");
    expect(dock).not.toContain("position: 'fixed', left: webVisualViewport.left + 6");
    expect(panel).toContain('const miniUnreadOnly = compactMini && unreadInboxItems.length > 0;');
    expect(panel).toContain('{!miniUnreadOnly ? <>');
  });

  it('Mes goûts musicaux : boutons toujours visibles, ouverture iPhone différée, retour au menu', () => {
    expect(taste).toContain("root:{width:'100%',maxWidth:640,height:'92%'");
    expect(taste).toContain('scroll:{flex:1,minHeight:120}');
    expect(profile).toContain("if (Platform.OS === 'ios') setTimeout(() => setPulseTasteOpen(true), 450);");
    expect(profile).toContain('accessibilityLabel="Retour au menu"');
  });

  it('en partie : robot en haut, déplaçable, sans languette sur les réponses', () => {
    expect(dock).toContain('const gameInProgress = useGameSessionStore((state) => state.isGameInProgress);');
    expect(dock).toContain('{!open && unreadCount > 0 && !gameInProgress ? (');
    expect(dock).toContain('setGameBottom(nextBottom);');
  });
});
