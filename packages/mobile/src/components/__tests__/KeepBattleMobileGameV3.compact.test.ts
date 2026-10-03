// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Music Battle — compact current UX', () => {
  const source = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const mascot = read(__dirname, '..', 'LokiMascotVoice.tsx');
  const speech = read(__dirname, '..', '..', 'services', 'lokiSpeechService.ts');

  it('keeps Solo and online mode as compact action buttons while information stays outside', () => {
    expect(source).toContain('<Text style={s.modeIconText}>◎</Text><Text style={s.modeTitle}>SOLO</Text>');
    expect(source).toContain('<Text style={s.modeIconText}>⚡</Text><Text style={s.modeTitle}>EN LIGNE</Text>');
    expect(source).toContain('<View style={s.quotaInfo}>');
    expect(source).toContain('soloQuotaCopy(soloDailyStatus)');
    expect(source).not.toContain('s.modeFoot');
  });

  it('queues incoming Battle invitations during an active Solo without pausing music, timer or answers', () => {
    expect(source).toContain("Les invitations restent en file d'attente pendant le Solo");
    expect(source).toContain('if (!solo || !audioReady || soloAnswer) return;');
    expect(source).not.toContain('disabled={!audioReady || answered || Boolean(incoming[0])');
    expect(source).not.toContain('if (!round || incoming[0] || pausedSoloRemaining !== null) return undefined');
  });

  it('expires a stale incoming invitation locally so the Solo cannot remain blocked', () => {
    expect(source).toContain("if (new Date(item.expiresAt).getTime() > now) return;");
    expect(source).toContain("setIncoming((rows) => rows.filter((x) => x.id !== item.id));");
  });

  it('still exposes accept/refuse when the player can decide, including the finished Solo screen', () => {
    expect(source).toContain('requestBattleChallengeDecision(incoming[0], false)');
    expect(source).toContain('requestBattleChallengeDecision(incoming[0], true)');
    expect(source).toContain("Alert.alert(\n      'Refuser ce Battle ?'");
    expect(source).toContain('PARTIE TERMINÉE');
    expect(source).toContain('REFUSER');
    expect(source).toContain('ACCEPTER');
  });

  it('uses the synchronous round-start ref to prevent a false timeout on round 2+', () => {
    expect(source).toContain('const soloStartedAtRef = React.useRef(0);');
    expect(source).toContain('const startedAt = soloStartedAtRef.current;');
    expect(source).toContain('const remaining = pausedSoloRemaining ?? (startedAt ? Math.max(0, ROUND_MS - (Date.now() - startedAt)) : ROUND_MS);');
  });

  it('preloads the next Solo excerpt after an answer and cleans abandoned preload', () => {
    expect(source).toContain('if (soloIndex < solo.rounds.length - 1) {');
    expect(source).toContain('preloadTrackPreviewSegment(soloRoundPreviewKey(nextRound.trackId, soloIndex + 1)');
    expect(source).toContain('discardPreloadedTrackPreview();');
  });

  it('catches late multiplayer audio up to the shared server position', () => {
    expect(source).toContain('9000 + lateByMs');
    expect(source).toContain('round.startedAt');
    expect(source).toContain('arena-fallback:');
    expect(source).toContain('arena-safety:');
  });

  it('calibrates multiplayer timing against PostgreSQL instead of trusting each phone clock', () => {
    expect(source).toContain('estimateKeepBattleServerClockOffsetMs');
    expect(source).toContain('keepBattleServerNowMs');
    expect(source).toContain('const localTargetStart = startsAt - clockOffset');
    expect(source).toContain('const serverNow = () => keepBattleServerNowMs(clockOffset)');
  });

  it('keeps the global ranking out of Battle setup and exposes it only from Solo', () => {
    expect(source).toContain('testID="solo-leaderboard-entry"');
    expect(source).toContain('accessibilityLabel="Ouvrir le classement depuis le Solo"');
    expect(source).not.toContain('accessibilityLabel="Ouvrir le classement Battle"');
  });

  it('keeps the Solo ranking and abandon counters hidden behind PLUS to save mobile space', () => {
    expect(source).toContain('testID="solo-leaderboard-more"');
    expect(source).toContain('accessibilityLabel="Ouvrir le classement Solo depuis Plus"');
    expect(source).toContain('Abandons Solo');
    expect(source).toContain('Abandons Battle');
    expect(source).toContain('loadMyKeepBattleSoloRank');
    expect(source).toContain('soloRankDelta');
    expect(source).not.toContain('testID="solo-leaderboard-mini"');
  });

  it('uses the same square artwork-first layout in Solo and Battle and pushes answers to the bottom', () => {
    expect(source).toContain('const { width: windowWidth, height: windowHeight } = useWindowDimensions();');
    expect(source).toContain('const roundCardMinHeight = isDesktopBattle ? 640 : Math.max(500, windowHeight - 140);');
    expect(source).toContain("rootDesktop: { maxWidth: 760, alignSelf: 'center' }");
    expect(source).toContain("soloVisual: { height: undefined, width: '100%', aspectRatio: 1");
    expect(source).toContain("arenaVisualActive: { width: '100%', aspectRatio: 1");
    expect(source).toContain("soloAnswersActive: { marginTop: 'auto', paddingTop: 6, paddingBottom: 0 }");
    expect(source).toContain("arenaAnswersActive: { marginTop: 'auto', paddingTop: 6, paddingBottom: 0 }");
    expect(source).toContain("answer: { width: '48%', height: 54");
  });

  it('keeps sent Battle invitations cancellable with a live countdown until acceptance', () => {
    expect(source).toContain('cancelBattleChallenge(item.id)');
    expect(source).toContain('requestCancelOutgoingChallenge');
    expect(source).toContain('ANNULER ·');
    expect(source).toContain("ANNULER L’INVITE");
    expect(source).toContain('outgoingPendingByTarget');
  });

  it('owns audio ducking in one place so Loki restores music volume after speaking', () => {
    expect(speech).toContain('duckActivePreviewForSpeech');
    expect(speech).toContain('restoreActivePreviewAfterSpeech');
    expect(mascot).not.toContain('duckActivePreviewForSpeech');
    expect(mascot).not.toContain('restoreActivePreviewAfterSpeech');
    expect(mascot).toContain('await speakLokiText(line.text');
  });

  it('shows only daily FREE gain/loss counters with the 02:00 Battle reset', () => {
    expect(source).toContain('FREE gagnés aujourd’hui');
    expect(source).toContain('FREE perdus aujourd’hui');
    expect(source).toContain('JOURNÉE BATTLE · RESET 02:00');
    expect(source).not.toContain('myPlayerStats?.freeWon ?? myCreditStatus?.won');
    expect(source).not.toContain('myPlayerStats?.freeLost ?? myCreditStatus?.lost');
  });
});
