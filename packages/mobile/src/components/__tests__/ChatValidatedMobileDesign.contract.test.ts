// @ts-nocheck
import fs from 'fs';
import path from 'path';

const panel = fs.readFileSync(path.resolve(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8').replace(/\\r\\n/g, '\\n');

describe('validated mobile chat inbox design', () => {
  it('provides the simple search and four filters from the approved design', () => {
    expect(panel).toContain('placeholder="Rechercher une conversation…"');
    expect(panel).toContain("['ALL','Tous']");
    expect(panel).toContain("['GROUPS','Salons']");
    expect(panel).toContain("['DIRECT','Privés']");
    expect(panel).toContain("['INVITES','Invitations']");
  });

  it('filters real conversations and groups instead of duplicating data', () => {
    expect(panel).toContain('visibleInboxGroups');
    expect(panel).toContain('visibleInboxConversations');
    expect(panel).toContain("inboxFilter === 'INVITES'");
    expect(panel).toContain("inboxFilter === 'DIRECT'");
  });

  it('keeps the approved chat full-screen and keyboard-safe', () => {
    expect(panel).toContain('KeyboardAvoidingView');
    expect(panel).toContain("enabled={compact && Platform.OS === 'ios'}");
    expect(panel).toContain("const compactBottom = 0;");
    expect(panel).toContain('chatScrollCompact');
    expect(panel).toContain('composerCompact');
  });

  it('keeps a close button in the full-screen inbox (ERR-129, dual-viewport)', () => {
    // Le × plein écran est rendu hors de la branche compacte : il ne doit jamais dépendre de `compact`.
    expect(panel).toContain('testID="chat-fullscreen-close"');
    expect(panel).toContain('{onCompactClose ? <TouchableOpacity style={s.compactClose} onPress={() => onCompactClose()}');
  });
});
