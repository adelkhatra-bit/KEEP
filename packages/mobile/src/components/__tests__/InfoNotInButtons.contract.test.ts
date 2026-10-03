import fs from 'fs';
import path from 'path';

// Adel (29/09/2026) : « un bouton c'est un bouton, une info c'est une info…
// trop de texte rouge : une flèche discrète pour en savoir plus ».
const battle = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260929230000_battle_solo_daily_limit_admin_setting.sql'), 'utf8');

describe('Battle : infos hors des boutons, avertissements discrets', () => {
  it('les boutons SOLO / EN LIGNE ne contiennent qu’une icône et un mot', () => {
    expect(battle).toContain('<><Text style={s.modeIconText}>◎</Text><Text style={s.modeTitle}>SOLO</Text></>');
    expect(battle).toContain('<Text style={s.modeIconText}>⚡</Text><Text style={s.modeTitle}>EN LIGNE</Text>');
    expect(battle).not.toContain('s.modeFoot');
  });
  it('quota Solo et règle par profil au-dessus des boutons, à côté de la recharge des Free', () => {
    expect(battle).toContain('<View style={s.quotaInfo}>');
    expect(battle).toContain('soloQuotaCopy(soloDailyStatus)');
    expect(battle).toContain('soloPlanRuleCopy(soloDailyStatus)');
  });
  it('plus de gros texte rouge : « Free insuffisants › » qui se déplie', () => {
    expect(battle).not.toContain('s.themeShortWarning');
    expect(battle.match(/<MoreInfoLine tone="warn" icon="⚠" short="Free insuffisants"/g)?.length).toBe(2);
  });
  it('garde la manche en ligne compacte et réserve la phrase variable au résultat', () => {
    expect(battle).not.toContain('soloEncouragement(Math.max(0, (arena.currentRound || 1) - 1), arena.roundCount || 1)');
    expect(battle).toContain('textOverride={battleResultMessage(');
    expect(battle).toContain("arenaVisualActive: { width: '100%', aspectRatio: 1");
  });
  it('la limite de 10 Solos/jour est réglable dans Super Admin', () => {
    expect(migration).toContain("'battle_solo_daily_limit_free',\n  '10'::jsonb");
    expect(migration).toContain('on conflict (key) do nothing');
  });
});
