// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('mobile chat full-screen design contract', () => {
  const dock = read(__dirname, '..', 'GlobalChatDock.tsx');
  const panel = read(__dirname, '..', 'MusicAgoraPanel.tsx');

  it('opens the chat in a real full-screen modal instead of a floating panel', () => {
    expect(dock).toContain('presentationStyle="fullScreen"');
    expect(dock).toContain('testID="loki-chat-fullscreen-modal"');
    expect(dock).toContain('chatFullscreen:{flex:1');
    expect(panel).toContain('testID={compact ? "loki-chat-fullscreen" : undefined}');
    expect(panel).toContain("shellCompact:{position:'absolute',top:0,bottom:0,left:0,right:0");
  });

  it('respects the phone keyboard on iOS, Android and mobile web', () => {
    expect(panel).toContain("Platform.OS === 'ios' ? 'padding'");
    expect(panel).toContain("Platform.OS === 'android' ? 'height'");
    expect(panel).toContain("Platform.OS === 'web' && keyboardInset > 0 ? keyboardInset : 0");
    expect(panel).toContain("paddingBottom: keyboardInset > 0 ? 8 : Math.max(10, safeArea.bottom + 8)");
  });

  it('keeps messages readable and the composer pinned/compact', () => {
    expect(panel).toContain("listCompact:{gap:11,paddingHorizontal:14");
    expect(panel).toContain("maxWidth:'88%'");
    expect(panel).toContain("composerCompact:{paddingHorizontal:10");
    expect(panel).toContain("inputCompact:{height:48");
    expect(panel).toContain("composerDrawer:{flexDirection:'row',flexWrap:'wrap'");
  });
});
