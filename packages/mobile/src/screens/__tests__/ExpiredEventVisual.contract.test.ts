import fs from 'fs';
import path from 'path';

describe('Expired events share the same status on web and iOS', () => {
  const screen = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'creatorEventService.ts'), 'utf8');

  it('uses the shared six-hour fallback for events without endsAt', () => {
    expect(service).toContain('start + 6 * 3600000');
    expect(service).toContain('end > now');
    expect(screen).toContain('!eventNotFinished(currentEvent)');
  });
  it('marks expired events red and prevents a false live/validated status', () => {
    expect(screen).toContain('TERMINÉE · DATE PASSÉE');
    expect(screen).toContain('testID="event-expired-badge"');
    expect(screen).toContain('isEventExpired && styles.expiredDate');
    expect(screen).toContain("currentEvent.moderationStatus === 'APPROVED' && !isEventExpired");
    expect(screen).toContain('!isEventExpired && Date.parse(currentEvent.startsAt) <= Date.now()');
  });
});
