import fs from 'fs';
import path from 'path';
import { __resetReportSurfaceForTests, pushReportSurface } from '../reportSurface';
import { __resetRobotScreenContextForTests, buildRobotScreenContext, contextRules, publishRobotScreenState } from '../robotScreenContext';
import { scenarioForRoute } from '../robotSectionScenario';

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...p), 'utf8');

beforeEach(() => { __resetRobotScreenContextForTests(); __resetReportSurfaceForTests(); });

describe('Robot Lia : contexte d\'écran déclaratif (Lot 6)', () => {
  it('profil propriétaire vide et vente ouverte -> « Crée ta boutique » avec une action en un clic', () => {
    const rules = contextRules({ section: 'PROFILE', state: { isOwnerProfile: true, offerCount: 0, followers: 120, saleThreshold: 100 } });
    expect(rules[0].id).toBe('SHOP_EMPTY');
    expect(rules[0].text).toContain('Crée ta boutique');
    expect(rules[0].actions[0]).toMatchObject({ key: 'SELL', route: 'PlaylistSale' });
  });

  it('boutique verrouillée -> « Il te manque N abonnés » ; le réglage « sans seuil » ouvre la vente', () => {
    const locked = contextRules({ section: 'PROFILE', state: { isOwnerProfile: true, offerCount: 0, followers: 17, saleThreshold: 100 } });
    expect(locked[0].text).toBe('Il te manque 83 abonnés pour ouvrir ta boutique.');
    const one = contextRules({ section: 'PROFILE', state: { isOwnerProfile: true, offerCount: 0, followers: 99, saleThreshold: 100 } });
    expect(one[0].text).toBe('Il te manque 1 abonné pour ouvrir ta boutique.');
    const open = contextRules({ section: 'PROFILE', state: { isOwnerProfile: true, offerCount: 0, followers: 0, saleThreshold: 100, freeWithoutThreshold: true } });
    expect(open[0].id).toBe('SHOP_EMPTY');
  });

  it('FREE à 0 -> recharger ou faire un Solo (navigation avec paramètres)', () => {
    const rules = contextRules({ section: 'PULSE', state: { freeBalance: 0 } });
    expect(rules[0].id).toBe('FREE_ZERO');
    expect(rules[0].actions.map((a) => a.key)).toEqual(['RECHARGE', 'SOLO']);
    expect(rules[0].actions[0].params).toEqual({ sourceFeature: 'ROBOT_NO_FREE' });
    expect(rules[0].actions[1].params).toMatchObject({ screen: 'Parties' });
  });

  it('N morceaux en attente -> « Trie-les » (accord singulier / pluriel)', () => {
    expect(contextRules({ section: 'PLAYLISTS', state: { pendingTracks: 4 } })[0].text).toBe('4 morceaux t’attendent. Trie-les !');
    expect(contextRules({ section: 'PLAYLISTS', state: { pendingTracks: 1 } })[0].text).toBe('1 morceau t’attend. Trie-le !');
    expect(contextRules({ section: 'PLAYLISTS', state: { pendingTracks: 0 } })).toEqual([]);
  });

  it('état inconnu : aucune règle (le robot ne devine pas)', () => {
    expect(contextRules({ section: 'PROFILE', state: {} })).toEqual([]);
    expect(contextRules({ section: 'PROFILE', state: { isOwnerProfile: true, offerCount: 0 } })).toEqual([]);
    expect(contextRules({ section: 'PULSE', state: { freeBalance: null } })).toEqual([]);
    // Boutique déjà ouverte : pas de conseil.
    expect(contextRules({ section: 'PROFILE', state: { isOwnerProfile: true, offerCount: 2, followers: 500, saleThreshold: 100 } })).toEqual([]);
  });

  it('les écrans déclarent leur état, reportSurface fournit la fenêtre posée par-dessus', () => {
    const remove = publishRobotScreenState('profile-owner', { isOwnerProfile: true, offerCount: 0, followers: 3, saleThreshold: 100 });
    const surface = pushReportSurface({ label: 'Story de @adel' });
    const ctx = buildRobotScreenContext('Profile', { pendingTracks: 2 });
    expect(ctx.section).toBe('PROFILE');
    expect(ctx.surface).toBe('Story de @adel');
    expect(ctx.state).toMatchObject({ offerCount: 0, followers: 3, pendingTracks: 2 });
    expect(ctx.actions.map((a) => a.key)).toEqual(['SHARE', 'SORT']);
    remove();
    surface.remove();
    expect(buildRobotScreenContext('Profile').actions).toEqual([]);
  });

  it('un clic = une navigation : chaque action contextuelle porte route (+ params)', () => {
    const ctx = buildRobotScreenContext('Profile', { freeBalance: 0, pendingTracks: 3 });
    const out = scenarioForRoute('Profile', 'adel', 0, { rules: contextRules(ctx) });
    for (const action of out.actions.filter((a) => a.key !== 'REPORT')) expect(action.route.length).toBeGreaterThan(0);
    expect(out.actions.length).toBeLessThanOrEqual(9);
    expect(out.text).toContain('FREE');
  });

  it('respecte le silence : le conseil spontané passe par robotSay et robotQuietService', () => {
    const service = src('src/services/robotCoachService.ts');
    expect(service).toContain('export async function robotContextHint');
    expect(service).toContain('if (await isRobotQuiet()) return false;');
    // Le conseil spontané n\'utilise jamais force ; seule la secousse volontaire le fait.
    const hint = service.slice(service.indexOf('export async function robotContextHint'), service.indexOf('/** Appel du robot'));
    expect(hint).not.toContain('force: true');
    // Position / taille du robot : GlobalChatDock n\'est pas touché par ce lot.
    expect(src('src/screens/ProfilePublicScreen.tsx')).toContain("publishRobotScreenState('profile-owner'");
  });
});
