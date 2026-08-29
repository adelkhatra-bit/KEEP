from pathlib import Path

AUDIO = Path('packages/mobile/src/services/audioPreviewService.ts')
GAME = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')

s = AUDIO.read_text()
if 'scheduleTrackPreviewSegment' not in s:
    s = s.replace("let activeTimer: ReturnType<typeof setTimeout> | null = null;\n", "let activeTimer: ReturnType<typeof setTimeout> | null = null;\nlet activeStartTimer: ReturnType<typeof setTimeout> | null = null;\n", 1)
    s = s.replace("  activeTimer = null;\n}\n", "  activeTimer = null;\n  if (activeStartTimer) {\n    clearTimeout(activeStartTimer);\n    activeStartTimer = null;\n  }\n}\n", 1)
    s = s.replace("  onStatus: (status: AVPlaybackStatus, sound: Audio.Sound) => void,\n): Promise<Audio.Sound> {", "  onStatus: (status: AVPlaybackStatus, sound: Audio.Sound) => void,\n  autoPlay = true,\n): Promise<Audio.Sound> {", 1)
    s = s.replace("      await ensurePlaying(created.sound);\n      return created.sound;", "      if (autoPlay) {\n        await ensurePlaying(created.sound);\n      } else {\n        const status = await created.sound.getStatusAsync();\n        if (!status.isLoaded) throw new Error('AUDIO_PREVIEW_NOT_LOADED');\n      }\n      return created.sound;", 1)
    marker = "\nexport async function stopTrackPreview(key?: string): Promise<void> {"
    scheduled = r'''
/** Précharge l'extrait et le lance sur un timestamp absolu partagé entre joueurs. */
export async function scheduleTrackPreviewSegment(
  key: string,
  previewUrl: string,
  positionMillis: number,
  durationMillis: number,
  startAtEpochMs: number,
  onStateChange?: (playing: boolean) => void,
): Promise<void> {
  return serialize(async () => {
    await unloadActive();
    await configurePreviewAudio();
    const effectivePosition = positionMillis > 0 ? positionMillis : 9000;
    const createdSound = await createSoundWithRetry(previewUrl, effectivePosition, (status, sound) => {
      if (!status.isLoaded) return;
      if (activeSound === sound) activeStateListener?.(status.isPlaying);
      if (!status.didJustFinish) return;
      if (activeSound === sound) {
        void serialize(async () => {
          if (activeSound !== sound) return;
          await unloadActive();
        });
      }
    }, false);
    activeSound = createdSound;
    activeKey = key;
    activeStateListener = onStateChange ?? null;
    const delay = Math.max(0, Math.round(startAtEpochMs - Date.now()));
    activeStartTimer = setTimeout(() => {
      activeStartTimer = null;
      if (activeSound !== createdSound) return;
      void createdSound.playAsync().then(() => {
        if (activeSound !== createdSound) return;
        onStateChange?.(true);
        activeTimer = setTimeout(() => {
          if (activeSound !== createdSound) return;
          void serialize(async () => { await unloadActive(); });
        }, Math.max(1000, Math.round(durationMillis)));
      }).catch(() => {
        if (activeSound === createdSound) void serialize(async () => { await unloadActive(); });
      });
    }, delay);
  });
}
'''
    if marker not in s:
        raise SystemExit('stopTrackPreview marker not found')
    s = s.replace(marker, scheduled + marker, 1)
AUDIO.write_text(s)

s = GAME.read_text()
s = s.replace("import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';", "import { playTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';", 1)
s = s.replace("  const [soloStartedAt, setSoloStartedAt] = React.useState(0);\n", "  const [soloStartedAt, setSoloStartedAt] = React.useState(0);\n  const [pausedSoloRemaining, setPausedSoloRemaining] = React.useState<number | null>(null);\n", 1)
old = """  const soloRemaining = soloStartedAt ? Math.max(0, ROUND_MS - (now - soloStartedAt)) : ROUND_MS;
  React.useEffect(() => {
    if (!solo || !audioReady || soloAnswer || soloRemaining > 0) return;
    setSoloAnswer('__TIMEOUT__'); void stopTrackPreview(); animateResult();
  }, [solo, audioReady, soloAnswer, soloRemaining, animateResult]);"""
new = """  const soloRemaining = soloStartedAt ? Math.max(0, ROUND_MS - (now - soloStartedAt)) : ROUND_MS;
  const displayedSoloRemaining = pausedSoloRemaining ?? soloRemaining;
  const activeIncomingId = incoming[0]?.id || '';

  React.useEffect(() => {
    if (!solo) return;
    if (activeIncomingId && pausedSoloRemaining === null && audioReady && soloStartedAt && !soloAnswer) {
      setPausedSoloRemaining(Math.max(0, ROUND_MS - (Date.now() - soloStartedAt)));
      setAudioReady(false);
      void stopTrackPreview();
      return;
    }
    if (!activeIncomingId && pausedSoloRemaining !== null && !soloAnswer) {
      const round = solo.rounds[soloIndex];
      const savedRemaining = pausedSoloRemaining;
      setPausedSoloRemaining(null);
      setSoloStartedAt(0);
      setAudioReady(false);
      let alive = true;
      void (async () => {
        while (alive) {
          const ok = await playVerified(`solo-resume:${round.trackId}:${soloIndex}`, round.previewUrl, savedRemaining + 800);
          if (!alive) return;
          if (ok) {
            setAudioReady(true);
            setSoloStartedAt(Date.now() - (ROUND_MS - savedRemaining));
            return;
          }
          await wait(500);
        }
      })();
      return () => { alive = false; };
    }
  }, [solo, soloIndex, soloAnswer, activeIncomingId, pausedSoloRemaining, audioReady, soloStartedAt, playVerified]);

  React.useEffect(() => {
    if (!solo || activeIncomingId || !audioReady || soloAnswer || displayedSoloRemaining > 0) return;
    setSoloAnswer('__TIMEOUT__'); void stopTrackPreview(); animateResult();
  }, [solo, activeIncomingId, audioReady, soloAnswer, displayedSoloRemaining, animateResult]);"""
