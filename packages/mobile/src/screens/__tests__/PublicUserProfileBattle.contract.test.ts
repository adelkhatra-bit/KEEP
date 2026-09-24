// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'), 'utf8');

describe('PublicUserProfileScreen — défi Battle depuis un profil visité', () => {
  it('réutilise le moteur Battle existant et son feature flag, sans deuxième système', () => {
    expect(source).toContain("import { isKeepBattleEnabled } from '../services/keepBattleExperienceService';");
    expect(source).toContain("import { sendBattleChallenge } from '../services/keepBattleLiveService';");
    expect(source).toContain("await sendBattleChallenge(profile.id, 'MIX', 8);");
  });

  it('affiche un CTA direct uniquement pour un autre profil et conserve le parcours invité', () => {
    expect(source).toContain('icon="⚡"');
    expect(source).toContain("title={battleInviteBusy ? 'INVITATION EN COURS…' : 'DÉFIER EN BATTLE'}");
    expect(source).toContain("battleFeatureEnabled && viewer?.id !== profile.id");
    expect(source).toContain("requestAccount('login')");
  });

  it('ne masque pas les refus serveur importants derrière un message générique', () => {
    expect(source).toContain('BATTLE_TARGET_NO_CREDIT');
    expect(source).toContain('BATTLE_CHALLENGER_NO_CREDIT');
    expect(source).toContain('BATTLE_DECLINE_THROTTLED');
    expect(source).toContain('BATTLE_TARGET_NOT_AVAILABLE');
  });
});
