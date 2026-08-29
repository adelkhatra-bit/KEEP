from pathlib import Path

# KEEP Battle: make accept/refuse reliable on mobile and remove the audible gap between solo rounds.

p = Path('packages/mobile/src/services/audioPreviewService.ts')
s = p.read_text()

if 'let preloadedSound: Audio.Sound | null = null;' not in s:
    s = s.replace(
        "let activeStartTimer: ReturnType<typeof setTimeout> | null = null;\nlet operation = Promise.resolve();",
        "let activeStartTimer: ReturnType<typeof setTimeout> | null = null;\nlet preloadedSound: Audio.Sound | null = null;\nlet preloadedKey: string | null = null;\nlet operation = Promise.resolve();",
        1,
    )

if 'async function unloadPreloaded()' not in s:
    anchor = "async function unloadActive() {\n"
    idx = s.index(anchor)
    end_marker = "}\n\nfunction serialize<T>"
    end = s.index(end_marker, idx)
    insert = """

async function unloadPreloaded() {
  const sound = preloadedSound;
  preloadedSound = null;
  preloadedKey = null;
  if (!sound) return;
  try { await sound.stopAsync(); } catch {}
  try { await sound.unloadAsync(); } catch {}
}
"""
    s = s[:end+2] + insert + s[end+2:]

if 'export async function preloadTrackPreviewSegment' not in s:
    marker = "/** Précharge l'extrait et le lance sur un timestamp absolu partagé entre joueurs. */"
    block = r'''/** Précharge le prochain extrait solo sans couper celui qui joue déjà. */
export async function preloadTrackPreviewSegment(
  key: string,
  previewUrl: string,
  positionMillis = 0,
): Promise<void> {
  return serialize(async () => {
    if (preloadedKey === key && preloadedSound) return;
    await unloadPreloaded();
    await configurePreviewAudio();
    const effectivePosition = positionMillis > 0 ? positionMillis : 9000;
    let loaded: Audio.Sound | null = null;
    loaded = await createSoundWithRetry(previewUrl, effectivePosition, (status, sound) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      if (preloadedSound === sound) void serialize(async () => { await unloadPreloaded(); });
      if (activeSound === sound) void serialize(async () => { await unloadActive(); });
    }, false);
    preloadedSound = loaded;
    preloadedKey = key;
  });
}

/** Bascule instantanément sur l'extrait préchargé. Retourne false si le préchargement n'est pas prêt. */
export async function playPreloadedTrackPreviewSegment(
  key: string,
  durationMillis = 8000,
  onStateChange?: (playing: boolean) => void,
): Promise<boolean> {
  return serialize(async () => {
    if (preloadedKey !== key || !preloadedSound) return false;
    const sound = preloadedSound;
    preloadedSound = null;
    preloadedKey = null;
    await unloadActive();
    activeSound = sound;
    activeKey = key;
    activeStateListener = onStateChange ?? null;
    try {
      await ensurePlaying(sound);
      onStateChange?.(true);
      activeTimer = setTimeout(() => {
        if (activeSound !== sound) return;
        void serialize(async () => { await unloadActive(); });
      }, Math.max(1000, Math.round(durationMillis)));
      return true;
    } catch {
      if (activeSound === sound) await unloadActive();
      return false;
    }
  });
}

'''
    if marker not in s:
        raise SystemExit('audio preload insertion marker missing')
    s = s.replace(marker, block + marker, 1)

p.write_text(s)

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

s = s.replace(
    "import { playTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';",
    "import { playPreloadedTrackPreviewSegment, playTrackPreviewSegment, preloadTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';",
    1,
)

if "const [joiningArenaId, setJoiningArenaId]" not in s:
    s = s.replace(
        "const [respondingChallengeId, setRespondingChallengeId] = React.useState<string | null>(null);",
        "const [respondingChallengeId, setRespondingChallengeId] = React.useState<string | null>(null);\n  const [joiningArenaId, setJoiningArenaId] = React.useState<string | null>(null);",
        1,
    )

# Prefer a preloaded next solo track before falling back to the normal retry loader.
old_start = """    const start = async () => {
      while (alive) {
        const ok = await playVerified(`solo:${round.trackId}:${soloIndex}`, round.previewUrl, ROUND_MS + 800);
        if (!alive) return;
        if (ok) {
          setAudioReady(true);
          setSoloStartedAt(Date.now());
          return;
        }
        await wait(650);
      }
    };"""
