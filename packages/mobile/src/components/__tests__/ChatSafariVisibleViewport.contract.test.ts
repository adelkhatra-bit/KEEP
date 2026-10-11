// @ts-nocheck
import fs from 'fs';
import path from 'path';

const dock = fs.readFileSync(path.resolve(__dirname, '..', 'GlobalChatDock.tsx'), 'utf8').replace(/\r\n/g, '\n');
const panel = fs.readFileSync(path.resolve(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Loki chat iPhone Safari visible viewport contract', () => {
  it('pins the web modal to visualViewport rather than browser chrome', () => {
    expect(dock).toContain('const [webVisualViewport, setWebVisualViewport]');
    expect(dock).toContain('const viewport = win?.visualViewport');
    expect(dock).toContain("viewport.addEventListener('resize', syncVisualViewport)");
    expect(dock).toContain("height: webVisualViewport ? String(webVisualViewport.height) + 'px' : '100dvh'");
  });

  it('uses one keyboard-lift mechanism per platform', () => {
    expect(panel).toContain('const compactBottom = 0;');
    expect(panel).toContain("enabled={compact && Platform.OS === 'ios'}");
    expect(panel).toContain("behavior={compact && Platform.OS === 'ios' ? 'padding' : undefined}");
  });

  it('keeps the larger validated composer', () => {
    expect(panel).toContain("inputCompact:{height:56,minHeight:56,maxHeight:112");
    expect(panel).toContain("composerBar:{flexDirection:'row',alignItems:'center',gap:7,minHeight:66");
  });
});
