// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Loki shared profile follow handoff', () => {
  const share = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'share-profile.html'), 'utf8');
  const onboarding = fs.readFileSync(path.resolve(__dirname, '..', 'onboarding', 'OnboardingScreen.tsx'), 'utf8');

  it('never forces an existing user through account creation', () => {
    expect(share).toContain('SE CONNECTER / CRÉER POUR SUIVRE');
    // Adel (08/09/2026) : "il faut pas qu'il soit redirigé, il faut qu'il
    // reste au même endroit" -- le tap sur "+ SUIVRE" sans session ouvre une
    // pop-up EN PLACE (deux onglets, création ET connexion), plus jamais un
    // location.href vers une autre page.
    expect(share).toContain("button.onclick=()=>{openAuthOverlay('login');};");
    expect(share).toContain('data-mode="signup"');
    expect(share).toContain('data-mode="login"');
    expect(share).not.toContain('location.href=followAccountRoute');
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

  it('opens the native app directly on the shared profile and preserves referral context', () => {
    expect(share).toContain('keep://profile/${encodeURIComponent(clean)}');
    expect(share).toContain('?u=${encodeURIComponent(clean)}&share=profile');
    expect(share).not.toContain('__keep_route');
  });

  it('preserves the shared profile follow intent without ever leaving the page', () => {
    // Adel (08/09/2026) : plus de redirection = plus de query string
    // __keep_follow/u/share à faire transiter -- l'intention de suivre est
    // désormais garantie par le serveur lui-même (déclencheur sur
    // pending_follow_username à l'inscription) ou rejouée explicitement
    // juste après une connexion réussie, jamais perdue en changeant de page.
    expect(share).toContain('pendingFollowUsername:currentProfile.username');
    expect(share).toContain('await followNow(currentProfile,auth)');
    expect(share).not.toContain('__keep_follow');
  });
});
