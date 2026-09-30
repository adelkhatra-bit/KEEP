import fs from 'fs';
import path from 'path';

describe('Owner profile identity alignment — locked 30/09/2026', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('aligns BATTLE on the same row as the profile role badge, under the right-side menu area', () => {
    const identity = source.indexOf('<View style={s.identity}>');
    const roleRow = source.indexOf('<View style={s.profileRoleBattleRow}>', identity);
    const role = source.indexOf('PROFILE_KIND_LABELS[user.kind]', roleRow);
    const battle = source.indexOf('<BattleGlowButton', role);
    const location = source.indexOf('style={s.location}', battle);
    expect(identity).toBeGreaterThan(-1);
    expect(roleRow).toBeGreaterThan(identity);
    expect(role).toBeGreaterThan(roleRow);
    expect(battle).toBeGreaterThan(role);
    expect(location).toBeGreaterThan(battle);
  });

  it('keeps the airy identity geometry and an explicit alignment rule', () => {
    expect(source).toContain("avatar:{width:80,height:80,borderRadius:40");
    expect(source).toContain("identity:{flexDirection:'row',alignItems:'flex-start',paddingTop:16}");
    expect(source).toContain("profileMetaLeft:{alignItems:'flex-start',gap:9,marginTop:10,width:'100%'}");
    expect(source).toContain("profileBattleAligned:{width:112,flexShrink:0,alignSelf:'center'}");
  });
});

describe('Visited profile identity breathing room', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'), 'utf8');

  it('uses the same airy identity structure as the owner profile', () => {
    expect(source).toContain("avatar:{width:80,height:80,borderRadius:40");
    expect(source).toContain("identity:{flexDirection:'row',alignItems:'flex-start',paddingTop:16}");
    expect(source).toContain("profileMetaLeft:{alignItems:'flex-start',gap:9}");
    expect(source).toContain("location:{color:colors.textSecondary,fontSize:13,lineHeight:19");
  });
});
