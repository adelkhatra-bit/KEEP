import fs from 'fs';
import path from 'path';

// Adel (02/10/2026, option A validée) : toucher le robot ouvre une
// MINI-fenêtre, la page reste visible ; ⤢ passe en plein écran sur la même
// conversation. Le plein écran validé reste inchangé.
const dock = fs.readFileSync(path.join(__dirname, '..', 'GlobalChatDock.tsx'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8');

describe('mini-fenêtre du tchat', () => {
  it('opens mini by default and resets to mini on close', () => {
    expect(dock).toContain('const [chatExpanded, setChatExpanded] = useState(false);');
    expect(dock).toContain('if (!open) setChatExpanded(false);');
    expect(dock).toContain('testID="loki-chat-mini"');
    expect(dock).toContain('{chatPanel(true)}');
  });

  it('expands to the validated full screen on the same conversation', () => {
    expect(dock).toContain('onCompactExpand={mini ? (thread) => { openChat(thread); setChatExpanded(true); } : undefined}');
    expect(dock).toContain('presentationStyle="fullScreen"');
    expect(panel).toContain('accessibilityLabel="Agrandir le tchat en plein écran"');
    expect(panel).toContain('activeGroup ? { groupId: activeGroup.id, groupName: activeGroup.name }');
  });

  it('stays on screen above the tab bar, grows with the keyboard', () => {
    expect(dock).toContain('{ right: 16, bottom: 72, width: 380');
    expect(dock).toContain('bottom: insets.bottom + 62, height: Math.round(height * (height < 760 ? 0.68 : 0.58))');
    expect(dock).toContain('webKeyboardOpen && webVisualViewport');
    expect(dock).toContain("BackHandler.addEventListener('hardwareBackPress', () => { closeChat(); return true; })");
  });
});
