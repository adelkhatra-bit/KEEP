import { DORMANT_AFTER_DAYS, isDormantMember } from '../storyActivity';
describe('isDormantMember', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('actif récemment = pas endormi', () => { expect(isDormantMember('2026-10-04T12:00:00Z', now)).toBe(false); });
  it('inconnu ou > 14 jours = endormi', () => {
    expect(DORMANT_AFTER_DAYS).toBe(14);
    expect(isDormantMember(null, now)).toBe(true);
    expect(isDormantMember('2026-09-01T00:00:00Z', now)).toBe(true);
  });
});
