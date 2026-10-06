// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'MusicAgoraPanel.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const dock = fs.readFileSync(
  path.resolve(__dirname, '..', 'GlobalChatDock.tsx'),
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
    expect(source).toContain('if (!userDraggingChatRef.current && (stickToBottomRef.current || ownSendPendingRef.current !== null || !initialScrollDone.current || forceBottomRef.current))');
    expect(source).toContain('onLayout={() => {');
    expect(source).toContain('chatScrollRef.current?.scrollToEnd({ animated: false })');
  });

  it('releases bottom-follow only for deliberate history browsing and keeps the return-to-latest action invisible', () => {
    expect(source).toContain('onScrollBeginDrag={() => {');
    expect(source).toContain('userDraggingChatRef.current = true;');
    expect(source).toContain('stickToBottomRef.current = !browsingOlder;');
    expect(source).toContain('onMomentumScrollEnd={(event) => {');
    expect(source).not.toContain('↓ PLUS RÉCENTS');
    expect(source).not.toContain('accessibilityLabel="Revenir aux messages les plus récents"');
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

  it('uses the same MusicAgoraPanel in mini and full-screen chat', () => {
    expect(dock).toContain('const chatPanel = (mini: boolean) => (');
    expect(dock).toContain('{chatPanel(true)}');
    expect(dock).toContain('{chatPanel(false)}');
    expect(dock).toContain('testID="loki-chat-fullscreen-modal"');
    expect(dock).toContain('presentationStyle="fullScreen"');
  });

  it('focuses the composer after opening a thread so the native mobile keyboard appears', () => {
    expect(source).toContain('const composerInputRef = useRef<TextInput | null>(null);');
    expect(source).toContain('composerInputRef.current?.focus();');
    expect(source).toContain("InteractionManager.runAfterInteractions(() => {");
    expect(source).toContain('ref={composerInputRef}');
    expect(source).toContain('showSoftInputOnFocus');
    expect(source).toContain('onPressIn={() => {');
    expect(source).toContain("keyboardShouldPersistTaps={compact ? 'always' : 'handled'}");
    expect(source).toContain("keyboardDismissMode={compact ? 'none'");
    expect(source).toContain("if (alreadyFocused && compact && Platform.OS !== 'web' && keyboardInset <= 0)");
    expect(source).toContain('input.blur();');
    expect(source).toContain('requestAnimationFrame(() => input.focus());');
    expect(source).toContain("const alreadyFocused = typeof (input as any).isFocused === 'function' && (input as any).isFocused();");
    const composerPress = source.slice(source.indexOf('onPressIn={() => {'), source.indexOf('onFocus={() => {', source.indexOf('onPressIn={() => {')));
    expect(composerPress).toContain('followChatBottom(true);');
    expect(source).toContain('requestAnimationFrame(() => focusComposer());');
    expect(source).toContain("const compactBottom = 0;");
    expect(source).toContain("enabled={compact && Platform.OS === 'ios'}");
    expect(source).toContain("behavior={compact && Platform.OS === 'ios' ? 'padding' : undefined}");
    expect(source).toContain('bottom: compactBottom');
    expect(source).toContain("Platform.OS === 'ios' ? 380 : 140");
  });
});
