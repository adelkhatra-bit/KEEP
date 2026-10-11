import fs from 'fs';
import path from 'path';

// Adel (02/10/2026) : les comptes de test ne doivent pas être visibles des
// utilisateurs. La recherche « inviter dans un groupe » doit respecter
// discovery_hidden (sauf lien d'abonnement existant).
const migration = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261003004000_group_people_search_hides_hidden_profiles.sql'),
  'utf8',
);

describe('recherche de personnes du tchat', () => {
  it('hides discovery_hidden profiles unless a follow link exists', () => {
    expect(migration).toContain('coalesce(p.discovery_hidden, false) = false');
    expect(migration).toContain('(f.follower_id = auth.uid() and f.followee_id = p.id)');
  });

  it('keeps public-only and block rules', () => {
    expect(migration).toContain('and p.is_public = true');
    expect(migration).toContain('from public.user_blocks b');
  });
});
