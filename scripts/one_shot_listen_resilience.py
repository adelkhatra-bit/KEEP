from pathlib import Path


def patch(path, replacements):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    for label, old, new in replacements:
        count = text.count(old)
        if count != 1:
            raise SystemExit(f'{path} / {label}: expected 1 occurrence, found {count}')
        text = text.replace(old, new, 1)
    p.write_text(text, encoding='utf-8')

patch('packages/mobile/src/store/useSessionStore.ts', [
    ('cadence constants',
     "const RECOGNITION_TICK_MS = 900;\nconst SILENCE_CHECK_INTERVAL_MS = 15000;",
     "const RECOGNITION_TICK_MS = 900;\n// Le tick UI reste réactif, mais les appels de fingerprint sont volontairement\n// espacés pour éviter qu'une écoute continue brûle le quota fournisseur.\nconst MIN_RECOGNITION_ATTEMPT_GAP_MS = 8000;\nconst NEW_MATCH_COOLDOWN_MS = 16000;\nconst SAME_TRACK_COOLDOWN_MS = 25000;\nconst SILENCE_CHECK_INTERVAL_MS = 15000;"),
    ('cadence state',
     "let lastDetectionAt = 0;\nlet consecutiveNoMatches = 0;",
     "let lastDetectionAt = 0;\nlet nextRecognitionAllowedAt = 0;\nlet consecutiveNoMatches = 0;"),
    ('start reset',
     "    lastDetectionAt = Date.now();\n    consecutiveNoMatches = 0;",
     "    lastDetectionAt = Date.now();\n    nextRecognitionAllowedAt = 0;\n    consecutiveNoMatches = 0;"),
    ('tick gate',
     "    const tick = async () => {\n      if (!get().isActive || get().recognizing) return;\n      set({ recognizing: true });",
     "    const tick = async () => {\n      if (!get().isActive || get().recognizing) return;\n      const now = Date.now();\n      if (now < nextRecognitionAllowedAt) return;\n      nextRecognitionAllowedAt = now + MIN_RECOGNITION_ATTEMPT_GAP_MS;\n      set({ recognizing: true });"),
    ('same track cooldown',
     "        if (last && sameTrack(last.track, track)) {\n          lastDetectionAt = Date.now();\n          set({ recognizing: false, micLevel: 0, showEndPrompt: false, error: null });",
     "        if (last && sameTrack(last.track, track)) {\n          lastDetectionAt = Date.now();\n          nextRecognitionAllowedAt = Date.now() + SAME_TRACK_COOLDOWN_MS;\n          set({ recognizing: false, micLevel: 0, showEndPrompt: false, error: null });"),
    ('new match cooldown',
     "        consecutiveNoMatches = 0;\n\n        const track = musicEngine.trackResolver.resolveFromRecognition(recognition);",
     "        consecutiveNoMatches = 0;\n\n        const track = musicEngine.trackResolver.resolveFromRecognition(recognition);"),
    ('new entry cooldown',
     "        lastDetectionAt = Date.now();\n        set((s) => ({ tracks: [entry, ...s.tracks], recognizing: false, micLevel: 0, showEndPrompt: false, error: null }));",
     "        lastDetectionAt = Date.now();\n        nextRecognitionAllowedAt = Date.now() + NEW_MATCH_COOLDOWN_MS;\n        set((s) => ({ tracks: [entry, ...s.tracks], recognizing: false, micLevel: 0, showEndPrompt: false, error: null }));"),
])

patch('packages/mobile/src/services/keepMusicCoreRecognition.ts', [
    ('backoff constant',
     "const FALLBACK_RECHECK_MS = 5 * 60 * 1000;\nlet fallbackUnavailableUntil = 0;",
     "const FALLBACK_RECHECK_MS = 5 * 60 * 1000;\nconst PROVIDER_RATE_LIMIT_BACKOFF_MS = 65 * 1000;\nlet fallbackUnavailableUntil = 0;\nlet recognitionBackoffUntil = 0;"),
    ('early backoff',
     "    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample], { type: 'audio/wav' });\n    if (!blob.size) return null;\n\n    const [accessToken, deviceId]",
     "    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample], { type: 'audio/wav' });\n    if (!blob.size) return null;\n    // Un 429 précédent ne doit ni afficher une erreur rouge ni relancer le\n    // serveur à chaque échantillon. L'écoute reste active et reprend seule.\n    if (Date.now() < recognitionBackoffUntil) return null;\n\n    const [accessToken, deviceId]"),
    ('primary flag',
     "    const primary = await recognitionAttempt('keep-music-core', blob, accessToken, deviceId);\n    if (primary.ok && primary.payload?.recognition) {",
     "    const primary = await recognitionAttempt('keep-music-core', blob, accessToken, deviceId);\n    const primaryRateLimited = primary.status === 429 || primary.payload?.error === 'recognition_rate_limited';\n    if (primary.ok && primary.payload?.recognition) {\n      recognitionBackoffUntil = 0;"),
    ('known fallback unavailable',
     "    if (fallbackKnownUnavailable()) {\n      if (primary.ok) return null;\n      throw new Error(attemptMessage(primary));\n    }",
     "    if (fallbackKnownUnavailable()) {\n      if (primaryRateLimited) {\n        recognitionBackoffUntil = Date.now() + PROVIDER_RATE_LIMIT_BACKOFF_MS;\n        return null;\n      }\n      if (primary.ok) return null;\n      throw new Error(attemptMessage(primary));\n    }"),
    ('fallback success',
     "    if (fallback.ok && fallback.payload?.recognition) {\n      fallbackUnavailableUntil = 0;\n      return fallback.payload.recognition as RecognitionResult;\n    }",
     "    if (fallback.ok && fallback.payload?.recognition) {\n      fallbackUnavailableUntil = 0;\n      recognitionBackoffUntil = 0;\n      return fallback.payload.recognition as RecognitionResult;\n    }\n\n    if (fallback.status === 429 || fallback.payload?.error === 'fallback_rate_limited') {\n      recognitionBackoffUntil = Date.now() + PROVIDER_RATE_LIMIT_BACKOFF_MS;\n      return null;\n    }"),
    ('fallback unconfigured',
     "    if (fallback.status === 409 || fallback.payload?.error === 'fallback_not_configured') {\n      markFallbackUnavailable();\n      if (primary.ok) return null;\n      throw new Error(attemptMessage(primary));\n    }",
     "    if (fallback.status === 409 || fallback.payload?.error === 'fallback_not_configured') {\n      markFallbackUnavailable();\n      if (primaryRateLimited) {\n        recognitionBackoffUntil = Date.now() + PROVIDER_RATE_LIMIT_BACKOFF_MS;\n        return null;\n      }\n      if (primary.ok) return null;\n      throw new Error(attemptMessage(primary));\n    }"),
])

print('Listening resilience patch applied')
