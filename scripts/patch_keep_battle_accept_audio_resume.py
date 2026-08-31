from pathlib import Path

component = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = component.read_text()

s = s.replace(
"import { playTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';",
"import { playTrackPreviewSegment, primePreviewAudioGesture, scheduleTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';",
1,
)

anchor = """  const shareArenaInvite = React.useCallback(async (state: KeepBattleArenaState) => {\n    const link = buildKeepBattleArenaInviteLink(state.arenaCode);\n    await Share.share({ message: `Rejoins notre KEEP Battle ⚡\\n${state.seats.length} joueur${state.seats.length > 1 ? 's' : ''} déjà dans le groupe\\n${link}` });\n  }, []);\n"""
insert = anchor + """\n  const loadArenaWithRetry = React.useCallback(async (arenaId: string): Promise<KeepBattleArenaState> => {\n    let lastError: unknown = null;\n    for (let attempt = 0; attempt < 8; attempt += 1) {\n      try {\n        return await loadKeepBattleArena(arenaId);\n      } catch (error) {\n        lastError = error;\n        await wait(160 + attempt * 120);\n      }\n    }\n    throw lastError instanceof Error ? lastError : new Error('BATTLE_ARENA_LOAD_FAILED');\n  }, []);\n"""
if anchor not in s:
    raise SystemExit('share arena anchor missing')
s = s.replace(anchor, insert, 1)

s = s.replace("setArena(await loadKeepBattleArena(accepted.arenaId));", "setArena(await loadArenaWithRetry(accepted.arenaId));", 1)
s = s.replace("}, [enabled, solo, browseOnline, handledOutgoingId, animateVersus, shareInvite]);", "}, [enabled, solo, browseOnline, handledOutgoingId, animateVersus, shareInvite, loadArenaWithRetry]);", 1)

old = """      if (accept && response.arenaId) {\n        await stopTrackPreview();\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setBrowseOnline(false); setAudioReady(false);\n        setArena(await loadKeepBattleArena(response.arenaId));\n        animateVersus();\n      }\n"""
new = """      if (accept && response.arenaId) {\n        const loadedArena = await loadArenaWithRetry(response.arenaId);\n        await stopTrackPreview();\n        await leaveSoloBattle().catch(() => {});\n        setSolo(null); setBrowseOnline(false); setAudioReady(false);\n        setArena(loadedArena);\n        animateVersus();\n      }\n"""
if old not in s:
    raise SystemExit('respond accept anchor missing')
s = s.replace(old, new, 1)

avatar_fn = """  const Avatar = ({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) => url\n    ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />\n    : <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}><Text style={s.avatarLetter}>{initial(name)}</Text></View>;\n"""
render_fn = avatar_fn + """\n  const renderBattleInvite = (item: KeepBattleIncomingChallenge, seconds: number, primeUrl?: string | null) => (\n    <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}>\n      <View style={s.inviteHeader}>\n        <Avatar name={item.username} url={item.avatarUrl} size={38} />\n        <View style={{ flex: 1 }}>\n          <Text style={s.inviteQuestion}><Text style={s.inviteName}>@{item.username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text>\n          <Text style={s.inviteLabel}>⚡ {themeLabel(item.themeCode)} · {seconds}s</Text>\n        </View>\n      </View>\n      <View style={s.inviteActions}>\n        <TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Refuser le Battle\" hitSlop={6} disabled={Boolean(respondingChallengeId)} style={[s.no, respondingChallengeId && s.actionDisabled]} onPress={() => { void respond(item, false); }}>\n          <Text style={s.noText}>REFUSER</Text>\n        </TouchableOpacity>\n        <TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Accepter le Battle\" hitSlop={6} disabled={Boolean(respondingChallengeId)} style={[s.yes, respondingChallengeId && s.actionDisabled]} onPress={() => { primePreviewAudioGesture(primeUrl); void respond(item, true); }}>\n          <Text style={s.yesText}>{respondingChallengeId === item.id ? '…' : 'ACCEPTER'}</Text>\n        </TouchableOpacity>\n      </View>\n    </Animated.View>\n  );\n"""
if avatar_fn not in s:
    raise SystemExit('Avatar anchor missing')
s = s.replace(avatar_fn, render_fn, 1)

import re
pattern = re.compile(r"\{incoming\[0\] \? <Animated\.View style=\{\[s\.invite, \{ transform: \[\{ scale: pulse \}\] \}\]\}>.*?</Animated\.View> : null\}", re.S)
matches = list(pattern.finditer(s))
if len(matches) < 2:
    raise SystemExit(f'expected at least 2 invite blocks, got {len(matches)}')
