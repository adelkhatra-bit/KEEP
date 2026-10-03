import fs from 'fs';
import path from 'path';

describe('Single notification presentation contract', () => {
  const push = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'pushNotificationService.ts'), 'utf8');
  const banner = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'GlobalNotificationBanner.tsx'), 'utf8');
  const screen = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8');

  it('uses only GlobalNotificationBanner for in-app web presentation', () => {
    expect(push).toContain("reason: 'web_in_app_banner_owned_by_global_notification_banner'");
    expect(push).not.toContain('keep-live-notification-toast');
    expect(push).not.toContain('startWebRealtimeNotificationBridge');
    expect(push).not.toContain('showWebKeepToast');
  });

  it('deduplicates different DB rows that represent the same business event', () => {
    expect(banner).toContain('notificationSemanticKey(notification)');
    expect(banner).toContain('30 * 60 * 1000');
    expect(screen).toContain('dedupeNotifications([notification, ...current.filter');
  });

  it('normalizes legacy KEEP wording and protects QR/payment notifications on delete', () => {
    const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'notificationService.ts'), 'utf8');
    expect(service).toContain('normalizeNotificationVisibleText');
    expect(service).toContain('decodeVisibleEntities');
    expect(service).toContain(".replace(/&hearts?;/gi, '♥')");
    expect(service).toContain(".replace(/\\bKEEP\\b/g, 'Loki')");
    expect(screen).toContain('isSensitivePaymentNotification');
    expect(screen).toContain("contentKind === 'PAYPAL_QR'");
    expect(screen).toContain('sensitiveWithoutPaymentId');
  });

  it('shows PayPal QR media in the quick notification panel and never exposes transport tokens', () => {
    const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx'), 'utf8');
    const agora = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'musicAgoraService.ts'), 'utf8');
    expect(panel).toContain('notificationImageUrl');
    expect(panel).toContain('QR PAYPAL');
    expect(panel).toContain('notificationMediaImage');
    expect(agora).toContain("PAYPAL_QR_PREFIXES.some((prefix) => raw.startsWith(prefix))");
    expect(agora).toContain("return 'QR PayPal partagé'");
  });

  it('always enters from the top and leaves through the top', () => {
    expect(banner).toContain('const OFFSCREEN_TOP = -260');
    expect(banner).toContain('new Animated.Value(OFFSCREEN_TOP)');
    expect(banner).toContain('toValue: OFFSCREEN_TOP');
    expect(banner).toContain('transform: [{ translateY }]');
    expect(banner).not.toContain('translateX');
  });
});