new_start = """    const start = async () => {
      const preloadedKey = `solo-preload:${round.trackId}:${soloIndex}`;
      const hot = await playPreloadedTrackPreviewSegment(preloadedKey, ROUND_MS + 800);
      if (!alive) return;
      if (hot) {
        setAudioReady(true);
        setSoloStartedAt(Date.now());
        return;
      }
      while (alive) {
        const ok = await playVerified(`solo:${round.trackId}:${soloIndex}`, round.previewUrl, ROUND_MS + 800);
        if (!alive) return;
        if (ok) {
          setAudioReady(true);
          setSoloStartedAt(Date.now());
          return;
        }
        await wait(650);
      }
    };"""
if old_start not in s:
    raise SystemExit('solo start block missing')
s = s.replace(old_start, new_start, 1)

# Preload the next question while the current music is playing.
preload_anchor = """  const soloRemaining = soloStartedAt ? Math.max(0, ROUND_MS - (now - soloStartedAt)) : ROUND_MS;"""
if 'solo-preload:${next.trackId}:${soloIndex + 1}' not in s:
    preload_effect = """  React.useEffect(() => {
    if (!solo || !audioReady || incoming[0] || pausedSoloRemaining !== null) return;
    const next = solo.rounds[soloIndex + 1];
    if (!next?.previewUrl) return;
    void preloadTrackPreviewSegment(`solo-preload:${next.trackId}:${soloIndex + 1}`, next.previewUrl, 0).catch(() => {});
  }, [solo, soloIndex, audioReady, incoming[0]?.id, pausedSoloRemaining]);

"""
    if preload_anchor not in s:
        raise SystemExit('solo preload anchor missing')
    s = s.replace(preload_anchor, preload_effect + preload_anchor, 1)

# Keep the current audio alive during the tiny answer reveal; the next preloaded track takes over immediately.
s = s.replace(
    "void stopTrackPreview(); setSoloAnswer(choice);",
    "setSoloAnswer(choice);",
    1,
)
s = s.replace(
    "const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 360);",
    "const id = setTimeout(() => { setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 180);",
    1,
)

# Acceptance: backend may have already accepted even if the first state read races. Retry the exact same arena.
old_accept = """      if (accept && response.arenaId) {
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        setSolo(null); setBrowseOnline(false); setAudioReady(false);
        setArena(await loadKeepBattleArena(response.arenaId));
        animateVersus();
      }"""
new_accept = """      if (accept && response.arenaId) {
        const acceptedArenaId = response.arenaId;
        setJoiningArenaId(acceptedArenaId);
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        setSolo(null); setBrowseOnline(false); setAudioReady(false);
        let loaded: KeepBattleArenaState | null = null;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 8 && !loaded; attempt += 1) {
          try { loaded = await loadKeepBattleArena(acceptedArenaId); }
          catch (error) { lastError = error; await wait(180 + attempt * 140); }
        }
        if (!loaded) throw lastError || new Error('BATTLE_ARENA_LOAD_AFTER_ACCEPT_FAILED');
        setArena(loaded);
        setJoiningArenaId(null);
        animateVersus();
      }"""
if old_accept not in s:
    raise SystemExit('accept block missing')
s = s.replace(old_accept, new_accept, 1)

# If accept succeeded server-side but a later read failed, keep retrying that arena instead of dropping to home.
catch_anchor = """    } catch (e: any) {
      await refreshSocial();"""
catch_repl = """    } catch (e: any) {
      if (accept && joiningArenaId) {
        const retryArenaId = joiningArenaId;
        void (async () => {
          for (let attempt = 0; attempt < 12; attempt += 1) {
            try {
              const loaded = await loadKeepBattleArena(retryArenaId);
              setArena(loaded); setJoiningArenaId(null); animateVersus(); return;
            } catch { await wait(500); }
          }
          setJoiningArenaId(null);
        })();
      }
      await refreshSocial();"""
if catch_anchor not in s:
    raise SystemExit('respond catch anchor missing')
s = s.replace(catch_anchor, catch_repl, 1)