if old not in s:
    raise SystemExit('solo timeout target not found')
s = s.replace(old, new, 1)
old = """  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl) return undefined;
    let alive = true;
    setAudioReady(false);
    const run = async () => {
      const closesAt = round.closesAt ? new Date(round.closesAt).getTime() : Date.now() + ROUND_MS;
      const duration = Math.max(1600, closesAt - Date.now() + 500);
      const ok = await playVerified(`arena:${arena.id}:${arena.matchNo}:${round.position}`, round.previewUrl, duration);
      if (alive && ok) setAudioReady(true);
    };
    void run();
    return () => { alive = false; };
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.previewUrl, arena?.round?.closesAt, playVerified]);"""
new = """  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl) return undefined;
    let alive = true;
    setAudioReady(false);
    const run = async () => {
      const startsAt = round.startedAt ? new Date(round.startedAt).getTime() : Date.now();
      const closesAt = round.closesAt ? new Date(round.closesAt).getTime() : startsAt + ROUND_MS;
      const duration = Math.max(1600, closesAt - startsAt + 500);
      try {
        await scheduleTrackPreviewSegment(`arena:${arena.id}:${arena.matchNo}:${round.position}`, round.previewUrl, 0, duration, startsAt, (playing) => {
          if (alive && playing) setAudioReady(true);
        });
      } catch {
        if (!alive) return;
        const ok = await playVerified(`arena-fallback:${arena.id}:${arena.matchNo}:${round.position}`, round.previewUrl, Math.max(1600, closesAt - Date.now() + 500));
        if (alive && ok) setAudioReady(true);
      }
    };
    void run();
    return () => { alive = false; void stopTrackPreview(); };
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.previewUrl, arena?.round?.startedAt, arena?.round?.closesAt, playVerified]);"""
if old not in s:
    raise SystemExit('arena audio target not found')
s = s.replace(old, new, 1)
s = s.replace("    const pct = audioReady ? (soloRemaining / ROUND_MS) * 100 : 100;", "    const pct = audioReady && !incoming[0] ? (displayedSoloRemaining / ROUND_MS) * 100 : 100;", 1)
s = s.replace("{audioReady ? `${(soloRemaining / 1000).toFixed(1)}s` : 'PRÊT'}", "{incoming[0] ? 'PAUSE' : audioReady ? `${(displayedSoloRemaining / 1000).toFixed(1)}s` : 'PRÊT'}", 1)
s = s.replace("{audioReady ? 'RÉPONDS VITE' : 'SON EN CHARGEMENT'}", "{incoming[0] ? 'INVITATION BATTLE' : audioReady ? 'RÉPONDS VITE' : 'SON EN CHARGEMENT'}", 1)
s = s.replace("<Text style={s.inviteLabel}>⚡ BATTLE ? · {challengeRemaining}s</Text>", "<Text style={s.inviteLabel}>⚡ BATTLE · {themeLabel(incoming[0].themeCode)} · {challengeRemaining}s</Text>", 1)
s = s.replace("<Text style={s.inviteQuestion}>Jouer ensemble et gagner des Free ?</Text>", "<Text style={s.inviteQuestion}>Style proposé : {themeLabel(incoming[0].themeCode)}. Accepter ce match ?</Text>", 1)
s = s.replace("disabled={!audioReady || answered || Boolean(incoming[0])}", "disabled={!audioReady || answered || Boolean(incoming[0]) || pausedSoloRemaining !== null}", 1)
old = """    return <View style={s.root}><View style={s.header}><TouchableOpacity style={s.back} onPress={() => setBrowseOnline(false)}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>KEEP BATTLE</Text><Text style={s.title}>Joueurs disponibles</Text></View><View style={{ width: 36 }} /></View><Text style={s.browseText}>Les utilisateurs actuellement en solo apparaissent ici. Choisis un joueur et envoie-lui un défi.</Text>"""
new = """    return <View style={s.root}><View style={s.header}><TouchableOpacity style={s.back} onPress={() => setBrowseOnline(false)}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>KEEP BATTLE</Text><Text style={s.title}>Joueurs disponibles</Text></View><View style={{ width: 36 }} /></View><Text style={s.browseText}>Choisis d’abord le style du match. Le joueur invité verra ce style avant d’accepter ou refuser.</Text><Text style={s.section}>STYLE DU MATCH</Text><ScrollView horizontal style={s.themeScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeRow}>{themes.map((t) => <TouchableOpacity key={t.code} onPress={() => setThemeCode(t.code)} style={[s.theme, t.code === themeCode && s.themeOn]}><Text style={[s.themeText, t.code === themeCode && s.themeTextOn]}>{t.label}</Text></TouchableOpacity>)}</ScrollView>"""
if old not in s:
    raise SystemExit('browse intro target not found')
s = s.replace(old, new, 1)
s = s.replace("<Text style={s.browseBattleText}>BATTLE ?</Text>", "<Text style={s.browseBattleText}>BATTLE · {themeLabel(themeCode)}</Text>", 1)
s = s.replace("await sendBattleChallenge(player.profileId, solo?.themeCode || themeCode);", "await sendBattleChallenge(player.profileId, themeCode);", 1)
GAME.write_text(s)
