import fs from 'fs';
import path from 'path';
import vm from 'vm';
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

  describe('garde produit Stories aligné sur les décisions du 06/10/2026', () => {
    const root = path.resolve(__dirname, '../../../../..');
    const guard = fs.readFileSync(path.join(root, 'scripts/verify-product-contract.cjs'), 'utf8');
    const barPath = 'packages/mobile/src/components/ProfileStoryBar.tsx';
    const visitedPath = 'packages/mobile/src/screens/PublicUserProfileScreen.tsx';

    function check(replacements: Record<string, (source: string) => string> = {}) {
      const errors: string[] = [];
      const guardedFs = {
        ...fs,
        readFileSync: (file: string, encoding: BufferEncoding) => {
          const source = fs.readFileSync(file, encoding);
          const replace = replacements[path.relative(root, file)];
          return replace ? replace(source) : source;
        },
      };
      vm.runInNewContext(guard, {
        require: (name: string) => name === 'fs' ? guardedFs : require(name),
        __dirname: path.join(root, 'scripts'),
        console: { log: () => {}, error: (message: string) => errors.push(message) },
        process: { exit: () => {} },
      });
      return errors;
    }

    it('accepte les bulles et le visiteur en lecture seule sans changer le rendu', () => {
      expect(check()).toEqual([]);
    });

    it('refuse la disparition du bouton accessible ou de sa destination', () => {
      for (const marker of ['Voir le profil de ${v.username}', 'onOpenProfile?.(v.username)']) {
        expect(check({ [barPath]: (source) => source.replace(marker, '') }).join('\n')).toContain('bouton accessible');
      }
    });

    it('refuse le retour du badge Abonné', () => {
      expect(check({ [barPath]: (source) => source.replace('>Profil ›<', '>Abonné<') }).join('\n')).toContain('bouton accessible');
    });

    it('refuse l’accès général des invités et le déblocage du mode démo', () => {
      for (const marker of ['(isLocalGuest && !shareVisitor)', 'isDemoMode || (isLocalGuest']) {
        expect(check({ [visitedPath]: (source) => source.replace(marker, '') }).join('\n')).toContain('invité ordinaire interdits');
      }
    });

    it('refuse la disparition de la porte de compte pour GARDER', () => {
      expect(check({ [visitedPath]: (source) => source.split("Alert.alert('Compte requis', 'Connecte-toi pour garder.'").join('') }).join('\n')).toContain('actions du visiteur');
    });

    it('refuse une exception qui ne garantit plus la lecture seule', () => {
      expect(check({
        'config/keep-product-contract.json': (source) => source.replace('"sharedLinkVisitorReadOnly": true', '"sharedLinkVisitorReadOnly": false'),
      }).join('\n')).toContain('exception du lien partagé limitée');
    });
  });
  it('jamais en démo ni invité local, sur le profil propre comme sur un profil visité', () => {
    const own = read('screens', 'ProfilePublicScreen.tsx');
    expect(own).toContain('!accountRequired && !isDemoMode && !isLocalGuest && storiesUnlocked');
    const visited = read('screens', 'PublicUserProfileScreen.tsx');
    // Exception d'Adel (06/10/2026) : le visiteur d'un lien partagé voit la story en lecture seule.
    expect(visited).toContain('(isLocalGuest && !shareVisitor)');
    expect(visited).toContain('const shareVisitor = isLocalGuest && isWebShareVisit();');
    expect(visited).toContain('loadStoryAccess()');
  });
  it('suggestions d\'amis par style : source serveur unique, jamais les membres déjà suivis ou liés', () => {
    const svc = read('services', 'musicStoriesService.ts');
    expect(svc).toContain("rpc('keep_discovery_match_candidates'");
    const bar = read('components', 'ProfileStoryBar.tsx');
    expect(bar).toContain('loadStyleSuggestions(viewer.id, [...relations.following, ...relations.others])');
    expect(read('components', 'MusicStoryRail.tsx')).toContain('styleSuggestions');
  });
});
