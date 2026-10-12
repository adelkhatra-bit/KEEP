import fs from 'fs';
import path from 'path';

const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'WebCompanionSessionsPanel.tsx'), 'utf8');

describe('PC destination picker and safe social sharing', () => {
  it('shows the destination popup on both the quick action and the native sessions panel', () => {
    expect(panel).toContain('const destinationModal = <KeepModal');
    expect(panel).toContain('PC ↗ Transférer ou partager');
    expect(panel).toContain('Où veux-tu partager ?');
    expect(panel).toContain('{destinationModal}');
  });
  it('lists only valid online QR-authorized PC sessions and never guesses a PC', () => {
    expect(panel).toContain('listWebCompanionSessions()');
    expect(panel).toContain('pcShareHoursLeft(session.created_at) > 0');
    expect(panel).toContain('Date.now() - new Date(session.last_seen_at).getTime() < 60000');
    expect(panel).toContain('destinationSessions.map((session, index)');
    expect(panel).toContain('requestWebCompanionScreen(session.id, screen)');
    expect(panel).toContain('Impossible de vérifier les PC.');
  });
  it('sends only the public profile link to WhatsApp or e-mail, not a pairing QR', () => {
    expect(panel).toContain('buildAffiliatedPublicProfileLink(username)');
    expect(panel).toContain('shareProfileByEmail(username)');
    expect(panel).toContain('https://api.whatsapp.com/send?text=');
    expect(panel).not.toContain('challenge.qrUrl');
    expect(panel).not.toContain('session.access_token');
  });
});
