const fs = require('fs');
const path = require('path');

describe('Home Loki Pulse contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');

  it('shows Loki Pulse music bubbles directly on Listen home', () => {
    expect(source).toContain('<Text style={s.homeDnaEyebrow}>LOKI PULSE</Text>');
    expect(source).toContain('<Text style={s.homeDnaTitle}>Tes bulles musicales</Text>');
    expect(source).toContain('testID="home-loki-pulse-bubbles"');
    expect(source).toContain('accessibilityLabel="Loki Pulse, tes bulles musicales"');
  });

  it('does not expose Loki Music DNA or redirect this block to Profile', () => {
    expect(source).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI MUSIC DNA</Text>');
    expect(source).not.toContain('accessibilityLabel="Voir mes styles musicaux sur mon profil"');
    expect(source).not.toContain("onPress={() => navigation.navigate('Profile')}\n              accessibilityRole=\"button\"\n              accessibilityLabel=\"Voir mes styles musicaux sur mon profil\"");
  });
});
