import fs from 'fs';
import path from 'path';

describe('Owner profile identity breathing room', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('moves Battle out of the username/certification line', () => {
    const username = source.indexOf('<View style={s.usernameLine}>');
    const meta = source.indexOf('<View style={s.profileMetaLeft}>', username);
    const battle = source.indexOf('<View style={s.profileBattleRow}>', meta);
    expect(username).toBeGreaterThan(-1);
    expect(meta).toBeGreaterThan(username);
    expect(battle).toBeGreaterThan(meta);
    expect(source.slice(username, meta)).not.toContain('<BattleGlowButton');
  });

  it('gives type, location and Battle their own breathing room', () => {
    expect(source).toContain("avatar:{width:72,height:72,borderRadius:36");
    expect(source).toContain("profileMetaLeft:{alignItems:'flex-start',gap:7,marginTop:8}");
    expect(source).toContain("profileBattleRow:{alignSelf:'flex-start',marginTop:10");
  });
});
