import fs from 'fs';
import path from 'path';
import { soloCostNotice, soloQuitNotice } from '../../services/battleHomeInfo';

// Adel (29/09/2026) : « s'il sort au bout de la 3e musique, est-ce que ça
// lui débite bien sa partie Solo et est-ce qu'un popup le prévient ? » +
// « une animation spéciale Loki à la fin » + onglet « Écouter » -> « Loki ».
const src = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', ...p), 'utf8');

describe('Solo : débit annoncé et sortie confirmée', () => {
  const battle = src('components', 'KeepBattleMobileGameV3.tsx');
  it('prévient avant de jouer qu’une partie est comptée dès le départ', () => {
    expect(soloCostNotice({ limit: 10, remaining: 10, unlimited: false })).toBe("Dès que la première musique démarre, cette partie utilise 1 Solo du jour : il t'en restera 9 sur 10. Si tu quittes ensuite, elle reste comptée.");
    expect(soloCostNotice({ limit: null, remaining: null, unlimited: true })).toBeNull();
    expect(battle).toContain('const costLine = soloCostNotice(soloDailyStatus);');
  });
  it('quitter en cours de partie demande confirmation et dit que la partie n’est pas rendue', () => {
    expect(soloQuitNotice({ limit: 10, remaining: 10, unlimited: false })).toContain('Il te restera 10 Solos sur 10');
    expect(battle).toContain("Alert.alert('Quitter la partie ?', soloQuitNotice(soloDailyStatus), [");
    expect(battle).toContain("{ text: 'Continuer à jouer', style: 'cancel' }");
  });
  it('propose Annuler, jouer sans enregistrer ou enregistrer avant le départ', () => {
    expect(battle).toContain('visible={Boolean(soloSavePrompt)}');
    expect(battle).toContain('accessibilityLabel="Annuler le Battle solo"');
    expect(battle).toContain('accessibilityLabel="Jouer sans enregistrer"');
    expect(battle).toContain('accessibilityLabel="Enregistrer ce Battle solo"');
    expect(battle).toContain('void runStartSolo(false)');
    expect(battle).toContain('void runStartSolo(true)');
  });
  it('le compteur Solo est relu à chaque retour à l’accueil Battle', () => {
    expect(battle).toContain('if (!enabled || solo) return;');
    expect(battle).toContain('}, [enabled, solo]);');
  });
});

describe('fin de partie Loki et onglet Loki', () => {
  it('Solo et Battle en ligne se terminent par l’animation LOKI (pilote natif coupé sur le web)', () => {
    const battle = src('components', 'KeepBattleMobileGameV3.tsx');
    const burst = src('components', 'LokiFinishBurst.tsx');
    expect(battle.match(/<LokiFinishBurst /g)?.length).toBeGreaterThanOrEqual(2);
    expect(burst).toContain("const NATIVE = Platform.OS !== 'web';");
    expect(burst).not.toContain('useNativeDriver: true');
    expect(burst).toContain('isReduceMotionEnabled');
  });
  it('le premier onglet s’appelle Loki Music', () => {
    expect(src('navigation', 'Navigation.tsx')).toContain("tabBarLabel: 'Loki Music',");
  });
});

describe('Solo : limite pour toutes les formules, débit au départ, sortie par la barre d’onglets', () => {
  const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260929233000_battle_solo_limit_all_plans_count_starts.sql'), 'utf8');
  const nav = src('navigation', 'Navigation.tsx');
  const guard = src('services', 'gameExitGuard.ts');
  const battle = src('components', 'KeepBattleMobileGameV3.tsx');
  it('chaque départ est compté (même abandonné) et plus aucune formule illimitée en Solo', () => {
    expect(sql).toContain('insert into public.keep_battle_solo_daily_usage');
    expect(sql).toContain('where keep_battle_solo_daily_usage.starts < v_limit');
    expect(sql).not.toContain('keep_battle_solo_history');
    expect(sql).not.toMatch(/'unlimited',\s*true/);
    expect(sql).toContain("'battle_solo_daily_limit_' || p");
  });
  it('toucher un autre onglet pendant un Solo ouvre le même popup de débit', () => {
    expect(nav).toContain('tabPress: (e) => {');
    expect(nav).toContain('confirmLeaveGame(() => navigation.navigate(route.name));');
    expect(guard).toContain("Alert.alert('Quitter la partie ?', state.quitNotice");
    expect(guard).toContain("addEventListener('beforeunload'");
    expect(battle).toContain("setGameInProgress(true, 'SOLO', soloQuitNotice(soloDailyStatus))");
  });
});

