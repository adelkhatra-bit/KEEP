from pathlib import Path

# One-shot patch: source changes are committed atomically with their cleanup.


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly once, got {count}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# 1) Mobile service: authenticated RPC used only after a real Listen match.
# ---------------------------------------------------------------------------
service_path = Path('packages/mobile/src/services/keepMusicCoreRecognition.ts')
service = service_path.read_text()
anchor = """export async function updateKeepDecisionVisibility(decisionId: string, visibility: KeepVisibility): Promise<boolean> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) return false;
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) return false;

  const response = await fetch(`${SUPABASE_URL.replace(/\\/$/, '')}/functions/v1/keep-music-core`, {
    method: 'POST',
    headers: {
      ...baseHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'decision.visibility', decisionId, visibility }),
  });
  await parseResponse(response);
  return true;
}
"""
insert = anchor + """
/**
 * Lorsqu'un membre avait d'abord récupéré gratuitement un titre depuis un
 * autre profil, puis le reconnaît ensuite lui-même avec Écouter, sa propre
 * écoute devient la source de ses futurs partages. Le KEEP reste unique et
 * l'ancienne provenance sociale reste conservée dans l'historique serveur.
 */
export async function markDirectRediscovery(
  trackId: string,
  context: Record<string, unknown> = {},
): Promise<boolean> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY) || !supabase) return false;
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) return false;
  const { data, error } = await supabase.rpc('keep_mark_direct_rediscovery', {
    p_track_id: trackId,
    p_context: context,
  });
  if (error) return false;
  return data === true;
}
"""
service = replace_once(service, anchor, insert, 'rediscovery service')
service_path.write_text(service)

# ---------------------------------------------------------------------------
# 2) Session recognition: if a REAL Listen rediscovers an already-owned KEEP,
#    promote that member to the discovery source for future social copies.
# ---------------------------------------------------------------------------
store_path = Path('packages/mobile/src/store/useSessionStore.ts')
store = store_path.read_text()
store = replace_once(
    store,
    "import { updateKeepDecisionVisibility } from '../services/keepMusicCoreRecognition';",
    "import { markDirectRediscovery, updateKeepDecisionVisibility } from '../services/keepMusicCoreRecognition';",
    'rediscovery import',
)
store = replace_once(
    store,
    """  if (connected?.exists && connected.match) {
    return { session, playlists, match: { playlistId: connected.match.playlistId, playlistName: connected.match.playlistName, provider: connected.match.provider } };
  }""",
    """  if (connected?.exists && connected.match) {
    return {
      session,
      playlists,
      match: {
        playlistId: connected.match.playlistId,
        playlistName: connected.match.playlistName,
        provider: connected.match.provider,
        decisionId: connected.match.decisionId,
        trackId: connected.match.trackId,
      },
    };
  }""",
    'preserve own KEEP ids',
)
store = replace_once(
    store,
    """            const { session, playlists, match } = await findExistingTrack(track);
            const recommendations = match ? [] : await musicEngine.router.recommend(session.userId, track, playlists);
            applyTrackEnrichment(sessionIdAtDetection, entry.id, {
              recommendations,
              status: match ? 'already_saved' : 'pending',
              existingMatch: match,
            });""",
    """            const { session, playlists, match } = await findExistingTrack(track);
            const sharedSource = await getSharedMusicSource().catch(() => null);
            if (!sharedSource && match?.decisionId && match?.trackId) {
              await markDirectRediscovery(match.trackId, {
                source: 'listen',
                sessionId: sessionIdAtDetection,
                detectedAt: entry.detectedAt,
              }).catch(() => false);
            }
            const recommendations = match ? [] : await musicEngine.router.recommend(session.userId, track, playlists);
            applyTrackEnrichment(sessionIdAtDetection, entry.id, {
              recommendations,
              status: match ? 'already_saved' : 'pending',
              existingMatch: match,
            });""",
    'wire real listen rediscovery',
)
store_path.write_text(store)

# ---------------------------------------------------------------------------
# 3) Offers copy: explain the actual growth loop, including 20 chained copies.
# ---------------------------------------------------------------------------
offers_path = Path('packages/mobile/src/screens/OffersScreen.tsx')
offers = offers_path.read_text()
offers = replace_once(
    offers,
    "<Text style={s.discoveryTitle}>Ta découverte reste attribuée à ton profil.</Text>",
    "<Text style={s.discoveryTitle}>Tes découvertes peuvent faire grandir ton profil.</Text>",
    'discovery title visibility',
)
offers = replace_once(
    offers,
    "<Text style={s.discoveryBody}>Quand tu reconnais un morceau avec Écouter puis que tu le gardes, KEEP conserve ton profil comme source de cette découverte. Si un autre membre l’ajoute depuis ton profil, son ajout ne débite aucun Free et ton attribution reste attachée au morceau.</Text>",
    "<Text style={s.discoveryBody}>Quand tu reconnais un morceau avec Écouter puis que tu le gardes, KEEP associe cette découverte à ton profil. Si d’autres membres récupèrent ensuite ce titre depuis la communauté, ils ne dépensent aucun Free et ton pseudo reste affiché comme découvreur, avec un accès direct à ton profil.</Text>",
    'discovery body visibility',
)
offers = replace_once(
    offers,
    "<View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>3</Text><Text style={s.discoveryStepText}>Le titre peut ensuite circuler de profil en profil : KEEP conserve le découvreur d’origine au lieu de remplacer son attribution à chaque partage.</Text></View>",
    "<View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>3</Text><Text style={s.discoveryStepText}>Le titre peut circuler de profil en profil : s’il est repris 20 fois depuis cette chaîne, ton pseudo reste visible et cliquable sur les 20 copies. Chaque reprise peut donc amener de nouveaux visiteurs et abonnés vers ton profil.</Text></View>",
    'discovery step growth loop',
)
offers_path.write_text(offers)
