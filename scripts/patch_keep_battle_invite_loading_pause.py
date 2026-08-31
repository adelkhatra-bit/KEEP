from pathlib import Path

p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()

old = """  React.useEffect(() => {
    const round = solo?.rounds[soloIndex];
    if (!round) return undefined;
    let alive = true;
    setSoloStartedAt(0); setAudioReady(false);
    const start = async () => {
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
    };
    void start();
    return () => { alive = false; void stopTrackPreview(); };
  }, [solo?.themeCode, soloIndex, playVerified]);"""
new = """  React.useEffect(() => {
    const round = solo?.rounds[soloIndex];
    if (!round || incoming[0] || pausedSoloRemaining !== null) return undefined;
    let alive = true;
    setSoloStartedAt(0); setAudioReady(false);
    const start = async () => {
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
    };
    void start();
    return () => { alive = false; void stopTrackPreview(); };
  }, [solo?.themeCode, soloIndex, playVerified, incoming[0]?.id, pausedSoloRemaining]);"""
if old not in s:
    raise SystemExit('solo playback effect target not found')
s = s.replace(old, new, 1)

old = """    if (activeIncomingId && pausedSoloRemaining === null && audioReady && soloStartedAt && !soloAnswer) {
      setPausedSoloRemaining(Math.max(0, ROUND_MS - (Date.now() - soloStartedAt)));
      setAudioReady(false);
      void stopTrackPreview();
      return;
    }"""
new = """    if (activeIncomingId && pausedSoloRemaining === null && !soloAnswer) {
      setPausedSoloRemaining(soloStartedAt ? Math.max(0, ROUND_MS - (Date.now() - soloStartedAt)) : ROUND_MS);
      setAudioReady(false);
      void stopTrackPreview();
      return;
    }"""
if old not in s:
    raise SystemExit('invite pause target not found')
s = s.replace(old, new, 1)
p.write_text(s)