# Replace from end to preserve indices. First occurrence is solo, second browse.
for idx, m in reversed(list(enumerate(matches[:2]))):
    repl = "{incoming[0] ? renderBattleInvite(incoming[0], browseChallengeRemaining) : null}" if idx == 1 else "{incoming[0] ? renderBattleInvite(incoming[0], challengeRemaining, round.previewUrl) : null}"
    s = s[:m.start()] + repl + s[m.end():]

s = s.replace(
"<TouchableOpacity style={s.mainButton} disabled={busy} onPress={() => { void startSolo(); }}>",
"<TouchableOpacity style={s.mainButton} disabled={busy} onPress={() => { primePreviewAudioGesture(); void startSolo(); }}>",
1,
)
s = s.replace(
"<TouchableOpacity disabled={busy} style={s.finishPrimary} onPress={() => { setBusy(true); void startKeepBattleArena(arena.id)",
"<TouchableOpacity disabled={busy} style={s.finishPrimary} onPress={() => { primePreviewAudioGesture(); setBusy(true); void startKeepBattleArena(arena.id)",
1,
)

# Make the invitation visibly larger while retaining the 390px layout: action buttons are stacked below text.
replacements = {
"invite: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 11, backgroundColor: '#241730', borderWidth: 1, borderColor: '#E5F266' }":
"invite: { marginTop: 7, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 16, backgroundColor: '#241730', borderWidth: 2, borderColor: '#E5F266' }",
"inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 5 }":
"inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, inviteActions: { flexDirection: 'row', gap: 8, marginTop: 9 }",
"inviteLabel: { color: '#E5F266', fontSize: 9, fontWeight: '900', marginTop: 2 }":
"inviteLabel: { color: '#E5F266', fontSize: 11, lineHeight: 14, fontWeight: '900', marginTop: 3 }",
"inviteName: { color: '#FFF', fontSize: 12, fontWeight: '900' }":
"inviteName: { color: '#FFF', fontSize: 14, fontWeight: '900' }",
"inviteQuestion: { color: '#F3EDF7', fontSize: 11, lineHeight: 14, fontWeight: '800' }":
"inviteQuestion: { color: '#F3EDF7', fontSize: 13, lineHeight: 17, fontWeight: '800' }",
"no: { minHeight: 44, minWidth: 76, paddingHorizontal: 10, borderRadius: 22, borderWidth: 1, borderColor: '#4B3C57', alignItems: 'center', justifyContent: 'center' }":
"no: { flex: 1, minHeight: 50, paddingHorizontal: 12, borderRadius: 25, borderWidth: 2, borderColor: '#6D5B7B', alignItems: 'center', justifyContent: 'center' }",
"noText: { color: '#FFF', fontSize: 10, fontWeight: '900' }":
"noText: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: .3 }",
"yes: { minHeight: 44, minWidth: 76, paddingHorizontal: 10, borderRadius: 22, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }":
"yes: { flex: 1, minHeight: 50, paddingHorizontal: 12, borderRadius: 25, borderWidth: 2, borderColor: '#F4FF82', backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }",
"yesText: { color: '#17130B', fontSize: 10, fontWeight: '900' }":
"yesText: { color: '#17130B', fontSize: 12, fontWeight: '900', letterSpacing: .3 }",
}
for old_style, new_style in replacements.items():
    if old_style in s:
        s = s.replace(old_style, new_style, 1)

component.write_text(s)

# Audio: prime browser media permission on the actual user gesture, so scheduled Battle playback
# does not require tapping the music note after a transition.
audio = Path('packages/mobile/src/services/audioPreviewService.ts')
a = audio.read_text()
if 'export function primePreviewAudioGesture' not in a:
    a += """\n\n/**\n * Amorçage du média web pendant le geste utilisateur (JOUER / ACCEPTER / REVANCHE).\n * Safari/Chrome peuvent bloquer un playAsync lancé plus tard par un timer réseau.\n * Ce mini-play immédiat conserve l'autorisation média du document, sans son audible.\n */\nexport function primePreviewAudioGesture(previewUrl?: string | null): void {\n  if (typeof globalThis === 'undefined') return;\n  const AudioCtor = (globalThis as any).Audio;\n  if (typeof AudioCtor !== 'function') return;\n  try {\n    const source = previewUrl || 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';\n    const media = new AudioCtor(source);\n    media.muted = true;\n    media.preload = 'auto';\n    const started = media.play?.();\n    if (started && typeof started.then === 'function') {\n      void started.then(() => { try { media.pause?.(); media.currentTime = 0; } catch {} }).catch(() => {});\n    }\n  } catch {}\n}\n"""
audio.write_text(a)
