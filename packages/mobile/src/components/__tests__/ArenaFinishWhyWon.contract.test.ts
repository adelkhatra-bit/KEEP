import fs from 'fs';
import path from 'path';

// Adel (29/09/2026) : fin de match -- trophée 3D au lieu de la photo, et
// « qu'on sache pourquoi on a gagné » sans encombrer.
const battle = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
const trophy = fs.readFileSync(path.resolve(__dirname, '..', 'WinnerTrophy3D.tsx'), 'utf8');

describe('fin de match Battle', () => {
  it('trophée 3D qui nargue le perdant, à la place de la photo du gagnant', () => {
    expect(battle).toContain('<WinnerTrophy3D won={Boolean(arena.lastResult.won)} />');
    expect(battle).not.toContain('{winner ? <Avatar name={winner.username} url={winner.avatarUrl} size={72} /> : <ResultIcon icon="🏆" />}');
    expect(trophy).toContain("const NATIVE = Platform.OS !== 'web';");
    expect(trophy).not.toContain('useNativeDriver: true');
    expect(trophy).toContain('😏');
  });
  it('une phrase dit pourquoi on a gagné, avec une légende des colonnes', () => {
    expect(battle).toContain('battleWinReason(arena.lastMatchResults)');
    expect(battle).toContain('<View style={s.matchRankLegend}>');
  });
  it('la phrase d’ambiance suit la vraie raison (jamais « réflexes » pour une victoire aux bonnes réponses)', () => {
    expect(battle).toContain("battleResultMessage(arena.id, arena.lastResult.matchNo, arena.lastResult.won, (battleWinReason(arena.lastMatchResults) || '').startsWith('⚡'))");
    expect(battle).toContain('const BATTLE_WIN_MESSAGES_ACCURACY = [');
  });
});
