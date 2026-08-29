from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OWNER = ROOT / 'packages/mobile/src/screens/ProfilePublicScreen.tsx'
VISITOR = ROOT / 'packages/mobile/src/screens/PublicUserProfileScreen.tsx'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)

owner = OWNER.read_text(encoding='utf-8')
owner = replace_once(
    owner,
    "  const localPublicUserKeepCount = useMemo(() => publicKeptTracks.filter((entry) => entry.creditSource === 'SOCIAL' || !!entry.sourceProfileId || !!entry.sourceUsername).length, [publicKeptTracks]);",
    "  const localDiscoveryImpactCount = useMemo(() => {\n    if (!user?.id) return 0;\n    return Object.values(discoveryImpacts).reduce((total, impact) => total + (impact.originProfileId === user.id ? impact.recoveryCount : 0), 0);\n  }, [discoveryImpacts, user?.id]);",
    'owner semantic fallback',
)
owner = replace_once(
    owner,
    "  const profileUserKeepCount = ownSnapshot?.socialKeeps ?? localPublicUserKeepCount;",
    "  const profileUserKeepCount = ownSnapshot?.socialKeeps ?? localDiscoveryImpactCount;",
    'owner counter fallback',
)
OWNER.write_text(owner, encoding='utf-8')

visitor = VISITOR.read_text(encoding='utf-8')
visitor = replace_once(
    visitor,
    "        const localSocialCount = normalized.filter((track) => Boolean(track.sourceUserId || track.sourceProfileId)).length;",
    "        const localDiscoveryImpactCount = Object.values(impacts).reduce((total, impact) => total + (impact.originProfileId === result.id ? impact.recoveryCount : 0), 0);",
    'visitor semantic fallback',
)
visitor = replace_once(
    visitor,
    "          setSocialKeepCount(localSocialCount);\n          setDirectKeepCount(Math.max(0, normalized.length - localSocialCount));",
    "          setSocialKeepCount(localDiscoveryImpactCount);\n          setDirectKeepCount(normalized.length);",
    'visitor counter fallback',
)
VISITOR.write_text(visitor, encoding='utf-8')

for path in (OWNER, VISITOR):
    text = path.read_text(encoding='utf-8')
    if 'localPublicUserKeepCount' in text or 'localSocialCount' in text:
        raise SystemExit(f'legacy KEEP utilisateurs fallback still present in {path.name}')
print('KEEP utilisateurs fallback now follows downstream discovery impact on owner + visitor profiles.')