describe('Solo : toutes les sorties système sont gardées + regagner des Free', () => {
  const guard = src('services', 'gameExitGuard.ts');
  const battle = src('components', 'KeepBattleMobileGameV3.tsx');
  it('retour du navigateur / glissement Safari et retour Android ouvrent le popup', () => {
    expect(guard).toContain("window.addEventListener('popstate'");
    expect(guard).toContain("keepSoloGuard: true");
    expect(guard).toContain("BackHandler.addEventListener('hardwareBackPress'");
  });
  it('« Regagner des Free » propose partager / Solo / formules', () => {
    expect(battle).toContain('<FreeEarnHelp highlight={insufficientForRoundCount(roundCount)}');
    expect(src('components', 'FreeEarnHelp.tsx')).toContain('★ Formules');
  });
});

describe('Solo : absence détectée + Loki qui parle', () => {
  const battle = src('components', 'KeepBattleMobileGameV3.tsx');
  const mascot = src('components', 'LokiMascotVoice.tsx');
  it('ne montre plus de popup bloquant après deux non-réponses', () => {
    const { soloIdleDetected } = require('../../services/battleHomeInfo');
    expect(soloIdleDetected(['CORRECT', '__TIMEOUT__', '__TIMEOUT__'], 0)).toBe(true);
    expect(soloIdleDetected(['__TIMEOUT__', '__TIMEOUT__'], 2)).toBe(false);
    expect(soloIdleDetected(['__TIMEOUT__', 'CORRECT'], 0)).toBe(false);
    expect(battle).not.toContain('idlePromptAt');
    expect(battle).not.toContain('Tu es toujours là ?');
    expect(battle).not.toContain('SOLO_IDLE_AUTO_CLOSE_MS');
  });
  it('Loki parle selon le score (voix expo-speech, pilote natif coupé sur le web)', () => {
    const { mascotLine } = require('../../services/battleHomeInfo');
    expect(mascotLine(1, 8).mood).toBe('oops');
    expect(mascotLine(1, 8, false, 'partie-A').text).not.toBe(mascotLine(1, 8, false, 'partie-B').text);
    expect(mascotLine(8, 8).mood).toBe('party');
    expect(mascotLine(0, 8, true).mood).toBe('sleepy');
    expect(mascot).not.toContain("import * as Speech from 'expo-speech'");
    expect(mascot).toContain("import { speakLokiText, stopLokiSpeech } from '../services/lokiSpeechService';");
    expect(mascot).toContain("await speakLokiText(line.text, { language: 'fr-FR'");
    expect(mascot).toContain("language: 'fr-FR'");
    expect(mascot).not.toContain('useNativeDriver: true');
  });
  it('les navigations hors écran (notifications, liens) passent par la garde', () => {
    const nav = src('navigation', 'navigationRef.ts');
    expect(nav).toContain('confirmLeaveGame(() => (navigationRef.navigate as any)(...args));');
    expect(nav).toContain("game.gameMode === 'EN_LIGNE' && game.activeArenaId === arenaId");
    expect(nav).toContain("source: 'ACTIVE_BATTLE_RESUME'");
    expect(nav).toContain("guardedNavigate('Main', { screen: 'Parties', params: { arenaId, openBattle: true } });");
  });
});
