import fs from 'fs';
import path from 'path';

describe('Owner profile identity breathing room', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('moves Battle out of the username/certification line', () => {
    const username = source.indexOf('<View style={s.usernameLine}>');
    const meta = source.indexOf('<View style={s.profileMetaLeft}>', username);
    const identityEnd = source.indexOf('</View>\n        {battleFeatureEnabled', meta);
    const battle = source.indexOf('<View style={s.profileBattleRow}>', identityEnd);
    expect(username).toBeGreaterThan(-1);
    expect(meta).toBeGreaterThan(username);
    expect(identityEnd).toBeGreaterThan(meta);
    expect(battle).toBeGreaterThan(identityEnd);
    expect(source.slice(username, identityEnd)).not.toContain('<BattleGlowButton');
  });

  it('gives type, location and Battle their own breathing room', () => {
    expect(source).toContain("avatar:{width:80,height:80,borderRadius:40");
    expect(source).toContain("profileMetaLeft:{alignItems:'flex-start',gap:9,marginTop:10}");
    expect(source).toContain("profileBattleRow:{alignSelf:'flex-start',marginTop:14");
  });
});


describe('Visited profile identity breathing room', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'), 'utf8');

  it('uses the same airy identity structure as the owner profile', () => {
    expect(source).toContain("avatar:{width:80,height:80,borderRadius:40");
    expect(source).toContain("identity:{flexDirection:'row',alignItems:'flex-start',paddingTop:4}");
    expect(source).toContain("profileMetaLeft:{alignItems:'flex-start',gap:9}");
    expect(source).toContain("location:{color:colors.textSecondary,fontSize:13,lineHeight:19");
  });
});
