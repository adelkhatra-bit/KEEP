import fs from 'fs';
import path from 'path';
import { eventNotFinished } from '../../services/creatorEventService';

describe('expired event status', () => {
  it('ends events without explicit end date after six hours', () => {
    expect(eventNotFinished({ startsAt: '2026-09-08T14:41:00Z', endsAt: null }, Date.parse('2026-10-12T10:00:00Z'))).toBe(false);
    expect(eventNotFinished({ startsAt: '2026-10-12T12:00:00Z', endsAt: null }, Date.parse('2026-10-12T14:00:00Z'))).toBe(true);
  });
  it('shows a red expired badge and does not present expired events as live or approved', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');
    expect(src).toContain('const isEventExpired = Boolean(currentEvent && !eventNotFinished(currentEvent))');
    expect(src).toContain('isEventExpired ? <View style={styles.expiredBadge}');
    expect(src).toContain('TERMINÉE · DATE PASSÉE');
    expect(src).toContain("isEventExpired && styles.expiredDate");
    expect(src).toContain("currentEvent.moderationStatus === 'APPROVED' && !isEventExpired");
  });
});
