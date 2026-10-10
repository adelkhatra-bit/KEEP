import fs from 'fs';
import path from 'path';

// Adel (02/10/2026) : « ils ont accepté l'invitation et ensuite ils ne peuvent
// pas écrire ». Sur téléphone, un groupe ouvert n'a pas de replyTarget : la
// zone d'écriture ne doit jamais dépendre de replyTarget seul.
const source = fs.readFileSync(path.join(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8');

describe('group chat composer stays writable on mobile', () => {
  it('hides the composer only on the compact inbox list, never in an open group', () => {
    expect(source).toContain("const compactInboxList = compact && chatMode === 'MESSAGES' && !replyTarget && !activeGroup;");
    expect(source).toContain('{enabled && !compactInboxList && !groupInvitePending ? <View style={[s.composer, compact && s.composerCompact]}>');
    expect(source).not.toContain("{enabled && !(compact && chatMode === 'MESSAGES' && !replyTarget) ?");
  });

  it('explains a pending invitation instead of a generic account error', () => {
    expect(source).toContain("const groupInvitePending = Boolean(activeGroup && activeGroup.myStatus !== 'ACTIVE');");
    expect(source).toContain('Accepte l’invitation pour écrire dans ce groupe.');
  });

  it('keeps chat text readable: no grey text and nothing under 10 px', () => {
    const styles = source.slice(source.indexOf('const s=StyleSheet.create({'));
    expect(styles).not.toContain('colors.textMutedGrey');
    const sizes = [...styles.matchAll(/fontSize:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
  });
});
