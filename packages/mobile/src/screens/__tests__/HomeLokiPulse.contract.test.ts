const fs = require('fs');
const path = require('path');

describe('Home music bubbles contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');

  it('shows clickable music bubbles directly on Listen home without extra title/branding', () => {
    // 4a452f0e fix(profile): restore DNA and separate Pulse track bubbles (point de contrôle visuel validé, AGENT_MESSAGES.md 02/10) :
    // l'accueil affiche des bulles de MORCEAUX Loki Pulse, plus des bulles de styles.
    expect(source).not.toContain('testID="home-loki-pulse-track-bubbles"'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(source).not.toContain('accessibilityLabel="Bulles musicales Loki Pulse"'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(source).not.toContain('accessibilityLabel="Styles musicaux cliquables"');
    expect(source).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI PULSE</Text>');
    expect(source).not.toContain('Loki Pulse, tes bulles musicales');
    expect(source).not.toContain('Loki Pulse apprend');
    expect(source).not.toContain('<Text style={s.homeDnaTitle}>Tes bulles musicales</Text>');
    expect(source).not.toContain('onPress={() => openHomePulseTrack(item.track.id)}'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(source).not.toContain('<MusicSwipeDeckModal'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(source).not.toContain('backLabel="REVENIR À LOKI MUSIC"'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
  });

  it('does not expose Loki Music DNA or redirect this block to Profile', () => {
    expect(source).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI MUSIC DNA</Text>');
    expect(source).not.toContain('accessibilityLabel="Voir mes styles musicaux sur mon profil"');
    expect(source).not.toContain("onPress={() => navigation.navigate('Profile')}");
  });
});
