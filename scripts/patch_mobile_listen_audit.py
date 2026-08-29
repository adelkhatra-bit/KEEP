from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# 1) Session behavior: 15 minutes without a detection => prompt, then 60 seconds
# without a response => real session stop + microphone release.
p = Path('packages/mobile/src/store/useSessionStore.ts')
s = p.read_text()
s = replace_once(s, 'export const DEFAULT_SESSION_SILENCE_TIMEOUT_MIN = 10;', 'export const DEFAULT_SESSION_SILENCE_TIMEOUT_MIN = 15;\nconst SILENCE_PROMPT_GRACE_MS = 60 * 1000;', 'silence default')
s = replace_once(s,
'''let tickHandle: ReturnType<typeof setInterval> | null = null;\nlet silenceCheckHandle: ReturnType<typeof setInterval> | null = null;''',
'''let tickHandle: ReturnType<typeof setInterval> | null = null;\nlet silenceCheckHandle: ReturnType<typeof setInterval> | null = null;\nlet silencePromptGraceHandle: ReturnType<typeof setTimeout> | null = null;''',
'grace handle')
s = replace_once(s,
'''  if (silenceCheckHandle) { clearInterval(silenceCheckHandle); silenceCheckHandle = null; }\n}''',
'''  if (silenceCheckHandle) { clearInterval(silenceCheckHandle); silenceCheckHandle = null; }\n  if (silencePromptGraceHandle) { clearTimeout(silencePromptGraceHandle); silencePromptGraceHandle = null; }\n}''',
'clear grace')
s = replace_once(s,
'''  dismissEndPrompt: () => { lastDetectionAt = Date.now(); set({ showEndPrompt: false }); },''',
'''  dismissEndPrompt: () => {\n    if (silencePromptGraceHandle) { clearTimeout(silencePromptGraceHandle); silencePromptGraceHandle = null; }\n    lastDetectionAt = Date.now();\n    set({ showEndPrompt: false });\n  },''',
'dismiss grace')
s = replace_once(s,
'''      if (!isActive || showEndPrompt) return;\n      if (Date.now() - lastDetectionAt >= silenceTimeoutMin * 60 * 1000) set({ showEndPrompt: true });''',
'''      if (!isActive || showEndPrompt) return;\n      if (Date.now() - lastDetectionAt >= silenceTimeoutMin * 60 * 1000) {\n        set({ showEndPrompt: true });\n        if (silencePromptGraceHandle) clearTimeout(silencePromptGraceHandle);\n        silencePromptGraceHandle = setTimeout(() => {\n          silencePromptGraceHandle = null;\n          const current = get();\n          if (current.isActive && current.showEndPrompt) current.requestEndSession();\n        }, SILENCE_PROMPT_GRACE_MS);\n      }''',
'auto stop')
p.write_text(s)

# 2) Label every server fingerprint request with actual runtime platform.
p = Path('packages/mobile/src/services/keepMusicCoreRecognition.ts')
s = p.read_text()
if "import { Platform } from 'react-native';" not in s:
    s = replace_once(s, "import AsyncStorage from '@react-native-async-storage/async-storage';\n", "import AsyncStorage from '@react-native-async-storage/async-storage';\nimport { Platform } from 'react-native';\n", 'Platform import')
s = replace_once(s,
'''        'x-keep-device-id': deviceId,\n      },''',
'''        'x-keep-device-id': deviceId,\n        'x-keep-platform': Platform.OS,\n      },''',
'platform header')
p.write_text(s)

