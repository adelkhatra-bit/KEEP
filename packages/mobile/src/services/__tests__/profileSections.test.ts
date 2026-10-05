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
