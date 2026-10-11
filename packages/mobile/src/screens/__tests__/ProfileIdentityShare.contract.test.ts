// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8');

describe('Loki Music identity card + affiliated share contract', () => {
  const profile = read('..', 'ProfilePublicScreen.tsx');
  const sharing = read('..', '..', 'services', 'sharingService.ts');
  const landing = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'share-profile.html'), 'utf8');
  const battle = read('..', '..', 'components', 'KeepBattleMobileGameV3.tsx');

  it('attaches the real referral code before sharing every Loki link', () => {
    expect(sharing).toContain("import { appendReferralToLink, loadMyReferralCode } from './referralService'");
    expect(sharing).toContain('async function attachReferral(copy: ShareCopy)');
    expect(sharing).toContain('loadMyReferralCode()');
    expect(sharing).toContain('appendReferralToLink(copy.link, code)');
    expect(sharing).toContain('attachReferral(buildTrackCopy');
    expect(sharing).toContain("attachReferral(buildContextCopy('session'");
    expect(sharing).toContain("attachReferral(buildContextCopy('vibe'");
    expect(sharing).toContain("attachReferral(buildContextCopy('compare'");
    expect(sharing).toContain("attachReferral(buildContextCopy('event'");
    expect(sharing).toContain("attachReferral(buildContextCopy('battle'");
  });

  it('preserves referral attribution through the public landing and native/web handoff', () => {
    expect(landing).toContain("const referral=(params.get('ref')||'').trim()");
    expect(landing).toContain('const referralSuffix=()=>referral?');
    expect(landing).toContain('share=profile');
    expect(landing).toContain('referralSuffix()');
  });

  it('renders a social-ready musical identity card', () => {
    expect(profile).toContain('IDENTITÉ MUSICALE');
    expect(profile).toContain('MUSIC ID');
    expect(profile).toContain('SCAN · DÉCOUVRE · SWIPE');
    expect(profile).toContain('profileTotalKeepCount');
    expect(profile).toContain('profileFollowerCount');
    expect(profile).toContain('displayPlaylists.length');
    expect(profile).toContain('<QRCode value={publicProfileLink}');
    expect(profile).toContain('buildAffiliatedPublicProfileLink(user.username)');
  });

  it('routes Battle invitations through the affiliated share service', () => {
    expect(battle).toContain('shareBattleInvite');
    expect(battle).not.toContain('Share.share({');
    expect(sharing).toContain('export async function shareBattleInvite');
  });
});
