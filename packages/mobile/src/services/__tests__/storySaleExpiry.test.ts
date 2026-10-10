jest.mock('../supabaseClient', () => ({ supabase: null }));
import fs from 'fs';
import path from 'path';
import { hasFreshSaleOffer } from '../musicStoriesService';

describe('Story 24 h : la boutique ne rallume plus la story indéfiniment (Adel 10/10/2026)', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  it('offre de plus de 24 h = pas de carte boutique en story', () => {
    expect(hasFreshSaleOffer([{ createdAt: '2026-09-29T00:43:11Z' }, { createdAt: '2026-10-02T10:56:28Z' }], now)).toBe(false);
    expect(hasFreshSaleOffer([{ createdAt: '2026-10-02T10:56:28Z' }, { createdAt: '2026-10-10T08:00:00Z' }], now)).toBe(true);
    expect(hasFreshSaleOffer(undefined, now)).toBe(false);
    expect(hasFreshSaleOffer([{}], now)).toBe(false);
  });
  it('appliqué aux stories suivies, à ma story, et purge minute par minute', () => {
    const svc = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
    expect(svc).toContain("hasFreshSaleOffer(offersBySeller.get(story.profileId))");
    expect(svc).toContain('hasFreshSaleOffer(offersBySeller.get(id))');
    const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
    expect(bar).toContain('}, 60000);');
    expect(bar).toContain('pruneExpiredStory(story)');
  });
});
