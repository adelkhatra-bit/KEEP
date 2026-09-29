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
    // 29/09/2026 : même bouton que le profil propriétaire (MotionActionButton
    // outline) ; la présence reste affichée par la pastille En ligne/Hors ligne.
    expect(source).toContain('onPress={() => void challengeProfileToBattle()}');
    expect(source).toContain("{battleInviteBusy ? '⚡ ENVOI…' : '⚡ BATTLE'}");
    // 29/09/2026 : on se voit « En ligne » sur son profil, présence inconnue = pas de pastille.
    expect(source).toContain('formatProfilePresence(profilePresence.lastSeenAt, online)');
    expect(source).toContain('if (!self && !profilePresence.known) return null;');
    expect(source).toContain('accessibilityLabel={`Défier ${profile.username} en Battle`}');
    expect(source).toContain("requestAccount('login')");
  });

  it('ne masque pas les refus serveur importants derrière un message générique', () => {
    expect(source).toContain('BATTLE_TARGET_NO_CREDIT');
    expect(source).toContain('BATTLE_CHALLENGER_NO_CREDIT');
    expect(source).toContain('BATTLE_DECLINE_THROTTLED');
    expect(source).toContain('BATTLE_TARGET_NOT_AVAILABLE');
  });
});
