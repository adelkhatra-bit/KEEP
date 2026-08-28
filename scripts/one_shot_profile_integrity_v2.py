from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

# 1) Own profile: one server source for count + visible library, no local guest leakage.
p = ROOT / 'packages/mobile/src/screens/ProfilePublicScreen.tsx'
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { loadPublicProfileSnapshot, ProfileCertificationTier, PublicProfileSnapshot } from '../services/publicProfileStateService';",
    "import { loadOwnProfileKeeps, loadOwnProfileSnapshot, loadPublicProfileSnapshot, OwnProfileSnapshot, ProfileCertificationTier, PublicProfileKeep, PublicProfileSnapshot } from '../services/publicProfileStateService';",
    'profile import',
)
text = replace_once(
    text,
    "  const [publicSnapshot, setPublicSnapshot] = useState<PublicProfileSnapshot | null>(null);",
    "  const [publicSnapshot, setPublicSnapshot] = useState<PublicProfileSnapshot | null>(null);\n  const [ownSnapshot, setOwnSnapshot] = useState<OwnProfileSnapshot | null>(null);\n  const [serverOwnKeeps, setServerOwnKeeps] = useState<PublicProfileKeep[]>([]);",
    'profile canonical state',
)
old_effect = """  useEffect(() => {
    let live = true;
    const refreshPublicSnapshot = async () => {
      if (!user || accountRequired) {
        if (live) setPublicSnapshot(null);
        return;
      }
      try {
        const snapshot = await loadPublicProfileSnapshot(user.id);
        if (live) setPublicSnapshot(snapshot);
      } catch {
        if (live) setPublicSnapshot(null);
      }
    };
    void refreshPublicSnapshot();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshPublicSnapshot(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, user?.id]);
"""
new_effect = """  useEffect(() => {
    let live = true;
    const refreshCanonicalProfileState = async () => {
      if (!user || accountRequired) {
        if (live) {
          setPublicSnapshot(null);
          setOwnSnapshot(null);
          setServerOwnKeeps([]);
        }
        return;
      }
      try {
        const [publicState, ownState, ownKeeps] = await Promise.all([
          loadPublicProfileSnapshot(user.id),
          loadOwnProfileSnapshot(),
          loadOwnProfileKeeps(),
        ]);
        if (live) {
          setPublicSnapshot(publicState);
          setOwnSnapshot(ownState);
          setServerOwnKeeps(ownKeeps);
        }
      } catch {
        if (live) {
          setPublicSnapshot(null);
          setOwnSnapshot(null);
          setServerOwnKeeps([]);
        }
      }
    };
    void refreshCanonicalProfileState();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshCanonicalProfileState(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, user?.id]);
"""
text = replace_once(text, old_effect, new_effect, 'profile canonical effect')
old_library = """  const publicKeptTracks = useMemo(() => keptTracks.filter((entry) => entry.visibility === 'PUBLIC'), [keptTracks]);
  const localPublicOwnKeepCount = useMemo(() => publicKeptTracks.filter((entry) => entry.creditSource !== 'SOCIAL' && !entry.sourceProfileId && !entry.sourceUsername).length, [publicKeptTracks]);
  const localPublicUserKeepCount = useMemo(() => publicKeptTracks.filter((entry) => entry.creditSource === 'SOCIAL' || !!entry.sourceProfileId || !!entry.sourceUsername).length, [publicKeptTracks]);
"""
new_library = """  const canonicalOwnKeeps = useMemo(() => serverOwnKeeps.map((entry) => ({
    id: entry.decisionId,
    track: entry.track,
    status: 'kept' as const,
    visibility: entry.visibility,
    detectedAt: entry.keptAt,
    creditSource: entry.creditSource,
    sourceProfileId: entry.sourceProfileId,
    sourceUsername: entry.sourceUsername,
  })), [serverOwnKeeps]);
  const profileKeptTracks = accountRequired ? keptTracks : canonicalOwnKeeps;
  const publicKeptTracks = useMemo(() => profileKeptTracks.filter((entry) => entry.visibility === 'PUBLIC'), [profileKeptTracks]);
  const localPublicOwnKeepCount = useMemo(() => publicKeptTracks.filter((entry) => entry.creditSource !== 'SOCIAL' && !entry.sourceProfileId && !entry.sourceUsername).length, [publicKeptTracks]);
  const localPublicUserKeepCount = useMemo(() => publicKeptTracks.filter((entry) => entry.creditSource === 'SOCIAL' || !!entry.sourceProfileId || !!entry.sourceUsername).length, [publicKeptTracks]);
"""
text = replace_once(text, old_library, new_library, 'profile library source')
text = replace_once(
    text,
    "  const profileOwnKeepCount = publicSnapshot?.directPublicKeeps ?? localPublicOwnKeepCount;\n  const profileUserKeepCount = publicSnapshot?.socialPublicKeeps ?? localPublicUserKeepCount;\n  const profileTotalKeepCount = publicSnapshot?.totalPublicKeeps ?? (localPublicOwnKeepCount + localPublicUserKeepCount);",
    "  const profileOwnKeepCount = ownSnapshot?.directKeeps ?? localPublicOwnKeepCount;\n  const profileUserKeepCount = ownSnapshot?.socialKeeps ?? localPublicUserKeepCount;\n  const profileTotalKeepCount = ownSnapshot?.totalKeeps ?? profileKeptTracks.length;",
    'profile counters',
)
text = replace_once(
    text,
    "      if (!keptTracks.length) return <Empty text=\"Tes morceaux KEEP apparaîtront ici.\" />;\n      return <View style={s.keepList}>\n        <Text style={s.ownerKeepHint}>KEEP construit ton univers : Vibes, artistes et albums. Tu gardes le contrôle du Public/Privé et des noms.</Text>\n        {keptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null))}",
    "      if (!profileKeptTracks.length) return <Empty text=\"Tes morceaux KEEP apparaîtront ici.\" />;\n      return <View style={s.keepList}>\n        <Text style={s.ownerKeepHint}>KEEP construit ton univers : Vibes, artistes et albums. Tu gardes le contrôle du Public/Privé et des noms.</Text>\n        {profileKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null))}",
    'profile visible list',
)
text = replace_once(
    text,
    "          <TouchableOpacity style={s.ownerEditButton} onPress={() => navigation.navigate('ProfileSettings')} accessibilityLabel=\"Modifier mon profil\"><Text style={s.ownerActionText}>MODIFIER</Text></TouchableOpacity>\n",
    "",
    'remove duplicate edit button',
)
text = replace_once(
    text,
    "        <View style={s.shareSheet}>\n          <View style={s.sheetHandle} />\n          <UsernameAccountForm initialMode={accountMode}",
    "        <View style={[s.shareSheet, s.accountSheet]}>\n          <View style={s.sheetHandle} />\n          <UsernameAccountForm initialMode={accountMode}",
    'account sheet',
)
text = replace_once(
    text,
    "<Text style={s.cancelShareText}>Plus tard</Text></TouchableOpacity>\n        </View>\n      </View>\n    </Modal>\n\n    <Modal visible={shareOpen}",
    "<Text style={s.cancelShareText}>CONTINUER EN MODE DÉMO</Text></TouchableOpacity>\n        </View>\n      </View>\n    </Modal>\n\n    <Modal visible={shareOpen}",
    'demo escape action',
)
text = replace_once(
    text,
    "shareSheet:{width:'100%',maxWidth:520,backgroundColor:'#151020',borderRadius:26,borderWidth:1,borderColor:'#3F3154',padding:18,paddingBottom:24},",
    "shareSheet:{width:'100%',maxWidth:520,backgroundColor:'#151020',borderRadius:26,borderWidth:1,borderColor:'#3F3154',padding:18,paddingBottom:24},accountSheet:{maxHeight:'92%'},",
    'account sheet style',
)
p.write_text(text, encoding='utf-8')

