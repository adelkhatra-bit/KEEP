from pathlib import Path

battle = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = battle.read_text()

s = s.replace("import { playTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';", "import { playTrackPreviewSegment, preloadTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';")

# Preload next solo round while current audio is already playing.
anchor = """  const soloRemaining = soloStartedAt ? Math.max(0, ROUND_MS - (now - soloStartedAt)) : ROUND_MS;\n"""
preload = """  React.useEffect(() => {\n    if (!solo || !audioReady || incoming[0]) return;\n    const next = solo.rounds[soloIndex + 1];\n    if (!next?.previewUrl) return;\n    void preloadTrackPreviewSegment(next.previewUrl, 0).catch(() => {});\n  }, [solo?.themeCode, soloIndex, audioReady, incoming[0]?.id]);\n\n  const soloRemaining = soloStartedAt ? Math.max(0, ROUND_MS - (now - soloStartedAt)) : ROUND_MS;\n"""
if anchor not in s:
    raise SystemExit('solo preload anchor missing')
s = s.replace(anchor, preload, 1)

# Do not cut the current track at answer/timeout; next round replaces it once already preloaded.
s = s.replace("setSoloAnswer('__TIMEOUT__'); void stopTrackPreview(); animateResult();", "setSoloAnswer('__TIMEOUT__'); animateResult();", 1)
s = s.replace("void stopTrackPreview(); setSoloAnswer(choice);", "setSoloAnswer(choice);", 1)

# General close handler must work in solo, browse and arena.
old_close = """  const closeBattleArena = React.useCallback(() => {\n    void stopTrackPreview();\n    setAudioReady(false);\n    setPending(null);\n    setArena(null);\n    setBrowseOnline(false);\n    setSolo(null);\n    if (onExit) onExit();\n  }, [onExit]);"""
new_close = """  const closeBattle = React.useCallback(() => {\n    void stopTrackPreview();\n    void leaveSoloBattle().catch(() => {});\n    setAudioReady(false);\n    setPending(null);\n    setIncoming([]);\n    setArena(null);\n    setBrowseOnline(false);\n    setSoloFinished(false);\n    setSolo(null);\n    if (onExit) onExit();\n  }, [onExit]);"""
if old_close not in s:
    raise SystemExit('close handler missing')
s = s.replace(old_close, new_close, 1).replace('onPress={closeBattleArena}', 'onPress={closeBattle}')

# Add close affordance to solo-finished and solo-active states.
s = s.replace("return <View style={s.root}>\n        <View style={s.header}", "return <View style={s.root}>\n        <TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Fermer le Battle\" hitSlop={8} style={s.closeBattle} onPress={closeBattle}><Text style={s.closeBattleText}>×</Text></TouchableOpacity>\n        <View style={s.header}", 1)
s = s.replace("return <View style={s.root}>\n      <View style={s.header}", "return <View style={s.root}>\n      <TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Fermer le Battle\" hitSlop={8} style={s.closeBattle} onPress={closeBattle}><Text style={s.closeBattleText}>×</Text></TouchableOpacity>\n      <View style={s.header}", 1)

# Replace cramped inline invite actions with a dedicated full-width action row.
old_invite_actions = """<TouchableOpacity hitSlop={4} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity hitSlop={4} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? '…' : 'ACCEPTER'}</Text></TouchableOpacity>"""
new_invite_actions = """</View><View style={s.inviteActions}><TouchableOpacity hitSlop={6} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity hitSlop={6} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>{respondingChallengeId === incoming[0].id ? 'OUVERTURE…' : 'ACCEPTER'}</Text></TouchableOpacity>"""
if old_invite_actions not in s:
    raise SystemExit('invite actions anchor missing')
s = s.replace(old_invite_actions, new_invite_actions)

