import fs from 'fs';
import path from 'path';

describe('Owner profile identity breathing room', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps Battle out of the username/certification line', () => {
    const username = source.indexOf('<View style={s.usernameLine}>');
    const meta = source.indexOf('<View style={s.profileMetaLeft}>', username);
    const metrics = source.indexOf('<View style={s.topMetricsBar}', meta);
    const battle = source.indexOf('<BattleGlowButton', metrics);
    expect(username).toBeGreaterThan(-1);
    expect(meta).toBeGreaterThan(username);
    expect(metrics).toBeGreaterThan(meta);
    expect(battle).toBeGreaterThan(metrics);
    expect(source.slice(username, metrics)).not.toContain('<BattleGlowButton');
  });

  it('keeps the requested airy hierarchy and stacks Battle over FREE', () => {
    expect(source).toContain("avatar:{width:80,height:80,borderRadius:40");
    expect(source).toContain("profileMetaLeft:{alignItems:'flex-start',gap:9,marginTop:10}");
    expect(source).toContain("topMetricRightStack:{width:82");
    const stack = source.indexOf('<View style={s.topMetricRightStack}>');
    const battle = source.indexOf('<BattleGlowButton', stack);
    const free = source.indexOf('style={[s.topMetricFreeHero', stack);
    expect(stack).toBeGreaterThan(-1);
    expect(battle).toBeGreaterThan(stack);
    expect(free).toBeGreaterThan(battle);
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