# 2) Public profile: list and public counter come from the exact same distinct server library.
p = ROOT / 'packages/mobile/src/screens/PublicUserProfileScreen.tsx'
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { loadPublicProfileSnapshot, ProfileCertificationTier, PublicProfileSnapshot } from '../services/publicProfileStateService';",
    "import { loadPublicProfileKeeps, loadPublicProfileSnapshot, ProfileCertificationTier, PublicProfileSnapshot } from '../services/publicProfileStateService';",
    'public profile import',
)
pattern = re.compile(r"        const allRows: any\[\] = \[\];.*?        if \(cancelled\) return;\n        setTracks\(normalized\);", re.S)
match = pattern.search(text)
if not match:
    raise SystemExit('public profile canonical block not found')
replacement = """        const canonicalKeeps = await loadPublicProfileKeeps(result.id);
        if (cancelled) return;
        const normalized = canonicalKeeps.map((entry) => ({
          id: entry.decisionId,
          trackId: entry.track.id,
          title: entry.track.title,
          artist: entry.track.artist,
          album: entry.track.album ?? null,
          artworkUrl: entry.track.artworkUrl ?? null,
          previewUrl: entry.track.previewUrl,
          availableOn: entry.track.availableOn ?? [],
          externalUrls: entry.track.externalUrls ?? {},
          isrc: entry.track.isrc,
          durationSec: entry.track.durationSec,
          genres: entry.track.genres ?? [],
          providerIds: entry.track.providerIds ?? {},
          sourceUserId: entry.sourceUserId,
          sourceProfileId: entry.sourceProfileId,
        } as PublicKeepTrack));

        if (cancelled) return;
        setTracks(normalized);"""
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text, encoding='utf-8')

