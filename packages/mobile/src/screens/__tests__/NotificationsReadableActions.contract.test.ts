import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Notifications readable-action contract', () => {
  it('keeps frequent notification controls at least 44pt tall', () => {
    expect(source).toContain('chatOpenButton:{minHeight:44');
    expect(source).toContain('chatChooseButton:{minHeight:44');
    expect(source).toContain('chatSurfaceChip:{minHeight:44');
    expect(source).toContain('notificationActionButton: { minHeight: 44');
    expect(source).toContain("cancelPaymentButton:{width:'100%',minHeight:44");
    expect(source).toContain("detailYoutube: { alignSelf: 'flex-start', marginTop: 14, minHeight: 44");
  });

  const sizeOf = (style: string) => {
    const match = source.match(new RegExp(`${style}:\\s*\\{[^}]*?fontSize:\\s*(\\d+(?:\\.\\d+)?)`));
    return match ? Number(match[1]) : 0;
  };

  it('does not use muted gray or tiny labels for interactive notification controls (Adel 05/10/2026 : écriture plus grande)', () => {
    for (const style of ['chatSurfaceChipText', 'notificationActionButtonText', 'rsvpButtonText', 'readAction', 'deleteOneText']) {
      expect(sizeOf(style)).toBeGreaterThanOrEqual(11);
    }
    for (const style of ['notificationActionButtonText', 'readAction', 'deleteOneText', 'cardMoreLink', 'cardProfileLink']) {
      expect(sizeOf(style)).toBeGreaterThanOrEqual(13);
    }
    expect(sizeOf('cardBody')).toBeGreaterThanOrEqual(14);
    expect(sizeOf('cardTitle')).toBeGreaterThanOrEqual(16);
  });

  it('never shows more than 2 lines of notification text: the rest goes behind « En savoir plus »', () => {
    expect(source).toContain('numberOfLines={expandedNotificationIds.has(item.id) ? undefined : 2}');
    expect(source).toContain("'En savoir plus ›'");
    expect(source).not.toMatch(/styles\.cardBody\} numberOfLines=\{3\}/);
  });
});
