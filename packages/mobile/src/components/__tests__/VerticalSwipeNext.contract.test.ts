import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) =>
  fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('TikTok-style upward swipe contract', () => {
  const deck = read('..', 'SwipeDeck.tsx');
  const modal = read('..', 'MusicSwipeDeckModal.tsx');
  const home = read('..', '..', 'screens', 'HomeScreenCompact.tsx');

  it('supports a real native upward gesture with a lower vertical threshold', () => {
    expect(deck).toContain("export type SwipeDirection = 'LEFT' | 'RIGHT' | 'UP';");
    expect(deck).toContain('const VERTICAL_SWIPE_THRESHOLD = 52;');
    expect(deck).toContain('onMoveShouldSetPanResponderCapture');
    expect(deck).toContain("return commitSwipe('UP')");
  });

  it('maps swipe up to next track in the shared music swipe surface', () => {
    expect(modal).toContain('onSwipeUp={() => {');
    expect(modal).toContain('void advance().finally');
    expect(modal).toContain('upLabel="SUIVANT"');
    expect(modal).toContain('↑ morceau suivant');
  });

  it('maps swipe up to next detected track in Listen too', () => {
    expect(home).toContain('onSwipeUp={canGoOlder ? goOlder : undefined}');
    expect(home).toContain('upLabel="SUIVANT"');
    expect(home).toContain('Swipe facultatif : ↑ suivant');
  });

  it('never makes the gesture mandatory: PASSER, GARDER and ARRÊTER remain visible', () => {
    expect(modal).toContain('>PASSER</Text>');
    expect(modal).toContain("currentAlreadyKept ? '✓ DÉJÀ' : '♡ GARDER'");
    expect(modal).toContain('>ARRÊTER</Text>');
  });
});

describe('écoute complète : seulement après GARDER (Adel 05/10/2026)', () => {
  it('locks the full-listen button for other members\' tracks until they are kept', () => {
    const modal = require('fs').readFileSync(require('path').join(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
    expect(modal).toContain('const fullListenLocked = !previewOnly && (askVisibilityOnKeep || Boolean(currentSourceUsername)) && !currentAlreadyKept;');
    expect(modal).toContain('fullTrackDestination && !fullListenLocked');
    expect(modal).toContain('Écoute complète disponible après GARDER');
  });
});

describe('swipe iPhone : PanResponder créé une seule fois + carte qui s\'adapte (Adel 05/10/2026)', () => {
  const read = (f: string) => require('fs').readFileSync(require('path').join(__dirname, '..', f), 'utf8');
  it('never recreates the PanResponder during a gesture (callbacks go through a ref)', () => {
    const deck = read('SwipeDeck.tsx');
    expect(deck).toContain('const latest = useRef({ enabled, onSwipeLeft, onSwipeRight, onSwipeUp });');
    expect(deck).toContain('const responder = useRef(PanResponder.create({');
    expect(deck).not.toContain('useMemo(() => PanResponder.create');
    expect(deck).toContain('onStartShouldSetPanResponder: () => latest.current.enabled');
    expect(deck).toContain('{...responder.panHandlers} style={[styles.shell');
  });
  it('the swipe card fills the free height instead of overflowing the header and the buttons', () => {
    const modal = read('MusicSwipeDeckModal.tsx');
    expect(modal).toContain("card:{flex:1,minHeight:200,maxHeight:560,");
    expect(modal).not.toContain("card:{height:500,maxHeight:'70%'");
    expect(modal).toMatch(/hint=\{swipeHint\}\s+fill/);
  });
});

describe('texte à côté d\'un bouton : jamais poussé hors de l\'écran (Adel 05/10/2026)', () => {
  it('notification panel header text shrinks (flex 1 + minWidth 0) and the close button never shrinks', () => {
    const panel = require('fs').readFileSync(require('path').join(__dirname, '..', 'NotificationSidePanel.tsx'), 'utf8');
    expect(panel).toContain("headerCopy:{flex:1,minWidth:0}");
    expect(panel).toContain("close:{flexShrink:0,");
    expect(panel).toContain("inboxActions:{flexDirection:'column'");
  });
});

describe('ajouter à ma story depuis le swipe + petits écrans (Adel 05/10/2026)', () => {
  it('adds the current track to the story only after a public keep, and compacts on short screens', () => {
    const modal = require('fs').readFileSync(require('path').join(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
    expect(modal).toContain("'deck-add-story'");
    expect(modal).toContain('pinStoryTrack(current.id)');
    expect(modal).toContain('Garde-la d’abord');
    expect(modal).toContain('const compactDeck = windowHeight < 640;');
  });
});

describe('succès du GARDER : mettre en story / déjà en story (Adel 05/10/2026)', () => {
  it('private keep offers "mettre en story (la rendre publique)", public keep shows the grey already-in-story pill', () => {
    const fs = require('fs'); const path = require('path');
    const modal = fs.readFileSync(path.join(__dirname, '..', 'KeepVisibilityChoiceModal.tsx'), 'utf8');
    expect(modal).toContain('＋ METTRE EN STORY (LA RENDRE PUBLIQUE)');
    expect(modal).toContain('✅ TU VIENS DE L’AJOUTER À TA STORY · 24 h');
    const deck = fs.readFileSync(path.join(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
    expect(deck).toContain('makeKeptPublicAndStory');
    expect(deck).toContain("persistOwnTrackVisibility(track, 'PUBLIC')");
  });
});

describe('fenêtre « Déjà dans ta collection » : bouton mettre en story au-dessus de COMPRIS (Adel 05/10/2026)', () => {
  it('shows the story button (grey when already in story) above the violet button in both info popups', () => {
    const deck = require('fs').readFileSync(require('path').join(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
    expect(deck).toContain("'deck-info-add-story'");
    expect(deck.indexOf("renderStoryAdd('popup')")).toBeLessThan(deck.indexOf('<Text style={s.ownerPreviewOkText}>COMPRIS</Text>'));
    expect(deck.match(/renderStoryAdd\('popup'\)/g)?.length).toBe(2);
  });
});