# 3) Account transition: never re-attach guest/demo music to a newly authenticated identity.
p = ROOT / 'packages/mobile/src/components/UsernameAccountForm.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace("  loadStagedGuestMusic,\n", "")
text = text.replace("  stageGuestMusicForUpgrade,\n", "")
old_finish = """  const finishAuthenticatedFlow = async () => {
    await importStagedGuestCreditsForAuthenticatedAccount().catch(() => null);

    const stagedMusic = await loadStagedGuestMusic().catch(() => []);
    useSessionHistoryStore.getState().clearSessions();
    for (const session of stagedMusic) useSessionHistoryStore.getState().upsertSession(session);

    await useSessionHistoryStore.getState().syncUnsyncedKeeps().catch(() => {});
    await useSessionHistoryStore.getState().refreshCreditLocks().catch(() => {});
    await clearStagedGuestMusic().catch(() => {});

    const followed = await applyFollowIntent();
"""
new_finish = """  const finishAuthenticatedFlow = async () => {
    await importStagedGuestCreditsForAuthenticatedAccount().catch(() => null);

    // Isolation stricte : une identité authentifiée ne récupère jamais les morceaux
    // d'un essai/d'une autre identité locale. Le serveur applique la même règle.
    useSessionHistoryStore.getState().clearSessions();
    await clearStagedGuestMusic().catch(() => {});
    await useSessionHistoryStore.getState().refreshCreditLocks().catch(() => {});

    const followed = await applyFollowIntent();
"""
text = replace_once(text, old_finish, new_finish, 'auth isolation finish')
text = replace_once(
    text,
    "        await Promise.all([\n          stageGuestProfileForUpgrade({ ...currentUser, username: normalizedUsername }),\n          stageGuestMusicForUpgrade(useSessionHistoryStore.getState().sessions),\n          stageLocalGuestCreditsForUpgrade(),\n        ]);",
    "        await Promise.all([\n          stageGuestProfileForUpgrade({ ...currentUser, username: normalizedUsername }),\n          stageLocalGuestCreditsForUpgrade(),\n        ]);",
    'auth isolation staging',
)
text = replace_once(
    text,
    "    <Text style={s.recovery}>Tu peux revenir à l’essai gratuit avec « Plus tard ». Les musiques d’essai restent sur cet appareil jusqu’à ce que tu crées ton compte ; elles sont alors rattachées uniquement à ce compte KEEP.</Text>",
    "    <Text style={s.recovery}>Tu peux revenir à l’essai gratuit avec « Plus tard ». Pour protéger chaque bibliothèque, les morceaux d’essai ne sont jamais injectés dans un autre compte : après création ou connexion, KEEP charge uniquement la musique de cette identité.</Text>",
    'auth isolation copy',
)
p.write_text(text, encoding='utf-8')

print('Profile integrity v2 patch applied')
