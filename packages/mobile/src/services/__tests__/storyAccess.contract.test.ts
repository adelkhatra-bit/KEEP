import fs from 'fs';
import path from 'path';
import { isStoryAccountEligible } from '../storyEligibility';
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

describe('Stories + suggestions : comptes réels avec e-mail vérifié uniquement (Adel 05/10/2026)', () => {
  it('éligible = compte non anonyme avec e-mail confirmé', () => {
    expect(isStoryAccountEligible({ email: 'a@b.fr', email_confirmed_at: '2026-10-01T00:00:00Z', is_anonymous: false })).toBe(true);
    expect(isStoryAccountEligible({ email: 'a@b.fr', email_confirmed_at: null })).toBe(false);
    expect(isStoryAccountEligible({ email: '', email_confirmed_at: '2026-10-01T00:00:00Z' })).toBe(false);
    expect(isStoryAccountEligible({ email: 'a@b.fr', email_confirmed_at: '2026-10-01T00:00:00Z', is_anonymous: true })).toBe(false);
    expect(isStoryAccountEligible(null)).toBe(false);
  });
  it('jamais en démo ni invité local, sur le profil propre comme sur un profil visité', () => {
    const own = read('screens', 'ProfilePublicScreen.tsx');
    expect(own).toContain('!accountRequired && !isDemoMode && !isLocalGuest && storiesUnlocked');
    const visited = read('screens', 'PublicUserProfileScreen.tsx');
    expect(visited).toContain('isDemoMode || isLocalGuest || !effectiveViewerId');
    expect(visited).toContain('loadStoryAccess()');
  });
  it('suggestions d\'amis par style : source serveur unique, jamais les membres déjà suivis ou liés', () => {
    const svc = read('services', 'musicStoriesService.ts');
    expect(svc).toContain("rpc('keep_discovery_match_candidates'");
    const bar = read('components', 'ProfileStoryBar.tsx');
    expect(bar).toContain('loadStyleSuggestions(viewer.id, [...relations.following, ...relations.others, ...storyIds])');
    expect(read('components', 'MusicStoryRail.tsx')).toContain('styleSuggestions');
  });
});
