import fs from 'fs';
import path from 'path';

// Adel 05/10/2026 : les nouveaux morceaux publics passent par les stories, la cloche est désencombrée.
const source = fs.readFileSync(path.join(__dirname, '..', 'notificationService.ts'), 'utf8');

describe('cloche désencombrée par les stories', () => {
  it('hides NEW_PUBLIC_KEEP from the list and from the unread counter, without deleting rows', () => {
    expect(source).toContain("new Set(['NEW_PUBLIC_KEEP'])");
    expect(source).toContain('!shouldSuppressNotificationPresentation(item) && !isStoryRoutedNotification(item)');
    expect(source).toContain('.filter((item) => !isStoryRoutedNotification(item))).length');
    expect(source).not.toMatch(/\.delete\(\)[^;]*NEW_PUBLIC_KEEP/);
  });
});
