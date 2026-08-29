// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP profile deep-link + referral lifecycle', () => {
  const handoff = fs.readFileSync(path.resolve(__dirname, '..', 'SharedMusicHandoff.tsx'), 'utf8');
  const referral = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'referralService.ts'), 'utf8');
  const navigation = fs.readFileSync(path.resolve(__dirname, '..', '..', 'navigation', 'Navigation.tsx'), 'utf8');
  const sharing = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'sharingService.ts'), 'utf8');

  it('maps native profile links to the existing public profile route without changing navigation', () => {
    expect(navigation).toContain("PublicProfile: 'profile/:username'");
    expect(sharing).toContain("buildShareLanding({ u: cleanUsername(username), share: 'profile' })");
    expect(sharing).toContain('`${WEB_URL}/share-profile/');
  });

  it('stages both cold and warm profile/referral links', () => {
    expect(handoff).toContain('Linking.getInitialURL()');
    expect(handoff).toContain("Linking.addEventListener('url'");
    expect(handoff).toContain('stageReferralFromUrl(url)');
    expect(handoff).toContain("event === 'SIGNED_IN' || event === 'INITIAL_SESSION'");
    expect(handoff).toContain('claimPendingReferral()');
  });

  it('recognizes profile-share usernames as referral aliases', () => {
    expect(referral).toContain("decodeURIComponent(share[1]).toLowerCase() === 'profile'");
    expect(referral).toContain('decodeURIComponent(profile[1])');
  });
});