# 3) AudD server telemetry: authoritative measurement, not client-reported success.
p = Path('supabase/functions/keep-music-recognition-v2/index.ts')
s = p.read_text()
s = s.replace('content-type, x-keep-device-id",', 'content-type, x-keep-device-id, x-keep-platform",', 1)
s = replace_once(s,
'''async function allowRecognition(req: Request, userId: string | null) {''',
'''async function recordAttempt(req: Request, userId: string | null, outcome: string, startedAt: number, audioBytes?: number) {\n  try {\n    const rawPlatform = (req.headers.get("x-keep-platform") || "unknown").toLowerCase();\n    const platform = ["ios", "android", "web"].includes(rawPlatform) ? rawPlatform : "unknown";\n    const rawDevice = (req.headers.get("x-keep-device-id") || "guest").slice(0, 160);\n    const deviceHash = await sha256(`telemetry|${rawDevice}`);\n    await admin.from("music_recognition_attempts").insert({\n      profile_id: userId,\n      device_id_hash: deviceHash,\n      platform,\n      provider: "AUDD",\n      outcome,\n      latency_ms: Math.max(0, Date.now() - startedAt),\n      audio_bytes: typeof audioBytes === "number" ? audioBytes : null,\n    });\n  } catch {}\n}\n\nasync function allowRecognition(req: Request, userId: string | null) {''',
'audd telemetry helper')
s = replace_once(s,
'''async function recognize(req: Request) {\n  const userId = await optionalUserId(req);''',
'''async function recognize(req: Request) {\n  const startedAt = Date.now();\n  const userId = await optionalUserId(req);''',
'audd startedAt')
s = replace_once(s,
'''  if (!(await allowRecognition(req, userId))) {\n    return json(429, { error: "recognition_rate_limited", message: "KEEP écoute toujours. Nouvelle analyse dans quelques secondes." });\n  }''',
'''  if (!(await allowRecognition(req, userId))) {\n    await recordAttempt(req, userId, "RATE_LIMITED", startedAt);\n    return json(429, { error: "recognition_rate_limited", message: "KEEP écoute toujours. Nouvelle analyse dans quelques secondes." });\n  }''',
'audd rate limit')
s = replace_once(s,
'''    await setRuntimeStatus("NOT_CONFIGURED", "Clé AudD absente ou invalide dans Vault/Edge Secret");\n    return json(409, {''',
'''    await setRuntimeStatus("NOT_CONFIGURED", "Clé AudD absente ou invalide dans Vault/Edge Secret");\n    await recordAttempt(req, userId, "NOT_CONFIGURED", startedAt);\n    return json(409, {''',
'audd not configured')
s = replace_once(s,
'''  if (!(audio instanceof File)) return json(400, { error: "audio_required" });\n  if (audio.size < 1000) return json(400, { error: "audio_too_small" });\n  if (audio.size > 6 * 1024 * 1024) return json(413, { error: "audio_too_large" });''',
'''  if (!(audio instanceof File)) { await recordAttempt(req, userId, "INVALID_AUDIO", startedAt); return json(400, { error: "audio_required" }); }\n  if (audio.size < 1000) { await recordAttempt(req, userId, "INVALID_AUDIO", startedAt, audio.size); return json(400, { error: "audio_too_small" }); }\n  if (audio.size > 6 * 1024 * 1024) { await recordAttempt(req, userId, "INVALID_AUDIO", startedAt, audio.size); return json(413, { error: "audio_too_large" }); }''',
'audd invalid audio')
s = replace_once(s,
'''    await setRuntimeStatus("ERROR", detail);\n    return json(503, { error: "recognition_network_error", message: "KEEP n’arrive pas à joindre le moteur musical. L’écoute reste active." });''',
'''    await setRuntimeStatus("ERROR", detail);\n    await recordAttempt(req, userId, "NETWORK_ERROR", startedAt, audio.size);\n    return json(503, { error: "recognition_network_error", message: "KEEP n’arrive pas à joindre le moteur musical. L’écoute reste active." });''',
'audd network')
s = s.replace('await setRuntimeStatus("NOT_CONFIGURED", providerMessage);\n      return json(409,', 'await setRuntimeStatus("NOT_CONFIGURED", providerMessage);\n      await recordAttempt(req, userId, "NOT_CONFIGURED", startedAt, audio.size);\n      return json(409,', 1)
s = replace_once(s,
'''    await setRuntimeStatus("ERROR", providerMessage);\n    return json(502, { error: "recognition_provider_error",''',
'''    await setRuntimeStatus("ERROR", providerMessage);\n    await recordAttempt(req, userId, "PROVIDER_ERROR", startedAt, audio.size);\n    return json(502, { error: "recognition_provider_error",''',
'audd provider error')
s = replace_once(s,
'''  const recognition = await normalizeResult(payload?.result);\n  return json(200, { ok: true, provider: "AudD", credentialSource: credential.source, recognition });''',
'''  const recognition = await normalizeResult(payload?.result);\n  await recordAttempt(req, userId, recognition ? "MATCH" : "NO_MATCH", startedAt, audio.size);\n  return json(200, { ok: true, provider: "AudD", credentialSource: credential.source, recognition });''',
'audd result')
p.write_text(s)

