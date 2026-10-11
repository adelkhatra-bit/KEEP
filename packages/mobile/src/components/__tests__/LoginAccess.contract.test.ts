import fs from 'fs';
import path from 'path';

// Adel (29/09/2026) : « plutôt un bouton Se connecter qui mène directement à
// identifiant + mot de passe… un enfant de 10 ans doit comprendre » et « le
// lien partagé remet toujours sur le profil ».
const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', ...p), 'utf8');

describe('accès à la connexion', () => {
  const pill = read('components', 'LoginPill.tsx');
  const owner = read('screens', 'ProfilePublicScreen.tsx');
  const visitor = read('screens', 'PublicUserProfileScreen.tsx');
  const form = read('components', 'UsernameAccountForm.tsx');
  const handoff = read('components', 'SharedMusicHandoff.tsx');

  it('une pastille « Se connecter » ouvre la fenêtre de compte unique directement en connexion', () => {
    expect(pill).toContain("requestAccount('login', followUsername)");
    expect(owner).toContain('{accountRequired ? <View style={s.topBarRight}><LoginPill />');
    expect(visitor).toContain("{!effectiveViewerId ? <LoginPill /> : null}");
  });

  it('plus de pavé « Créer mon compte Loki Music » ni de fenêtre de compte en double sur le profil', () => {
    expect(owner).not.toContain('s.accountBanner');
    expect(owner).not.toContain('CONTINUER EN MODE DÉMO');
    expect(owner).not.toContain('<UsernameAccountForm');
    expect(owner).toContain('useAccountGateStore.getState().requestAccount(mode, followUsername)');
  });

  it('formulaire simple : « Se connecter », pseudo ou e-mail, et un vrai bouton pour créer un compte', () => {
    expect(form).toContain("'Se connecter'");
    expect(form).toContain('Pas encore de compte ?');
    expect(form).toContain("'CRÉER MON COMPTE'");
  });

  it('le lien partagé ne sert qu’une fois : ?u= est retiré de l’adresse après ouverture du profil', () => {
    expect(handoff).toContain('clearConsumedShareParams();');
    expect(handoff).toContain("url.searchParams.delete('u');");
  });
});
