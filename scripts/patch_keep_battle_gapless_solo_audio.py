from pathlib import Path

# Audio service: keep one next Battle preview preloaded so advancing a card does not wait on network.
p = Path('packages/mobile/src/services/audioPreviewService.ts')
s = p.read_text()

s = s.replace(
"let activeStartTimer: ReturnType<typeof setTimeout> | null = null;\nlet operation = Promise.resolve();",
"let activeStartTimer: ReturnType<typeof setTimeout> | null = null;\nlet standbySound: Audio.Sound | null = null;\nlet standbyKey: string | null = null;\nlet operation = Promise.resolve();",
1)

anchor = """async function unloadActive() {
  const sound = activeSound;
  const listener = activeStateListener;
  clearActiveTimer();
  activeSound = null;
  activeKey = null;
  activeStateListener = null;
  listener?.(false);
  if (!sound) return;
  try { await sound.stopAsync(); } catch {}
  try { await sound.unloadAsync(); } catch {}
}
"""
insert = anchor + """
async function unloadStandby() {
  const sound = standbySound;
  standbySound = null;
  standbyKey = null;
  if (!sound) return;
  try { await sound.unloadAsync(); } catch {}
}
"""
if anchor not in s:
    raise SystemExit('unloadActive anchor missing')
s = s.replace(anchor, insert, 1)

# Add preload API before playTrackPreviewSegment.
marker = "/**\n * Lit un segment court pour KEEP Battle."
preload = """/** Précharge le prochain extrait Battle sans interrompre le son courant. */
export async function preloadTrackPreviewSegment(
  key: string,
  previewUrl: string,
  positionMillis = 0,
): Promise<void> {
  return serialize(async () => {
    if (!previewUrl || (standbyKey === key && standbySound)) return;
    await unloadStandby();
    await configurePreviewAudio();
    const effectivePosition = positionMillis > 0 ? positionMillis : 9000;
    const createdSound = await createSoundWithRetry(previewUrl, effectivePosition, (status, sound) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      if (standbySound === sound) void unloadStandby();
      if (activeSound === sound) void serialize(async () => { await unloadActive(); });
    }, false);
    standbySound = createdSound;
    standbyKey = key;
  });
}

"""
if marker not in s:
    raise SystemExit('play segment marker missing')
s = s.replace(marker, preload + marker, 1)

old = """    const createdSound = await createSoundWithRetry(previewUrl, effectivePosition, (status, sound) => {
      if (!status.isLoaded) return;
      if (activeSound === sound) activeStateListener?.(status.isPlaying);
      if (!status.didJustFinish) return;
      if (activeSound === sound) {
        void serialize(async () => {
          if (activeSound !== sound) return;
          await unloadActive();
        });
      }
    });

    activeSound = createdSound;
"""
new = """    let createdSound: Audio.Sound;
    if (standbyKey === key && standbySound) {
      createdSound = standbySound;
      standbySound = null;
      standbyKey = null;
      await ensurePlaying(createdSound);
    } else {
      createdSound = await createSoundWithRetry(previewUrl, effectivePosition, (status, sound) => {
        if (!status.isLoaded) return;
        if (activeSound === sound) activeStateListener?.(status.isPlaying);
        if (!status.didJustFinish) return;
        if (activeSound === sound) {
          void serialize(async () => {
            if (activeSound !== sound) return;
            await unloadActive();
          });
        }
      });
    }

    activeSound = createdSound;
"""
# Only replace first occurrence after playTrackPreviewSegment declaration, not toggleTrackPreview.
idx = s.index('export async function playTrackPreviewSegment')
head, tail = s[:idx], s[idx:]
if old not in tail:
    raise SystemExit('playTrackPreviewSegment create block missing')
tail = tail.replace(old, new, 1)
s = head + tail
p.write_text(s)

# Battle screen: preload round N+1 while N is playing.
p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()
s = s.replace(
"import { playTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';",
"import { playTrackPreviewSegment, preloadTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';",
1)

anchor = """  const soloRemaining = soloStartedAt ? Math.max(0, ROUND_MS - (now - soloStartedAt)) : ROUND_MS;
  const displayedSoloRemaining = pausedSoloRemaining ?? soloRemaining;
  const activeIncomingId = incoming[0]?.id || '';
"""
insert = anchor + """
  React.useEffect(() => {
    if (!solo || incoming[0] || soloIndex >= solo.rounds.length - 1) return;
    const next = solo.rounds[soloIndex + 1];
    if (!next?.previewUrl) return;
    const preloadKey = `solo:${next.trackId}:${soloIndex + 1}:0`;
    void preloadTrackPreviewSegment(preloadKey, next.previewUrl, 0).catch(() => {});
  }, [solo?.themeCode, soloIndex, solo?.rounds, incoming[0]?.id]);
"""
if anchor not in s:
    raise SystemExit('solo remaining anchor missing')
s = s.replace(anchor, insert, 1)
# Keep result visible briefly but reduce dead transition latency.
s = s.replace("setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 360)", "setSoloIndex((v) => v + 1); setSoloAnswer(null); }, 220)", 1)
p.write_text(s)

# Regression contract.
p = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
s = p.read_text()
needle = """  it('schedules multiplayer playback against the shared round timestamp', () => {"""
case = """  it('preloads the next solo Battle track for gapless card transitions', () => {
    expect(source).toContain('preloadTrackPreviewSegment');
    expect(source).toContain('const next = solo.rounds[soloIndex + 1]');
    expect(source).toContain('const preloadKey = `solo:${next.trackId}:${soloIndex + 1}:0`');
    expect(audioSource).toContain('standbySound');
    expect(audioSource).toContain('if (standbyKey === key && standbySound)');
  });

"""
if needle not in s:
    raise SystemExit('test insertion anchor missing')
s = s.replace(needle, case + needle, 1)
p.write_text(s)
