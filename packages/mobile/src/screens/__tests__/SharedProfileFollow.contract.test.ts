// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP shared profile follow handoff', () => {
  const share = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'share-profile.html'), 'utf8');
  const onboarding = fs.readFileSync(path.resolve(__dirname, '..', 'onboarding', 'OnboardingScreen.tsx'), 'utf8');

  it('never forces an existing user through account creation', () => {
    expect(share).toContain('SE CONNECTER / CRÉER POUR SUIVRE');
    expect(share).toContain("followAccountRoute(p.username,'login')");
    expect(onboarding).toContain("intent.mode || (intent.followUsername ? 'login' : 'create')");
  });

  it('uses the secured follow RPCs rather than direct follow mutations', () => {
    expect(share).toContain("on?'keep_unfollow_profile':'keep_follow_profile'");
    expect(share).not.toContain("await authed('follows',{method:'POST'");
    expect(share).not.toContain("{method:'DELETE'});else await authed('follows'");
  });

  it('cannot leave the public follow button locked forever', () => {
    expect(share).toContain('setTimeout(()=>controller.abort(),10000)');
    expect(share).toContain('finally{button.disabled=false;}');
    expect(share).toContain("button.textContent='UN INSTANT…'");
  });

  it('preserves the shared profile context across login', () => {
    expect(share).toContain('&share=profile');
    expect(share).toContain('&u=${encodeURIComponent(u)}');
    expect(share).toContain('__keep_follow=${encodeURIComponent(u)}');
  });
});
