// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Soirées moderation status visual contract', () => {
  const parties = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');

  it('shows pending moderation in blinking danger/red, never as green live', () => {
    expect(parties).toContain("currentEvent.moderationStatus === 'PENDING' ? <PendingModerationBadge />");
    expect(parties).toContain('<Text style={styles.pendingBadgeText}>● EN ATTENTE</Text>');
    expect(parties).toContain('Animated.timing(blink, { toValue: 0.25');
    expect(parties).toContain('pendingBadge:{');
    expect(parties).toContain('borderColor:colors.danger');
    expect(parties).toContain('pendingBadgeText:{color:colors.danger');
  });

  it('keeps rejected red and approved green', () => {
    expect(parties).toContain("currentEvent.moderationStatus === 'REJECTED'");
    expect(parties).toContain('✕ REFUSÉE');
    expect(parties).toContain('rejectedBadgeText:{color:colors.danger');
    expect(parties).toContain("currentEvent.moderationStatus === 'APPROVED'");
    expect(parties).toContain('✓ VALIDÉE');
    expect(parties).toContain('approvedBadgeText:{color:colors.success');
  });

  it('shows EN COURS only for an approved event', () => {
    expect(parties).toContain("isEventLive && currentEvent.moderationStatus === 'APPROVED' ? <LivePulseBadge />");
  });
});
