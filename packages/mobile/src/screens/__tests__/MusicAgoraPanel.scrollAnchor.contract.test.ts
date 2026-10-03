import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'components', 'MusicAgoraPanel.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('MusicAgoraPanel — historique manuel vs composeur', () => {
  it('annule les recentrages différés dès que l’utilisateur remonte', () => {
    expect(source).toContain('bottomRetryTimersRef.current.forEach(clearTimeout)');
    expect(source).toContain('browsingHistoryRef.current = true;');
    expect(source).toContain('stickToBottomRef.current = false;');
    expect(source).toContain('forceBottomRef.current = false;');
  });

  it('détecte aussi la molette/souris comme une vraie remontée de lecture', () => {
    expect(source).toContain('const lastChatScrollYRef = useRef(0);');
    expect(source).toContain("const wheelMovedUp = Platform.OS === 'web' && contentOffset.y < previousY - 2;");
    expect(source).toContain('if (wheelMovedUp && ownSendPendingRef.current === null)');
    expect(source).toContain('bottomRetryTimersRef.current.forEach(clearTimeout)');
    expect(source).toContain('forceBottomRef.current = false;');
  });

  it('ne recentre pas un fil pendant un drag manuel', () => {
    expect(source).toContain("if (!userDraggingChatRef.current && (stickToBottomRef.current || ownSendPendingRef.current !== null || !initialScrollDone.current || forceBottomRef.current))");
    expect(source).not.toContain("|| forceBottomRef.current || !browsingHistoryRef.current");
  });

  it('redescend uniquement quand le composeur est touché ou lors d’un envoi', () => {
    expect(source).toContain('onPressIn={() => {');
    expect(source).toContain('followChatBottom(true);');
    expect(source).toContain('ownSendPendingRef.current = -1;');
    expect(source).toContain('followChatBottom(false);');
  });

  it('un nouveau message ne vole pas la position de lecture', () => {
    expect(source).toContain('if (browsingHistoryRef.current || !stickToBottomRef.current)');
    expect(source).toContain('setShowLatestJump(true);');
  });
});
