from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / 'packages/mobile/src/services/publicProfileStateService.ts'
OWNER = ROOT / 'packages/mobile/src/screens/ProfilePublicScreen.tsx'
VISITOR = ROOT / 'packages/mobile/src/screens/PublicUserProfileScreen.tsx'
COMPONENT = ROOT / 'packages/mobile/src/components/DiscoveryImpactLabel.tsx'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


component = '''import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DiscoveryImpact } from '../services/publicProfileStateService';

type Props = {
  impact?: DiscoveryImpact | null;
};

export default function DiscoveryImpactLabel({ impact }: Props) {
  if (!impact || impact.recoveryCount <= 0) return null;
  const keepWord = impact.recoveryCount > 1 ? 'KEEP générés' : 'KEEP généré';
  const userWord = impact.uniqueUsers > 1 ? 'utilisateurs' : 'utilisateur';
  return (
    <View style={styles.row} accessibilityLabel={`${impact.recoveryCount} KEEP générés par cette découverte`}>
      <Text style={styles.text}>↗ {impact.recoveryCount} {keepWord} par {impact.uniqueUsers} {userWord}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 4, alignSelf: 'flex-start' },
  text: { color: '#7CF2B9', fontSize: 9, lineHeight: 13, fontWeight: '900' },
});
'''
COMPONENT.write_text(component, encoding='utf-8')

service = SERVICE.read_text(encoding='utf-8')
service = replace_once(
    service,
    "export type OwnProfileSnapshot = {\n  directKeeps: number;\n  socialKeeps: number;\n  totalKeeps: number;\n  publicKeeps: number;\n  privateKeeps: number;\n};\n",
    "export type OwnProfileSnapshot = {\n  directKeeps: number;\n  socialKeeps: number;\n  totalKeeps: number;\n  publicKeeps: number;\n  privateKeeps: number;\n};\n\nexport type DiscoveryImpact = {\n  originProfileId: string;\n  recoveryCount: number;\n  uniqueUsers: number;\n};\n",
    'service type',
)
service += '''\n\nexport async function loadProfileDiscoveryImpacts(profileId: string): Promise<Record<string, DiscoveryImpact>> {\n  if (!supabase || !profileId) return {};\n  const { data, error } = await supabase.rpc('keep_profile_discovery_impacts', { p_profile_id: profileId });\n  if (error) throw error;\n  const impacts: Record<string, DiscoveryImpact> = {};\n  for (const row of Array.isArray(data) ? data : []) {\n    const trackId = String(row?.track_id || '');\n    const originProfileId = String(row?.origin_profile_id || '');\n    if (!trackId || !originProfileId) continue;\n    impacts[trackId] = {\n      originProfileId,\n      recoveryCount: Number(row?.recovery_count || 0),\n      uniqueUsers: Number(row?.unique_users || 0),\n    };\n  }\n  return impacts;\n}\n'''
SERVICE.write_text(service, encoding='utf-8')

owner = OWNER.read_text(encoding='utf-8')
owner = replace_once(
    owner,
    "import { loadOwnProfileKeeps, loadOwnProfileSnapshot, loadPublicProfileSnapshot, OwnProfileSnapshot, ProfileCertificationTier, PublicProfileKeep, PublicProfileSnapshot } from '../services/publicProfileStateService';",
    "import { DiscoveryImpact, loadOwnProfileKeeps, loadOwnProfileSnapshot, loadProfileDiscoveryImpacts, loadPublicProfileSnapshot, OwnProfileSnapshot, ProfileCertificationTier, PublicProfileKeep, PublicProfileSnapshot } from '../services/publicProfileStateService';",
    'owner service import',
)
owner = replace_once(
    owner,
    "import ProfileCounterRow from '../components/ProfileCounterRow';",
    "import ProfileCounterRow from '../components/ProfileCounterRow';\nimport DiscoveryImpactLabel from '../components/DiscoveryImpactLabel';",
    'owner component import',
)
owner = replace_once(
    owner,
    "  const [ownSnapshot, setOwnSnapshot] = useState<OwnProfileSnapshot | null>(null);\n  const [serverOwnKeeps, setServerOwnKeeps] = useState<PublicProfileKeep[]>([]);",
    "  const [ownSnapshot, setOwnSnapshot] = useState<OwnProfileSnapshot | null>(null);\n  const [serverOwnKeeps, setServerOwnKeeps] = useState<PublicProfileKeep[]>([]);\n  const [discoveryImpacts, setDiscoveryImpacts] = useState<Record<string, DiscoveryImpact>>({});",
    'owner state',
)
owner = replace_once(
    owner,
    "          setOwnSnapshot(null);\n          setServerOwnKeeps([]);",
    "          setOwnSnapshot(null);\n          setServerOwnKeeps([]);\n          setDiscoveryImpacts({});",
    'owner reset',
)
owner = replace_once(
    owner,
    "        const [publicState, ownState, ownKeeps] = await Promise.all([\n          loadPublicProfileSnapshot(user.id),\n          loadOwnProfileSnapshot(),\n          loadOwnProfileKeeps(),\n        ]);",
    "        const [publicState, ownState, ownKeeps, impacts] = await Promise.all([\n          loadPublicProfileSnapshot(user.id),\n          loadOwnProfileSnapshot(),\n          loadOwnProfileKeeps(),\n          loadProfileDiscoveryImpacts(user.id),\n        ]);",
    'owner parallel load',
)
owner = replace_once(
    owner,
    "          setOwnSnapshot(ownState);\n          setServerOwnKeeps(ownKeeps);",
    "          setOwnSnapshot(ownState);\n          setServerOwnKeeps(ownKeeps);\n          setDiscoveryImpacts(impacts);",
    'owner set impact',
)
# catch block has the same snapshot resets a second time.
owner = replace_once(
    owner,
    "          setOwnSnapshot(null);\n          setServerOwnKeeps([]);",
    "          setOwnSnapshot(null);\n          setServerOwnKeeps([]);\n          setDiscoveryImpacts({});",
    'owner catch reset',
)
owner = replace_once(
    owner,
    "        </View> : null}\n        <View style={s.trackMetaRow}>",
    "        </View> : null}\n        {originKind ? <DiscoveryImpactLabel impact={discoveryImpacts[track.id]} /> : null}\n        <View style={s.trackMetaRow}>",
    'owner impact label',
)
OWNER.write_text(owner, encoding='utf-8')

