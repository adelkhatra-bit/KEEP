const fs = require('fs');
const path = require('path');

function read(...parts: string[]) {
  return fs.readFileSync(path.join(...parts), 'utf8');
}

describe('notification preview network safety contract', () => {
  const panel = read(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx');
  const banner = read(__dirname, '..', '..', 'components', 'GlobalNotificationBanner.tsx');

  it('keeps the bell visual in demo mode without querying Supabase as demo-user-1', () => {
    expect(panel).toContain("useUserStore((state) => state.isDemoMode)");
    expect(panel).toContain("if (isDemoMode) {");
    expect(panel).toContain("setChatEnabled(true)");
    expect(panel).toContain("CHAT_SURFACE_OPTIONS.map((item) => item.key)");
    expect(panel).toContain("const unsub = isDemoMode");
  });

  it('keeps real notification writes disabled in demo mode', () => {
    expect(panel).toContain("if (!isDemoMode) await markNotificationRead");
    expect(panel).toContain("if (!isDemoMode) await Promise.all(visibleIds.map((id) => markNotificationRead");
    expect(panel).toContain("if (!isDemoMode) await saveNotificationPreferences");
    expect(panel).toContain("if (!isDemoMode) void saveMusicAgoraPosition");
  });

  it('keeps the global banner silent in demo mode too', () => {
    expect(banner).toContain("if (!user || isDemoMode || isLocalGuest)");
    expect(banner).toContain("if (!user || isDemoMode || isLocalGuest) return null");
  });
});
