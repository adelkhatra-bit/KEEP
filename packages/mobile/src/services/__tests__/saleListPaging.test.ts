import { nextSaleVisibleCount, SALE_ROWS_INITIAL, splitSaleOffersByStatus } from '../saleListPaging';

describe('saleListPaging', () => {
  it('3 collections puis +10 par VOIR PLUS, puis retour à 3', () => {
    expect(SALE_ROWS_INITIAL).toBe(3);
    expect(nextSaleVisibleCount(3, 25)).toBe(13);
    expect(nextSaleVisibleCount(13, 25)).toBe(23);
    expect(nextSaleVisibleCount(23, 25)).toBe(25);
    expect(nextSaleVisibleCount(25, 25)).toBe(3);
  });
  it('sépare publiées et retirées, la collection ciblée en tête', () => {
    const offers = [
      { offerId: 'a', playlistId: 'pa', isActive: false },
      { offerId: 'b', playlistId: 'pb', isActive: true },
      { offerId: 'c', playlistId: 'pc', isActive: true },
      { offerId: 'd', playlistId: 'pd', isActive: false },
    ];
    const { published, retired } = splitSaleOffersByStatus(offers, 'c');
    expect(published.map((o) => o.offerId)).toEqual(['c', 'b']);
    expect(retired.map((o) => o.offerId)).toEqual(['a', 'd']);
    expect(splitSaleOffersByStatus(offers).published.map((o) => o.offerId)).toEqual(['b', 'c']);
  });
});