visitor = VISITOR.read_text(encoding='utf-8')
visitor = replace_once(
    visitor,
    "import { loadPublicProfileKeeps, loadPublicProfileSnapshot, ProfileCertificationTier, PublicProfileSnapshot } from '../services/publicProfileStateService';",
    "import { DiscoveryImpact, loadProfileDiscoveryImpacts, loadPublicProfileKeeps, loadPublicProfileSnapshot, ProfileCertificationTier, PublicProfileSnapshot } from '../services/publicProfileStateService';",
    'visitor service import',
)
visitor = replace_once(
    visitor,
    "import ProfileCounterRow from '../components/ProfileCounterRow';",
    "import ProfileCounterRow from '../components/ProfileCounterRow';\nimport DiscoveryImpactLabel from '../components/DiscoveryImpactLabel';",
    'visitor component import',
)
visitor = replace_once(
    visitor,
    "  const [socialKeepCount, setSocialKeepCount] = useState(0);\n  const [viewerKeepTrackIds, setViewerKeepTrackIds] = useState<Set<string>>(new Set());",
    "  const [socialKeepCount, setSocialKeepCount] = useState(0);\n  const [discoveryImpacts, setDiscoveryImpacts] = useState<Record<string, DiscoveryImpact>>({});\n  const [viewerKeepTrackIds, setViewerKeepTrackIds] = useState<Set<string>>(new Set());",
    'visitor state',
)
visitor = replace_once(
    visitor,
    "      setPublicSnapshot(null);\n      setViewerKeepTrackIds(new Set());",
    "      setPublicSnapshot(null);\n      setDiscoveryImpacts({});\n      setViewerKeepTrackIds(new Set());",
    'visitor reset',
)
visitor = replace_once(
    visitor,
    "        const snapshotPromise = loadPublicProfileSnapshot(result.id).catch(() => null);",
    "        const snapshotPromise = loadPublicProfileSnapshot(result.id).catch(() => null);\n        const impactPromise = loadProfileDiscoveryImpacts(result.id).catch(() => ({}));",
    'visitor impact promise',
)
visitor = replace_once(
    visitor,
    "        if (cancelled) return;\n        setTracks(normalized);\n        const localSocialCount",
    "        if (cancelled) return;\n        setTracks(normalized);\n        const impacts = await impactPromise;\n        if (cancelled) return;\n        setDiscoveryImpacts(impacts);\n        const localSocialCount",
    'visitor set impact',
)
visitor = replace_once(
    visitor,
    "              const discoveryUsername = track.sourceUsername || (directDiscovery ? profile.username : '');\n              return <View key={track.id} style={styles.musicRow}>",
    "              const discoveryUsername = track.sourceUsername || (directDiscovery ? profile.username : '');\n              const discoveryImpact = discoveryImpacts[track.trackId];\n              return <View key={track.id} style={styles.musicRow}>",
    'visitor impact variable',
)
visitor = replace_once(
    visitor,
    "                  </View>\n                  <View style={styles.trackActions}>",
    "                  </View>\n                  <DiscoveryImpactLabel impact={discoveryImpact} />\n                  <View style={styles.trackActions}>",
    'visitor impact label',
)
VISITOR.write_text(visitor, encoding='utf-8')

# Contracts: both profile surfaces must expose the same impact label and only one RPC per profile load.
for path in (OWNER, VISITOR):
    text = path.read_text(encoding='utf-8')
    if 'DiscoveryImpactLabel' not in text or 'loadProfileDiscoveryImpacts' not in text:
        raise SystemExit(f'missing discovery impact contract in {path.name}')
print('Discovery attribution UI patch applied to owner + visitor profiles.')
