import * as fs from 'fs';
import * as path from 'path';
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe('règles d’Adel du 05/10/2026 (IDEA-115 / IDEA-116)', () => {
  it('compteurs de réactions : pastilles de la même taille que les boutons, couleurs de statistique, pas de rouge « bonheur »', () => {
    const btn = read('../../components/TrackLikeButton.tsx');
    expect(btn).toContain('export function ReactionStatPills');
    expect(btn).toMatch(/pill: \{ width: 42, height: 42, borderRadius: 21/);
    expect(btn).toMatch(/orb: \{ width: 42, height: 42/);
    expect(btn).toContain("LIKE: '#35E08A'");
    expect(btn).not.toContain('#FF2D55');
  });
  it('boutique et ventes privées du chat : masquables, état mémorisé par profil', () => {
    const hook = read('../useCollapsedSection.ts');
    expect(hook).toContain('AsyncStorage.setItem');
    const screen = read('../../screens/ProfilePublicScreen.tsx');
    expect(screen).toContain("useCollapsedSection(user?.id ?? 'guest', 'boutique', true)");
    expect(screen).toContain("useCollapsedSection(user?.id ?? 'guest', 'private-chat-sales', false)");
    expect(screen).toContain('testID="owner-boutique-toggle"');
    expect(screen).toContain('{ownerBoutiqueOpen ? <SellerBoutique');
  });
  it('clé de mémorisation propre à chaque profil et chaque section', () => {
    const { collapsedSectionKey } = jest.requireActual('../useCollapsedSection') as any;
    expect(collapsedSectionKey('a', 'boutique')).not.toBe(collapsedSectionKey('b', 'boutique'));
    expect(collapsedSectionKey('a', 'boutique')).not.toBe(collapsedSectionKey('a', 'private-chat-sales'));
  });
});

describe('menu ☰ : retour direct à la rubrique (IDEA-119)', () => {
  it('chaque sortie du menu (écran ou fenêtre) mémorise le retour et la position de défilement', () => {
    const screen = read('../../screens/ProfilePublicScreen.tsx');
    expect(screen).toContain('returnToMenuAfterScreen.current = true; setMenuOpen(false)');
    for (const key of ['identityShare', 'musicTaste', 'ear']) {
      expect(screen).toMatch(new RegExp(`key === '${key}'\\) \\{\\n\\s+returnToMenuAfterModal.current = true;`));
    }
    expect(screen).toContain('useIsFocused()');
    expect(screen).toContain('menuScrollRef.current?.scrollTo({ y: menuScrollY.current');
    expect(screen).toContain('const pendingMenuReturn = { current: false }');
    expect(screen).toContain('menuFreezeUntil.current = Date.now() + 2000');
  });
});
