from pathlib import Path

p = Path('packages/mobile/src/store/useSessionStore.ts')
s = p.read_text()

s = s.replace('export const DEFAULT_SESSION_SILENCE_TIMEOUT_MIN = 10;', 'export const DEFAULT_SESSION_SILENCE_TIMEOUT_MIN = 15;\nconst SILENCE_PROMPT_GRACE_MS = 60 * 1000;', 1)
s = s.replace(
    'let silenceCheckHandle: ReturnType<typeof setInterval> | null = null;\n',
    'let silenceCheckHandle: ReturnType<typeof setInterval> | null = null;\nlet silencePromptGraceHandle: ReturnType<typeof setTimeout> | null = null;\n',
    1,
)
s = s.replace(
    '  if (silenceCheckHandle) { clearInterval(silenceCheckHandle); silenceCheckHandle = null; }\n}',
    '  if (silenceCheckHandle) { clearInterval(silenceCheckHandle); silenceCheckHandle = null; }\n  if (silencePromptGraceHandle) { clearTimeout(silencePromptGraceHandle); silencePromptGraceHandle = null; }\n}',
    1,
)
s = s.replace(
    '  dismissEndPrompt: () => { lastDetectionAt = Date.now(); set({ showEndPrompt: false }); },',
    '  dismissEndPrompt: () => {\n    if (silencePromptGraceHandle) { clearTimeout(silencePromptGraceHandle); silencePromptGraceHandle = null; }\n    lastDetectionAt = Date.now();\n    set({ showEndPrompt: false });\n  },',
    1,
)
s = s.replace(
    '      if (!isActive || showEndPrompt) return;\n      if (Date.now() - lastDetectionAt >= silenceTimeoutMin * 60 * 1000) set({ showEndPrompt: true });',
    '      if (!isActive || showEndPrompt) return;\n      if (Date.now() - lastDetectionAt >= silenceTimeoutMin * 60 * 1000) {\n        set({ showEndPrompt: true });\n        if (silencePromptGraceHandle) clearTimeout(silencePromptGraceHandle);\n        silencePromptGraceHandle = setTimeout(() => {\n          silencePromptGraceHandle = null;\n          const current = get();\n          if (current.isActive && current.showEndPrompt) current.requestEndSession();\n        }, SILENCE_PROMPT_GRACE_MS);\n      }',
    1,
)

required = [
    'DEFAULT_SESSION_SILENCE_TIMEOUT_MIN = 15',
    'SILENCE_PROMPT_GRACE_MS',
    'silencePromptGraceHandle',
    'current.requestEndSession()',
]
for token in required:
    if token not in s:
        raise SystemExit(f'background-listen patch missing {token}')
p.write_text(s)

p = Path('packages/mobile/src/services/keepMusicCoreRecognition.ts')
s = p.read_text()
if "import { Platform } from 'react-native';" not in s:
    s = s.replace("import AsyncStorage from '@react-native-async-storage/async-storage';\n", "import AsyncStorage from '@react-native-async-storage/async-storage';\nimport { Platform } from 'react-native';\n", 1)
if "'x-keep-platform': Platform.OS" not in s:
    s = s.replace("        'x-keep-device-id': deviceId,\n", "        'x-keep-device-id': deviceId,\n        'x-keep-platform': Platform.OS,\n", 1)
if "'x-keep-platform': Platform.OS" not in s:
    raise SystemExit('platform header patch failed')
p.write_text(s)

print('background mobile listening patch applied')
