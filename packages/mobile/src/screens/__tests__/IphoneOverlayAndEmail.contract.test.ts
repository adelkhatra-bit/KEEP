// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('iPhone overlays and email contract', () => {
  const profile = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');
  const publicProfile = fs.readFileSync(path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'), 'utf8');
  const settings = fs.readFileSync(path.resolve(__dirname, '..', 'ProfileSettingsMobileScreen.tsx'), 'utf8');
  const accountGate = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'AccountGateModal.tsx'), 'utf8');
  const quickView = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'SourceProfileQuickView.tsx'), 'utf8');
  const navigation = fs.readFileSync(path.resolve(__dirname, '..', '..', 'navigation', 'Navigation.tsx'), 'utf8');
  const listen = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');
  const accountEmail = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'accountEmailService.ts'), 'utf8');

  it('centers the remaining iPhone popups instead of anchoring them to the bottom', () => {
    expect(profile).toContain("justifyContent:'center'");
    expect(publicProfile).toContain("justifyContent:'center'");
    expect(settings).toContain("justifyContent:'center'");
    expect(accountGate).toContain("justifyContent: 'center'");
    expect(quickView).toContain("justifyContent:'center'");
  });

  it('keeps the tab bar safe-area aware and slightly taller on iPhone', () => {
    expect(navigation).toContain('useSafeAreaInsets');
    expect(navigation).toContain('height: 58 + Math.max(insets.bottom, 10)');
    expect(navigation).toContain('paddingBottom: Math.max(insets.bottom, 10)');
  });

  it('drops the detected music label a bit lower below the animation', () => {
    expect(listen).toContain("marginTop: 18");
    expect(listen).toContain("marginBottom: 8");
  });

  it('reads keep-account-email errors from the raw Edge Function response', () => {
    expect(accountEmail).toContain("/functions/v1/keep-account-email");
    expect(accountEmail).toContain('getSupabaseAccessToken');
    expect(accountEmail).toContain("if (!response.ok || !data?.ok)");
  });
});
