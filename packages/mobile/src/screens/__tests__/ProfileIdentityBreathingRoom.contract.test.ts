import fs from 'fs';
import path from 'path';

describe('Owner profile identity breathing room', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('puts Battle at the pseudo level on the right, in its own column, never in the username/certification line', () => {
    const identity = source.indexOf('<View style={s.identity}>');
    const username = source.indexOf('<View style={s.usernameLine}>', identity);
    const meta = source.indexOf('<View style={s.profileMetaLeft}>', username);
    const battleColumn = source.indexOf('<View style={s.identityBattle}>', meta);
    const battle = source.indexOf('<BattleGlowButton', battleColumn);
    const metrics = source.indexOf('<View style={s.topMetricsBar}', battle);
    expect(identity).toBeGreaterThan(-1);
    expect(meta).toBeGreaterThan(username);
    expect(battleColumn).toBeGreaterThan(meta);
    expect(battle).toBeGreaterThan(battleColumn);
    expect(metrics).toBeGreaterThan(battle);
    expect(source.slice(username, meta)).not.toContain('<BattleGlowButton');
  });

  it('keeps the requested airy hierarchy with the identity lowered from the top bar', () => {
    expect(source).toContain("avatar:{width:80,height:80,borderRadius:40");
    expect(source).toContain("identity:{flexDirection:'row',alignItems:'flex-start',paddingTop:16}");
    expect(source).toContain("profileMetaLeft:{alignItems:'flex-start',gap:9,marginTop:10}");
    expect(source).toContain("identityBattle:{marginLeft:10,paddingTop:2,flexShrink:0,alignItems:'flex-end'}");
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
