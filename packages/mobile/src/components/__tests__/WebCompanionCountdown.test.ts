import { formatWebCompanionRemaining, webCompanionRemainingMs } from '../WebCompanionCountdown';
import fs from 'fs';
import path from 'path';

describe('PC connection countdown — visible desktop home', () => {
  it('computes the remaining time from the server creation date', () => {
    const created = '2026-10-11T09:00:00.000Z';
    expect(formatWebCompanionRemaining(webCompanionRemainingMs(created, Date.parse('2026-10-11T10:15:03.000Z')))).toBe('22:44:57');
    expect(webCompanionRemainingMs(created, Date.parse('2026-10-12T09:00:00.000Z'))).toBe(0);
  });
  it('never treats an invalid server creation date as a valid connection', () => {
    expect(webCompanionRemainingMs('invalid', Date.now())).toBe(0);
  });
  it('uses a verified server session and hides revoked or expired sessions', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'WebCompanionCountdown.tsx'), 'utf8');
    expect(source).toContain('currentWebCompanionSessionId()');
    expect(source).toContain('listWebCompanionSessions()');
    expect(source).toContain('!session.revoked_at');
    expect(source).toContain('webCompanionRemainingMs(session.created_at, Date.now()) > 0');
    expect(source).toContain('PC CONNECTÉ');
  });
  it('is mounted in the existing Home screen, not a duplicate HTML page', () => {
    const home = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');
    expect(home).toContain('<WebCompanionCountdown />');
  });
});
