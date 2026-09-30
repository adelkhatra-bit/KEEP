import fs from 'fs';
import path from 'path';

describe('Owner profile identity breathing room', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('aligns certification, profile type and Battle on one airy identity row', () => {
    const identity = source.indexOf('<View style={s.identity}>');
    const username = source.indexOf('<View style={s.usernameLine}>', identity);
    const meta = source.indexOf('<View style={s.profileMetaTopRow}>', username);
    const badgeGroup = source.indexOf('<View style={s.profileMetaBadgeGroup}>', meta);
    const kind = source.indexOf('style={[s.kindBadge', badgeGroup);
    const certification = source.indexOf('<ProfileCertificationBadge tier={certificationTier} compact />', username);
    const battle = source.indexOf('<BattleGlowButton', kind);
    const metrics = source.indexOf('<View style={s.topMetricsBar}', battle);
    const reprises = source.indexOf('>Reprises</Text>', metrics);
    const free = source.indexOf('topMetricFreeHero', reprises);
    expect(identity).toBeGreaterThan(-1);
    expect(meta).toBeGreaterThan(username);
    expect(badgeGroup).toBeGreaterThan(meta);
    expect(certification).toBeGreaterThan(username);
    expect(certification).toBeLessThan(meta);
    expect(kind).toBeGreaterThan(badgeGroup);
    expect(battle).toBeGreaterThan(kind);
    expect(metrics).toBeGreaterThan(battle);
    expect(free).toBeGreaterThan(reprises);
    expect(source.slice(username, meta)).not.toContain('<BattleGlowButton');
    expect(source.slice(meta, metrics)).not.toContain('profileFreeInline');
  });

  it('keeps the requested airy hierarchy with the identity lowered from the top bar', () => {
    expect(source).toContain("avatar:{width:80,height:80,borderRadius:40");
    expect(source).toContain("identity:{flexDirection:'row',alignItems:'flex-start',paddingTop:16}");
    expect(source).toContain("profileMetaLeft:{alignItems:'stretch',gap:9,marginTop:10}");
    expect(source).toContain("profileMetaBadgeGroup:{flexDirection:'row',alignItems:'center',gap:7,flexShrink:1,flexWrap:'nowrap'}");
    expect(source).toContain("profileBattleInline:{flexShrink:0}");
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
