const fs = require('fs');
const path = require('path');

describe('Home music bubbles contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');

  it('shows music bubbles directly on Listen home without extra Pulse branding', () => {
    expect(source).toContain('<Text style={s.homeDnaTitle}>Tes bulles musicales</Text>');
    expect(source).toContain('testID="home-loki-pulse-bubbles"');
    expect(source).toContain('accessibilityLabel="Tes bulles musicales"');
    expect(source).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI PULSE</Text>');
    expect(source).not.toContain('Loki Pulse, tes bulles musicales');
    expect(source).not.toContain('Loki Pulse apprend');
  });

  it('does not expose Loki Music DNA or redirect this block to Profile', () => {
    expect(source).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI MUSIC DNA</Text>');
    expect(source).not.toContain('accessibilityLabel="Voir mes styles musicaux sur mon profil"');
    expect(source).not.toContain("onPress={() => navigation.navigate('Profile')}");
  });
});
