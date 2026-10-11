import fs from 'fs';
import path from 'path';

function read(relativeFromMobile: string) {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', relativeFromMobile), 'utf8');
}

describe('Loki core user journey contract', () => {
  const offers = read('src/screens/OffersScreen.tsx');
  const help = read('src/components/HelpLegalPanel.tsx');
  const ownerProfile = read('src/screens/ProfilePublicScreen.tsx');
  const visitorProfile = read('src/screens/PublicUserProfileScreen.tsx');
  const battleButton = read('src/components/BattleGlowButton.tsx');
  const availability = read('src/store/useBattleAvailabilityStore.ts');

  it('explains the simple growth loop in Offers', () => {
    expect(offers).toContain("COMMENT LOKI MUSIC GRANDIT AVEC TOI");
    expect(offers).toContain("Écoute → Garde → Construis → Partage → Joue.");
    expect(offers).toContain('PARTAGE · Envoie ton profil à tes amis.');
    expect(offers).toContain('JOUE · Solo ou Battle');
    expect(offers).toContain("RECHARGE · Utilise tes Free pour garder de nouvelles découvertes");
  });

  it('keeps the same explanation in À savoir / Help', () => {
    expect(help).toContain('À SAVOIR · BIEN DÉMARRER');
    expect(help).toContain('Comment Loki Music fonctionne');
    expect(help).toContain('CONSTRUIS TON PROFIL.');
    expect(help).toContain('PARTAGE.');
    expect(help).toContain('JOUE.');
    expect(help).toContain('RECOMMENCE.');
  });

  it('uses the same animated Battle control on owner and visitor profiles', () => {
    expect(ownerProfile).toContain('<BattleGlowButton');
    // 095c5b6e / b0a2bb41 : le profil visité utilise la rangée d’actions du propriétaire (bouton ⚡ BATTLE).
    expect(visitorProfile).toContain("'⚡ BATTLE'");
    expect(battleButton).toContain('Animated.loop');
    expect(battleButton).toContain("const accent = active ? colors.keep : '#7C5CFC'");
  });

  it('restores Battle availability from the authenticated Loki session', () => {
    expect(availability).toContain('supabase.auth.getSession()');
    expect(availability).toContain("event === 'SIGNED_IN'");
    expect(availability).toContain("event === 'TOKEN_REFRESHED'");
    expect(availability).toContain('syncFromServer()');
  });
});
