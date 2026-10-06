import fs from 'fs';
import path from 'path';

describe('CommunityConnectionsPanel compact profile contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'CommunityConnectionsPanel.tsx'), 'utf8');

  it('opens followers in the same compact horizontal spirit as Reprises', () => {
    expect(source).toContain('const previewRows = rows.slice(0, 8);');
    expect(source).toContain('<ScrollView horizontal');
    expect(source).toContain('style={s.previewCard}');
    expect(source).toContain("setExpanded((value) => !value)");
  });

  it('keeps search and pagination behind Voir tout instead of growing the profile', () => {
    expect(source).toContain("{expanded ? <View style={s.expandedArea}>");
    expect(source).toContain("p_limit: PAGE_SIZE");
    expect(source).toContain("const PAGE_SIZE = 24");
    expect(source).toContain("VOIR 24 DE PLUS");
  });

  it('keeps follow-back available directly from each compact follower card', () => {
    expect(source).toContain("profile.isFollowing ? 'ABONNÉ' : '+ SUIVRE'");
    expect(source).toContain('void followBack(profile)');
  });
});