# Render an explicit same-screen joining state so the user sees the accept immediately.
home_anchor = """  if (browseOnline) {"""
if "CONNEXION AU BATTLE" not in s:
    joining_block = """  if (joiningArenaId) {
    return <View style={s.root}><View style={s.joining}><ActivityIndicator color=\"#E5F266\" size=\"large\" /><Text style={s.joiningTitle}>CONNEXION AU BATTLE</Text><Text style={s.joiningText}>Synchronisation des deux joueurs…</Text></View></View>;
  }

"""
    if home_anchor not in s:
        raise SystemExit('joining render anchor missing')
    s = s.replace(home_anchor, joining_block + home_anchor, 1)

# Make the invitation outline visibly larger and the actions easier to hit at 390x844.
s = s.replace(
    "invite: { marginTop: 7, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 15, backgroundColor: '#241730', borderWidth: 1, borderColor: '#E5F266' }",
    "invite: { marginTop: 8, minHeight: 88, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 18, backgroundColor: '#241730', borderWidth: 2, borderColor: '#E5F266', justifyContent: 'center' }",
    1,
)
s = s.replace(
    "no: { minHeight: 48, minWidth: 84, paddingHorizontal: 12, borderRadius: 24, borderWidth: 1, borderColor: '#4B3C57', alignItems: 'center', justifyContent: 'center' }",
    "no: { minHeight: 52, minWidth: 88, paddingHorizontal: 13, borderRadius: 26, borderWidth: 2, borderColor: '#6B5B79', alignItems: 'center', justifyContent: 'center' }",
    1,
)
s = s.replace(
    "yes: { minHeight: 48, minWidth: 92, paddingHorizontal: 12, borderRadius: 24, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }",
    "yes: { minHeight: 52, minWidth: 96, paddingHorizontal: 13, borderRadius: 26, backgroundColor: '#E5F266', borderWidth: 2, borderColor: '#F4FF8F', alignItems: 'center', justifyContent: 'center' }",
    1,
)
s = s.replace("noText: { color: '#FFF', fontSize: 12, fontWeight: '900' }", "noText: { color: '#FFF', fontSize: 13, fontWeight: '900' }", 1)
s = s.replace("yesText: { color: '#17130B', fontSize: 12, fontWeight: '900' }", "yesText: { color: '#17130B', fontSize: 13, fontWeight: '900' }", 1)

if "joining: {" not in s:
    s = s.replace(
        "root: { width: '100%', flex: 1, paddingBottom: 4, position: 'relative' },",
        "root: { width: '100%', flex: 1, paddingBottom: 4, position: 'relative' }, joining: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', padding: 24 }, joiningTitle: { color: '#FFF', fontSize: 18, fontWeight: '900', marginTop: 16 }, joiningText: { color: '#FFF', fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 6, textAlign: 'center' },",
        1,
    )

p.write_text(s)

# Contract tests lock the continuous solo handoff and reliable accepted arena join.
p = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
t = p.read_text()
if 'preloads the next solo song' not in t:
    t = t.replace("\n});\n", r'''

  it('preloads the next solo song and avoids the old stop-before-transition gap', () => {
    expect(source).toContain('preloadTrackPreviewSegment(`solo-preload:${next.trackId}:${soloIndex + 1}`');
    expect(source).toContain('playPreloadedTrackPreviewSegment(preloadedKey, ROUND_MS + 800)');
    expect(source).not.toContain('void stopTrackPreview(); setSoloAnswer(choice)');
    expect(source).toContain('}, 180);');
  });

  it('retries the exact accepted arena instead of dropping the player back home', () => {
    expect(source).toContain('setJoiningArenaId(acceptedArenaId)');
    expect(source).toContain('for (let attempt = 0; attempt < 8 && !loaded; attempt += 1)');
    expect(source).toContain('CONNEXION AU BATTLE');
  });
});
''', 1)
p.write_text(t)

p = Path('packages/mobile/src/services/__tests__/audioPreviewService.battle.contract.test.ts')
if p.exists():
    t = p.read_text()
    if 'preloadTrackPreviewSegment' not in t:
        t += "\n// KEEP Battle solo seamless handoff is covered by component contract.\n"
        p.write_text(t)
