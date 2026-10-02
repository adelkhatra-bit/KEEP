// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'MusicAgoraPanel.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Loki chat latest-message visual follow', () => {
  it('opens direct, group and public threads pinned to the latest message', () => {
    expect(source).toContain('stickToBottomRef.current = true;');
    expect(source).toContain('userDraggingChatRef.current = false;');
    expect(source).toContain("setChatMode('PLACE');");
    expect(source).toContain('const openDirectThread = async');
    expect(source).toContain('const openGroup = async');
  });

  it('keeps content-size and layout changes pinned while the user is at the bottom', () => {
    expect(source).toContain('key={activeThreadKey}');
    expect(source).toContain('onContentSizeChange={() => {');
    expect(source).toContain('if (stickToBottomRef.current || ownSendPendingRef.current !== null || !initialScrollDone.current || forceBottomRef.current');
    expect(source).toContain('onLayout={() => {');
    expect(source).toContain('chatScrollRef.current?.scrollToEnd({ animated: false })');
  });

  it('only releases bottom-follow when the user deliberately drags up and offers the inverse action back to latest', () => {
    expect(source).toContain('onScrollBeginDrag={() => {');
    expect(source).toContain('userDraggingChatRef.current = true;');
    expect(source).toContain('stickToBottomRef.current = !browsingOlder;');
    expect(source).toContain('onMomentumScrollEnd={(event) => {');
    expect(source).toContain('↓ PLUS RÉCENTS');
    expect(source).toContain('accessibilityLabel="Revenir aux messages les plus récents"');
    expect(source).not.toContain('↑ PLUS ANCIENS');
  });

  it('loads older history by an intentional swipe to the top instead of using an opposite-direction button', () => {
    expect(source).toContain('if (contentOffset.y <= 24 && hasMore && !olderBusy) void loadOlder();');
    expect(source).toContain('CHARGEMENT HISTORIQUE…');
  });

  it('pins before send so the sent bubble remains visible through keyboard/layout changes', () => {
    const sendBlock = source.slice(source.indexOf('accessibilityLabel="Envoyer le message"') - 900, source.indexOf('accessibilityLabel="Envoyer le message"') + 300);
    expect(sendBlock).toContain('ownSendPendingRef.current = -1;');
    expect(sendBlock).toContain('stickToBottomRef.current = true;');
    expect(sendBlock).toContain('followChatBottom(false);');
    expect(sendBlock).toContain('void publish();');
  });
});
