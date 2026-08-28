from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected 1 occurrence, got {count}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# 1) Le mobile passe par le gateway AudD durci, tout en conservant ACRCloud
# comme deuxième moteur si AudD ne reconnaît pas / est indisponible.
path = 'packages/mobile/src/services/keepMusicCoreRecognition.ts'
replace_once(
    path,
    "functionName: 'keep-music-core' | 'keep-music-fallback',",
    "functionName: 'keep-music-core' | 'keep-music-recognition-v2' | 'keep-music-fallback',",
)
replace_once(
    path,
    "  return String(attempt.payload?.message || attempt.payload?.error || (attempt.status ? `HTTP ${attempt.status}` : 'Reconnaissance indisponible'));",
    "  const code = String(attempt.payload?.error || '');\n  if (code === 'recognition_not_configured') return 'Reconnaissance musicale indisponible : configure une clé AudD valide ou ACRCloud dans le Super Admin KEEP.';\n  if (code === 'recognition_quota_exhausted') return 'Quota AudD épuisé : KEEP utilisera ACRCloud dès qu’il est configuré.';\n  if (code === 'recognition_network_error' || code === 'recognition_gateway_error') return 'Reconnaissance temporairement indisponible. KEEP continue d’écouter et réessaiera automatiquement.';\n  return String(attempt.payload?.message || attempt.payload?.error || (attempt.status ? `HTTP ${attempt.status}` : 'Reconnaissance indisponible'));",
)
replace_once(path, " * 1. AudD via `keep-music-core` (clé serveur/Vault),", " * 1. AudD via `keep-music-recognition-v2` (clé serveur/Vault validée),")
replace_once(path, "    const primary = await recognitionAttempt('keep-music-core', blob, accessToken, deviceId);", "    const primary = await recognitionAttempt('keep-music-recognition-v2', blob, accessToken, deviceId);")
replace_once(path, "  readonly providerId = 'keep-music-core';", "  readonly providerId = 'keep-music-recognition-v2';")

# 2) iOS : PlayAndRecord reste actif, mais en MixWithOthers pour que l'audio de
# l'autre app ne soit pas interrompu par KEEP quand le build natif est utilisé.
# expo-av exporte l'enum au niveau du module, pas sous l'objet Audio.
path = 'packages/mobile/src/services/micCapture.ts'
replace_once(
    path,
    "import { Audio } from 'expo-av';",
    "import { Audio, InterruptionModeIOS } from 'expo-av';",
)
replace_once(
    path,
    "        staysActiveInBackground: target,\n        shouldDuckAndroid: false,",
    "        staysActiveInBackground: target,\n        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,\n        shouldDuckAndroid: false,",
)

# 3) Empreinte audio : 3 secondes est souvent trop court avec haut-parleur de
# téléphone + bruit ambiant. On privilégie la couverture sans dépasser le
# plafond serveur de 12 tentatives/minute.
path = 'packages/mobile/src/store/useSessionStore.ts'
replace_once(
    path,
    "  if (consecutiveNoMatches >= 3) return 7000;\n  if (consecutiveNoMatches >= 1) return 4800;\n  return 3000;",
    "  if (consecutiveNoMatches >= 3) return 7500;\n  if (consecutiveNoMatches >= 1) return 6000;\n  return 4500;",
)

# 4) Le backend Express historique doit autoriser les mêmes clés que l'Edge
# Function Super Admin, sinon deux chemins admin divergents peuvent réapparaître.
path = 'packages/backend/src/routes/adminIntegrations.ts'
replace_once(
    path,
    "  AUDD_API_KEY: 'recognition',\n};",
    "  AUDD_API_KEY: 'recognition',\n  ACRCLOUD_ACCESS_KEY: 'recognition',\n  ACRCLOUD_ACCESS_SECRET: 'recognition',\n  ACRCLOUD_HOST: 'recognition',\n};",
)

# 5) Prépare Android 14+ aux permissions requises par un futur service micro
# foreground natif. Cela ne remplace pas à lui seul le service, mais évite un
# manifeste incomplet quand on l'active dans le build natif.
path = 'packages/mobile/app.json'
replace_once(
    path,
    '        "android.permission.RECORD_AUDIO",\n        "android.permission.ACCESS_COARSE_LOCATION",',
    '        "android.permission.RECORD_AUDIO",\n        "android.permission.FOREGROUND_SERVICE",\n        "android.permission.FOREGROUND_SERVICE_MICROPHONE",\n        "android.permission.POST_NOTIFICATIONS",\n        "android.permission.ACCESS_COARSE_LOCATION",',
)

print('Recognition gateway + mobile audio hardening applied')
