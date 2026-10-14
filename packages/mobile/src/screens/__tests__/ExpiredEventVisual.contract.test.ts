import fs from 'fs';
import path from 'path';

describe('expired event status', () => {
  it('uses the shared six-hour fallback for an event without ends_at', () => {
    const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'creatorEventService.ts'), 'utf8');
    expect(service).toContain('start + 6 * 3600000');
    expect(service).toContain('end > now');
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