# 4) ACRCloud telemetry.
p = Path('supabase/functions/keep-music-fallback/index.ts')
s = p.read_text()
s = s.replace('content-type, x-keep-device-id",', 'content-type, x-keep-device-id, x-keep-platform",', 1)
s = replace_once(s,
'''async function allowFallback(req: Request, userId: string | null) {''',
'''async function recordAttempt(req: Request, userId: string | null, outcome: string, startedAt: number, audioBytes?: number) {\n  try {\n    const rawPlatform = (req.headers.get("x-keep-platform") || "unknown").toLowerCase();\n    const platform = ["ios", "android", "web"].includes(rawPlatform) ? rawPlatform : "unknown";\n    const rawDevice = (req.headers.get("x-keep-device-id") || "guest").slice(0, 160);\n    const deviceHash = await sha256(`telemetry|${rawDevice}`);\n    await admin.from("music_recognition_attempts").insert({ profile_id: userId, device_id_hash: deviceHash, platform, provider: "ACRCLOUD", outcome, latency_ms: Math.max(0, Date.now() - startedAt), audio_bytes: typeof audioBytes === "number" ? audioBytes : null });\n  } catch {}\n}\n\nasync function allowFallback(req: Request, userId: string | null) {''',
'acr telemetry helper')
s = replace_once(s,
'''async function identify(req: Request) {\n  const userId = await optionalUserId(req);''',
'''async function identify(req: Request) {\n  const startedAt = Date.now();\n  const userId = await optionalUserId(req);''',
'acr startedAt')
s = replace_once(s,
'''  if (!(await allowFallback(req, userId))) {\n    return json(429, { error: "fallback_rate_limited",''',
'''  if (!(await allowFallback(req, userId))) {\n    await recordAttempt(req, userId, "RATE_LIMITED", startedAt);\n    return json(429, { error: "fallback_rate_limited",''',
'acr rate limit')
s = replace_once(s,
'''  if (!accessKey || !accessSecret || !rawHost) {\n    return json(409, {''',
'''  if (!accessKey || !accessSecret || !rawHost) {\n    await recordAttempt(req, userId, "NOT_CONFIGURED", startedAt);\n    return json(409, {''',
'acr not configured')
s = replace_once(s,
'''  if (!(audio instanceof File)) return json(400, { error: "audio_required" });\n  if (audio.size < 1000) return json(400, { error: "audio_too_small" });\n  if (audio.size > 5 * 1024 * 1024) return json(413, { error: "audio_too_large" });''',
'''  if (!(audio instanceof File)) { await recordAttempt(req, userId, "INVALID_AUDIO", startedAt); return json(400, { error: "audio_required" }); }\n  if (audio.size < 1000) { await recordAttempt(req, userId, "INVALID_AUDIO", startedAt, audio.size); return json(400, { error: "audio_too_small" }); }\n  if (audio.size > 5 * 1024 * 1024) { await recordAttempt(req, userId, "INVALID_AUDIO", startedAt, audio.size); return json(413, { error: "audio_too_large" }); }''',
'acr invalid audio')
s = replace_once(s,
'''  if (!response.ok) {\n    return json(502, { error: "acrcloud_http_error",''',
'''  if (!response.ok) {\n    await recordAttempt(req, userId, "PROVIDER_ERROR", startedAt, audio.size);\n    return json(502, { error: "acrcloud_http_error",''',
'acr http error')
s = replace_once(s,
'''  if (statusCode !== 0) {\n    return json(200, { ok: true, provider: "ACRCloud", recognition: null, providerStatus: statusCode });\n  }''',
'''  if (statusCode !== 0) {\n    await recordAttempt(req, userId, "NO_MATCH", startedAt, audio.size);\n    return json(200, { ok: true, provider: "ACRCloud", recognition: null, providerStatus: statusCode });\n  }''',
'acr no match')
s = replace_once(s,
'''  const music = Array.isArray(body?.metadata?.music) ? body.metadata.music[0] : null;\n  return json(200, { ok: true, provider: "ACRCloud", recognition: normalizeAcrMusic(music) });''',
'''  const music = Array.isArray(body?.metadata?.music) ? body.metadata.music[0] : null;\n  const recognition = normalizeAcrMusic(music);\n  await recordAttempt(req, userId, recognition ? "MATCH" : "NO_MATCH", startedAt, audio.size);\n  return json(200, { ok: true, provider: "ACRCloud", recognition });''',
'acr result')
p.write_text(s)

print('mobile listen audit patch applied')
