import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const battle = fs.readFileSync(path.join(root, 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');
const cloud = fs.readFileSync(path.join(root, 'services', 'sessionCloudSyncService.ts'), 'utf8');

describe('Solo et Battle sauvegardés visibles sur PC et iPhone', () => {
  it('les deux constructeurs Solo et Battle attribuent le propriétaire du compte authentifié', () => {
    const tagged = battle.match(/ownerUserId: canLoadAuthenticatedBattleCredit\(\) \? useUserStore\.getState\(\)\.user\?\.id : undefined/g) || [];
    expect(tagged).toHaveLength(2);
    expect(battle).toContain('buildBattleSession(');
    expect(battle).toContain('buildArenaSession(');
  });

  it('le miroir Supabase filtre strictement par propriétaire et ne copie pas un invité', () => {
    expect(cloud).toContain('s.ownerUserId === userId');
    expect(cloud).toContain('state.isLocalGuest');
    expect(cloud).toContain('keep_sync_device_session');
  });
});
