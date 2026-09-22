// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Adel (22/09/2026) : "KEEP" utilisé comme verbe/mécanique dans du texte
 * visible à l'écran (badge "1er KEEP", "a été le premier à KEEP ce son",
 * compteur "N KEEPs", nom de playlist par défaut "Mes KEEP") devient
 * "garder"/"gardé" partout où c'est affiché à l'utilisateur. Les
 * identifiants techniques internes (tables/fonctions Supabase `keep_*`,
 * schéma d'URL `keep://`, variables d'environnement, types TypeScript,
 * tags de données) ne sont volontairement PAS touchés -- voir le test de
 * non-régression en bas de ce fichier.
 */
describe('Branding -- "KEEP" verbe remplacé par "garder"/"gardé" dans l\'UI visible', () => {
  const profilePublic = readNormalized(__dirname, '..', 'ProfilePublicScreen.tsx');
  const publicUserProfile = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const myMusic = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const sessionRecap = readNormalized(__dirname, '..', 'SessionRecapScreen.tsx');
  const keepTrackAction = readNormalized(__dirname, '..', '..', 'services', 'keepTrackAction.ts');
  const keepLibraryService = readNormalized(__dirname, '..', '..', 'services', 'keepLibraryService.ts');
  const connectedMusicLibrary = readNormalized(__dirname, '..', '..', 'services', 'connectedMusicLibrary.ts');

  it('le badge "1er KEEP" devient "1er Gardé" sur les deux écrans de profil', () => {
    expect(profilePublic).toContain('🥇 1er Gardé');
    expect(publicUserProfile).toContain('🥇 1er Gardé');
    expect(profilePublic).not.toContain('firstKeepBadgeText}>🥇 1er KEEP');
    expect(publicUserProfile).not.toContain('firstKeepBadgeText}>🥇 1er KEEP');
  });

  it('le compteur "N KEEPs" devient "N gardés"', () => {
    expect(profilePublic).toContain('{impact!.recoveryCount + 1} gardés');
    expect(publicUserProfile).toContain('{discoveryImpact!.recoveryCount + 1} gardés');
    expect(profilePublic).not.toContain('recoveryCount + 1} KEEPs');
    expect(publicUserProfile).not.toContain('recoveryCount + 1} KEEPs');
  });

  it('"a été le premier à KEEP ce son" devient "a été le premier à garder ce son"', () => {
    expect(profilePublic).toContain('a été le premier à garder ce son');
    expect(publicUserProfile).toContain('a été le premier à garder ce son');
  });

  it('la popup post-achat MyMusicScreen mentionne "1er Gardé", plus "1er KEEP"', () => {
    expect(myMusic).toContain('🥇 1er Gardé');
    expect(myMusic).not.toContain('1er KEEP');
  });

  it('SessionRecapScreen : "Ton premier Keep !" devient "Ton premier Gardé !"', () => {
    expect(sessionRecap).toContain('🎉 Ton premier Gardé !');
    expect(sessionRecap).not.toContain('premier Keep');
  });

  it('le nom de playlist par défaut "Mes KEEP" devient "Mes Gardés" (visible dans Spotify/Apple Music si créée)', () => {
    expect(keepTrackAction).toContain("'Mes Gardés'");
    expect(keepLibraryService).toContain("'Mes Gardés'");
    expect(connectedMusicLibrary).toContain("'Mes Gardés'");
    expect(keepTrackAction).not.toContain("'Mes KEEP'");
    expect(keepLibraryService).not.toContain("'Mes KEEP'");
    expect(connectedMusicLibrary).not.toContain("'Mes KEEP'");
  });
});

describe('Non-régression : les identifiants techniques internes gardent "KEEP"/"keep" (jamais renommés)', () => {
  const navigation = readNormalized(__dirname, '..', '..', 'navigation', 'Navigation.tsx');
  const keepBattleService = readNormalized(__dirname, '..', '..', 'services', 'keepBattleService.ts');
  const pushNotificationService = readNormalized(__dirname, '..', '..', 'services', 'pushNotificationService.ts');

  it("le schéma d'URL keep:// et le chemin GitHub Pages /KEEP restent inchangés", () => {
    expect(navigation).toContain("prefixes: ['keep://', 'https://adelkhatra-bit.github.io/KEEP'],");
    expect(navigation).toContain("const GITHUB_PAGES_BASE_PATH = '/KEEP';");
  });

  it('le type de décision Battle KeepBattleDecision (\'KEEP\' | \'PASS\') reste un identifiant technique', () => {
    expect(keepBattleService).toContain("export type KeepBattleDecision = 'KEEP' | 'PASS';");
  });

  it("l'action de notification push 'KEEP' | 'PASS' reste un identifiant technique", () => {
    expect(pushNotificationService).toContain("handler: (action: 'KEEP' | 'PASS', entryId: string) => void | Promise<void>,");
  });
});
