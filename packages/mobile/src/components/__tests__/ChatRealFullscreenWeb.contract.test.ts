// @ts-nocheck
import fs from 'fs';
import path from 'path';

const dock = fs.readFileSync(path.resolve(__dirname, '..', 'GlobalChatDock.tsx'), 'utf8').replace(/\r\n/g, '\n');
const panel = fs.readFileSync(path.resolve(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Loki chat real fullscreen web contract', () => {
  it('pins the web modal to the physical viewport', () => {
    expect(dock).toContain("position: 'fixed'");
    expect(dock).toContain(": '100vw',");
    expect(dock).toContain(": '100dvh',");
    expect(dock).toContain("zIndex: 2147483647");
  });

  it('does not leave the web chat below the viewport during a slide transition', () => {
    expect(dock).toContain("animationType={Platform.OS === 'web' ? 'none' : 'slide'}");
  });

  it('keeps a stable test/user entry for La Place', () => {
    expect(panel).toContain('testID="loki-chat-place-entry"');
    expect(panel).toContain('accessibilityLabel="Ouvrir La Place"');
  });
});
