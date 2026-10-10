import { DORMANT_AFTER_DAYS, isDormantMember } from '../storyActivity';
describe('isDormantMember', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('actif récemment = pas endormi', () => { expect(isDormantMember('2026-10-04T12:00:00Z', now)).toBe(false); });
  it('inconnu ou > 7 jours = endormi (bulle masquée)', () => {
    expect(DORMANT_AFTER_DAYS).toBe(7);
    expect(isDormantMember(null, now)).toBe(true);
    expect(isDormantMember('2026-09-01T00:00:00Z', now)).toBe(true);
    expect(isDormantMember('2026-09-28T00:00:00Z', now)).toBe(true);
    expect(isDormantMember('2026-09-30T12:00:00Z', now)).toBe(false);
  });
});
