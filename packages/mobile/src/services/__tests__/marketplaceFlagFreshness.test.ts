// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Bug réel (Adel, 21/09/2026) : "J'ai assigné 1000 abonnés virtuels via le
 * Super Admin ... la fonction reste verrouillée." Vérifié en base par
 * requête directe (Management API, contournant l'auth pour lire l'état
 * réel) : follower_count_override=1000, bypass de flag actif, tout est
 * correctement enregistré et la RPC keep_playlist_sale_access() lit déjà
 * l'override correctement (voir keep_playlist_sale_foundation.sql). Le
 * seul point qui pouvait faire rester la fonction verrouillée EN PRATIQUE
 * malgré des données correctes : marketplaceEnabled n'était recalculé
 * qu'au MONTAGE de l'écran (deps vides), jamais relu si le flag/bypass
 * changeait côté Super Admin pendant que l'écran était déjà ouvert -- il
 * fallait tuer et rouvrir l'app en entier pour voir l'effet. Corrigé en
 * recalculant aussi à chaque focus, comme le reste des données de vente.
 */
describe('marketplaceEnabled se recalcule à chaque focus d\'écran, pas seulement au montage (les 4 écrans qui le lisent)', () => {
  const files = [
    ['MyMusicScreen.tsx', path.resolve(__dirname, '..', '..', 'screens', 'MyMusicScreen.tsx')],
    ['ProfilePublicScreen.tsx', path.resolve(__dirname, '..', '..', 'screens', 'ProfilePublicScreen.tsx')],
    ['PublicUserProfileScreen.tsx', path.resolve(__dirname, '..', '..', 'screens', 'PublicUserProfileScreen.tsx')],
    ['PlaylistSalePanel.tsx', path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx')],
  ] as const;

  it.each(files)('%s re-checks isFeatureEnabled on every navigation focus, not just on mount', (_name, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    expect(source).toContain("navigation?.addListener?.('focus', check)");
    // La dépendance ne doit plus être un tableau vide (montage seul) --
    // navigation doit apparaître dans le tableau de dépendances de CET
    // effet précis, pas ailleurs dans le fichier.
    const effectStart = source.indexOf('const check = () => { isFeatureEnabled(\'playlist_marketplace\')');
    expect(effectStart).toBeGreaterThan(-1);
    const effectBlock = source.slice(effectStart, effectStart + 300);
    expect(effectBlock).toContain('}, [navigation]);');
  });
});

describe('Compteur "abonnés" -- deux nombres différents, par conception, pas une source de vérité cassée', () => {
  const saleFoundation = readNormalized(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260914080000_keep_playlist_sale_foundation.sql'));

  it('keep_playlist_sale_access() applies the test override to the sale-gate threshold check (this is the "1000" the popup should show)', () => {
    expect(saleFoundation).toContain('select p.follower_count_override into override from public.profiles p where p.id = uid;');
    expect(saleFoundation).toContain('if override is not null then follower_count := override; end if;');
  });

  // Le compteur public "Abonnés" affiché sur le profil (ProfilePublicScreen)
  // ne doit JAMAIS lire follower_count_override -- ce serait mentir sur un
  // chiffre public à tous les visiteurs du profil, pas seulement au
  // titulaire du compte. C'est documenté explicitement dans le Super Admin
  // ("n'affecte que ce compte, jamais ses vrais abonnés ni les autres
  // utilisateurs"). Les deux chiffres divergent donc PAR CONCEPTION --
  // "unifier" les deux romprait cette séparation volontaire.
  it('the public follower stat (profileFollowerCount) is computed independently and never reads the test override', () => {
    const profile = readNormalized(path.resolve(__dirname, '..', '..', 'screens', 'ProfilePublicScreen.tsx'));
    expect(profile).not.toContain('follower_count_override');
  });
});
