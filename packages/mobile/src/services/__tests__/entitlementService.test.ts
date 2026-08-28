import { hasFeature, requiredPlan } from '../entitlementService';

describe('KEEP entitlements', () => {
  test('FREE access', () => {
    expect(hasFeature('FREE', 'PROFILE_SHARE')).toBe(true);
    expect(hasFeature('FREE', 'PUBLIC_PLAYLISTS')).toBe(false);
    expect(hasFeature('FREE', 'SOCIAL_DISCOVERY')).toBe(false);
    expect(hasFeature('FREE', 'CREATE_EVENT')).toBe(false);
  });

  test('PREMIUM access', () => {
    expect(hasFeature('PREMIUM', 'PROFILE_SHARE')).toBe(true);
    expect(hasFeature('PREMIUM', 'PUBLIC_PLAYLISTS')).toBe(true);
    expect(hasFeature('PREMIUM', 'SOCIAL_DISCOVERY')).toBe(true);
    expect(hasFeature('PREMIUM', 'CREATE_EVENT')).toBe(false);
  });

  test('CREATOR_PRO access', () => {
    expect(hasFeature('CREATOR_PRO', 'CREATOR_KIND')).toBe(true);
    expect(hasFeature('CREATOR_PRO', 'CREATE_EVENT')).toBe(true);
    expect(hasFeature('CREATOR_PRO', 'BROADCAST_FOLLOWERS')).toBe(true);
    expect(hasFeature('CREATOR_PRO', 'CREATOR_ANALYTICS')).toBe(true);
    expect(hasFeature('CREATOR_PRO', 'VENUE_KIND')).toBe(false);
  });

  test('VENUE_PRO access', () => {
    expect(hasFeature('VENUE_PRO', 'PROFILE_SHARE')).toBe(true);
    expect(hasFeature('VENUE_PRO', 'PUBLIC_PLAYLISTS')).toBe(true);
    expect(hasFeature('VENUE_PRO', 'SOCIAL_DISCOVERY')).toBe(true);
    expect(hasFeature('VENUE_PRO', 'CREATOR_KIND')).toBe(true);
    expect(hasFeature('VENUE_PRO', 'VENUE_KIND')).toBe(true);
    expect(hasFeature('VENUE_PRO', 'CREATE_EVENT')).toBe(true);
  });

  test('required plan contract', () => {
    expect(requiredPlan('PROFILE_SHARE')).toBe('FREE');
    expect(requiredPlan('PUBLIC_PLAYLISTS')).toBe('PREMIUM');
    expect(requiredPlan('SOCIAL_DISCOVERY')).toBe('PREMIUM');
    expect(requiredPlan('CREATE_EVENT')).toBe('CREATOR_PRO');
    expect(requiredPlan('VENUE_KIND')).toBe('VENUE_PRO');
  });
});
