import {
  boutiqueVitrineCopy, boutiqueVitrineMode, missingFollowers, normalizeFeaturedCount, normalizeSaleThreshold, parseBoutiqueConfig,
} from '../boutiqueVitrine';

describe('Boutique vitrine (Lot 5)', () => {
  it('retombe sur 100 quand la clé du seuil est absente ou invalide', () => {
    expect(normalizeSaleThreshold(undefined)).toBe(100);
    expect(normalizeSaleThreshold('abc')).toBe(100);
    expect(normalizeSaleThreshold(-4)).toBe(100);
    expect(normalizeSaleThreshold(25)).toBe(25);
    expect(parseBoutiqueConfig([])).toEqual({ threshold: 100, featuredCount: 3, freeWithoutThreshold: false });
    expect(parseBoutiqueConfig([
      { key: 'playlist_sale_follower_threshold', value: 10 },
      { key: 'boutique_featured_count', value: 9 },
      { key: 'playlist_sale_free_without_threshold', value: true },
    ])).toEqual({ threshold: 10, featuredCount: 3, freeWithoutThreshold: true });
    expect(normalizeFeaturedCount(5)).toBe(5);
  });

  it('propriétaire sans offre : bouton Créer, ou compteur N / seuil si verrouillé', () => {
    expect(boutiqueVitrineMode({ isOwner: true, offerCount: 0, followers: 120, threshold: 100 })).toBe('OWNER_CREATE');
    expect(boutiqueVitrineMode({ isOwner: true, offerCount: 0, followers: 0, threshold: 100 })).toBe('OWNER_LOCKED');
    expect(boutiqueVitrineMode({ isOwner: true, offerCount: 0, followers: 0, threshold: 100, freeWithoutThreshold: true })).toBe('OWNER_CREATE');
    const copy = boutiqueVitrineCopy('OWNER_LOCKED', { sellerName: 'adel', followers: 17, threshold: 100 });
    expect(copy.title).toBe('17 / 100 abonnés');
    expect(copy.body).toContain('83');
    expect(missingFollowers(150, 100)).toBe(0);
  });

  it("visiteur sans offre : « n'a rien en vente » + Suivre ; avec offres : vitrine", () => {
    expect(boutiqueVitrineMode({ isOwner: false, offerCount: 0, followers: 3, threshold: 100 })).toBe('VISITOR_EMPTY');
    const copy = boutiqueVitrineCopy('VISITOR_EMPTY', { sellerName: '@lia', followers: 3, threshold: 100 });
    expect(copy.title).toBe("@lia n'a rien en vente");
    expect(copy.cta).toBe('FOLLOW');
    expect(boutiqueVitrineMode({ isOwner: false, offerCount: 2, followers: 0, threshold: 100 })).toBe('SHOWCASE');
    expect(boutiqueVitrineMode({ isOwner: true, offerCount: 1, followers: 0, threshold: 100 })).toBe('SHOWCASE');
  });
});