# Upgrade touch targets and readable type.
s = s.replace("inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }", "inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }")
s = s.replace("inviteLabel: { color: '#E5F266', fontSize: 11, fontWeight: '900', marginTop: 2 }", "inviteLabel: { color: '#E5F266', fontSize: 13, fontWeight: '900', marginTop: 3 }")
s = s.replace("inviteName: { color: '#FFF', fontSize: 13, fontWeight: '900' }", "inviteName: { color: '#FFF', fontSize: 15, fontWeight: '900' }")
s = s.replace("inviteQuestion: { color: '#F3EDF7', fontSize: 12, lineHeight: 16, fontWeight: '800' }", "inviteQuestion: { color: '#F3EDF7', fontSize: 14, lineHeight: 19, fontWeight: '800' }")
s = s.replace("no: { minHeight: 44, paddingHorizontal: 12, borderRadius: 15", "inviteActions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 8 }, no: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 16")
s = s.replace("noText: { color: '#FFF', fontSize: 11, fontWeight: '900' }", "noText: { color: '#FFF', fontSize: 13, fontWeight: '900' }")
s = s.replace("yes: { minHeight: 44, paddingHorizontal: 12, borderRadius: 15", "yes: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 16")
s = s.replace("yesText: { color: '#17130B', fontSize: 11, fontWeight: '900' }", "yesText: { color: '#17130B', fontSize: 13, fontWeight: '900' }")

battle.write_text(s)

# Audio service: maintain a separately preloaded next sound and consume it on the next play.
audio = Path('packages/mobile/src/services/audioPreviewService.ts')
a = audio.read_text()
a = a.replace("let activeStartTimer: ReturnType<typeof setTimeout> | null = null;", "let activeStartTimer: ReturnType<typeof setTimeout> | null = null;\nlet preloadedSound: Audio.Sound | null = null;\nlet preloadedUrl: string | null = null;\nlet preloadedPosition = 0;")

insert_anchor = """/**\n * Lit un segment court pour KEEP Battle."""
preload_fn = """export async function preloadTrackPreviewSegment(previewUrl: string, positionMillis = 0): Promise<void> {\n  const effectivePosition = positionMillis > 0 ? positionMillis : 9000;\n  if (preloadedSound && preloadedUrl === previewUrl && preloadedPosition === effectivePosition) return;\n  const previous = preloadedSound;\n  preloadedSound = null; preloadedUrl = null; preloadedPosition = 0;\n  if (previous) { try { await previous.unloadAsync(); } catch {} }\n  await configurePreviewAudio();\n  const sound = await createSoundWithRetry(previewUrl, effectivePosition, (status, current) => {\n    if (!status.isLoaded) return;\n    if (activeSound === current) activeStateListener?.(status.isPlaying);\n  }, false);\n  preloadedSound = sound; preloadedUrl = previewUrl; preloadedPosition = effectivePosition;\n}\n\n/**\n * Lit un segment court pour KEEP Battle."""
if insert_anchor not in a:
    raise SystemExit('audio insert anchor missing')
a = a.replace(insert_anchor, preload_fn, 1)

old_create = """    const createdSound = await createSoundWithRetry(previewUrl, effectivePosition, (status, sound) => {"""
new_create = """    let createdSound: Audio.Sound;\n    if (preloadedSound && preloadedUrl === previewUrl && preloadedPosition === effectivePosition) {\n      createdSound = preloadedSound;\n      preloadedSound = null; preloadedUrl = null; preloadedPosition = 0;\n      await ensurePlaying(createdSound);\n    } else createdSound = await createSoundWithRetry(previewUrl, effectivePosition, (status, sound) => {"""
if old_create not in a:
    raise SystemExit('audio play create anchor missing')
a = a.replace(old_create, new_create, 1)
# close the else create call currently ends with '    });' before activeSound assignment; transform first occurrence after marker.
marker = """      }\n    });\n\n    activeSound = createdSound;\n    activeKey = key;"""
replacement = """      }\n    });\n\n    activeSound = createdSound;\n    activeKey = key;"""
# syntax remains valid because else expression is a single await assignment.
if marker not in a:
    raise SystemExit('audio play close anchor missing')

audio.write_text(a)
