from pathlib import Path

# Live service: invite a currently available player into an existing waiting arena.
p = Path('packages/mobile/src/services/keepBattleLiveService.ts')
s = p.read_text()
anchor = "export async function sendBattleChallenge(targetId: string, themeCode: string): Promise<{ id: string; status: string; expiresAt?: string }> {"
if 'sendBattleArenaChallenge' not in s:
    idx = s.index(anchor)
    fn_end = s.index('\n}\n', idx) + 3
    extra = """
export async function sendBattleArenaChallenge(arenaId: string, targetId: string): Promise<{ id: string; status: string; arenaId?: string | null; arenaCode?: string | null; expiresAt?: string }> {
  const { data, error } = await client().rpc('keep_battle_arena_challenge_send', { p_arena_id: arenaId, p_target_id: targetId });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_ARENA_CHALLENGE_FAILED'));
  return {
    id: String((data as any)?.id || ''),
    status: String((data as any)?.status || 'PENDING'),
    arenaId: (data as any)?.arenaId ? String((data as any).arenaId) : null,
    arenaCode: (data as any)?.arenaCode ? String((data as any).arenaCode) : null,
    expiresAt: (data as any)?.expiresAt ? String((data as any).expiresAt) : undefined,
  };
}
"""
    s = s[:fn_end] + extra + s[fn_end:]
p.write_text(s)

# Mobile game: direct invitations from the post-match screen, same arena up to maxPlayers.
p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()
s = s.replace(
"loadOutgoingBattleChallenges, respondBattleChallenge, sendBattleChallenge } from '../services/keepBattleLiveService';",
"loadOutgoingBattleChallenges, respondBattleChallenge, sendBattleArenaChallenge, sendBattleChallenge } from '../services/keepBattleLiveService';",
1,
)
state_anchor = "  const [respondingChallengeId, setRespondingChallengeId] = React.useState<string | null>(null);\n"
if 'arenaInviteOpen' not in s:
    s = s.replace(state_anchor, state_anchor + "  const [arenaInviteOpen, setArenaInviteOpen] = React.useState(false);\n  const [arenaInviteBusyId, setArenaInviteBusyId] = React.useState<string | null>(null);\n  const [arenaInvitedIds, setArenaInvitedIds] = React.useState<string[]>([]);\n", 1)

insert_anchor = "  const answerSolo = (choice: string) => {\n"
if 'const openArenaInviteList' not in s:
    helpers = """  const openArenaInviteList = async () => {
    if (!arena || arena.status !== 'WAITING' || arena.openSeats <= 0) return;
    setArenaInviteOpen(true);
    setBusy(true);
    try {
      const rows = await loadLiveSoloPlayers(30);
      const memberIds = new Set(arena.seats.map((seat) => seat.profileId));
      setLivePlayers(rows.filter((player) => !memberIds.has(player.profileId)));
    } catch {
      setLivePlayers([]);
    } finally {
      setBusy(false);
    }
  };

  const invitePlayerToArena = async (player: KeepBattleLivePlayer) => {
    if (!arena || arena.status !== 'WAITING' || arena.openSeats <= 0 || arenaInviteBusyId) return;
    setArenaInviteBusyId(player.profileId);
    try {
      await sendBattleArenaChallenge(arena.id, player.profileId);
      setArenaInvitedIds((rows) => rows.includes(player.profileId) ? rows : [...rows, player.profileId]);
    } catch (e: any) {
      const message = String(e?.message || e || '');
      if (message.includes('BATTLE_ARENA_FULL')) Alert.alert('Battle', 'Le groupe est déjà complet : 10 joueurs.');
      else if (message.includes('BATTLE_TARGET_NO_CREDIT')) Alert.alert('Battle', `@${player.username} n’a pas les 3 Free nécessaires.`);
      else if (message.includes('BATTLE_ARENA_NOT_OPEN_FOR_INVITES')) Alert.alert('Battle', 'La prochaine partie a déjà démarré.');
      else Alert.alert('Battle', `@${player.username} n’est plus disponible.`);
      const rows = await loadLiveSoloPlayers(30).catch(() => []);
      const memberIds = new Set(arena.seats.map((seat) => seat.profileId));
      setLivePlayers(rows.filter((candidate) => !memberIds.has(candidate.profileId)));
    } finally {
      setArenaInviteBusyId(null);
    }
  };

"""
    s = s.replace(insert_anchor, helpers + insert_anchor, 1)

old = """        {arena.openSeats > 0 ? <TouchableOpacity style={s.finishSecondary} onPress={() => { void shareArenaInvite(arena); }}><Text style={s.finishSecondaryText}>AJOUTER UN JOUEUR · {arena.openSeats} PLACE{arena.openSeats > 1 ? 'S' : ''}</Text></TouchableOpacity> : null}
        <TouchableOpacity style={s.finishSecondary} onPress={() => { setArena(null); void stopTrackPreview(); }}><Text style={s.finishSecondaryText}>QUITTER LE BATTLE</Text></TouchableOpacity>"""
new = """        {arena.openSeats > 0 ? <TouchableOpacity style={s.finishSecondary} onPress={() => { if (arenaInviteOpen) setArenaInviteOpen(false); else void openArenaInviteList(); }}><Text style={s.finishSecondaryText}>{arenaInviteOpen ? 'FERMER LES INVITATIONS' : `AJOUTER UN JOUEUR · ${arena.openSeats} PLACE${arena.openSeats > 1 ? 'S' : ''}`}</Text></TouchableOpacity> : null}
        {arenaInviteOpen ? <View style={s.arenaInvitePanel}><Text style={s.arenaInviteTitle}>JOUEURS DISPONIBLES · GROUPE {arena.seats.length}/10</Text>{busy ? <ActivityIndicator color=\"#E5F266\" /> : livePlayers.length ? <ScrollView style={s.arenaInviteScroll} contentContainerStyle={s.arenaInviteList}>{livePlayers.map((player) => { const invited = arenaInvitedIds.includes(player.profileId); return <View key={player.profileId} style={s.arenaInviteRow}><TouchableOpacity onPress={() => onOpenProfile(player.username)}><Avatar name={player.username} url={player.avatarUrl} size={46} /></TouchableOpacity><View style={{ flex: 1 }}><Text style={s.arenaInviteName}>@{player.username}</Text><Text style={s.arenaInviteMeta}>● disponible · {themeLabel(player.themeCode)}</Text></View><TouchableOpacity accessibilityRole=\"button\" hitSlop={10} disabled={invited || Boolean(arenaInviteBusyId)} style={[s.arenaInviteButton, invited && s.actionDisabled]} onPress={() => { void invitePlayerToArena(player); }}><Text style={s.arenaInviteButtonText}>{arenaInviteBusyId === player.profileId ? 'ENVOI…' : invited ? 'INVITÉ' : 'INVITER'}</Text></TouchableOpacity></View>; })}</ScrollView> : <Text style={s.arenaInviteEmpty}>Aucun autre joueur disponible pour le moment.</Text>}<TouchableOpacity style={s.arenaShareButton} onPress={() => { void shareArenaInvite(arena); }}><Text style={s.arenaShareButtonText}>INVITER UN AMI PAR LIEN</Text></TouchableOpacity></View> : null}
        <TouchableOpacity style={s.finishSecondary} onPress={() => { setArenaInviteOpen(false); setArena(null); void stopTrackPreview(); }}><Text style={s.finishSecondaryText}>QUITTER LE BATTLE</Text></TouchableOpacity>"""
if old not in s:
    raise SystemExit('post-match invite anchor missing')
s = s.replace(old, new, 1)

style_anchor = "  root: { width: '100%', flex: 1, paddingBottom: 4, position: 'relative' },"
if 'arenaInvitePanel:' not in s:
    extra_styles = " arenaInvitePanel: { maxHeight: 290, marginBottom: 8, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: '#4A3C55', backgroundColor: '#120E17' }, arenaInviteTitle: { color: '#E5F266', fontSize: 12, fontWeight: '900', marginBottom: 8 }, arenaInviteScroll: { maxHeight: 190 }, arenaInviteList: { gap: 7 }, arenaInviteRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 7, borderRadius: 15, backgroundColor: '#1B1422' }, arenaInviteName: { color: '#FFF', fontSize: 14, fontWeight: '900' }, arenaInviteMeta: { color: '#75E6AA', fontSize: 10, fontWeight: '800', marginTop: 2 }, arenaInviteButton: { minWidth: 94, minHeight: 52, paddingHorizontal: 13, borderRadius: 26, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' }, arenaInviteButtonText: { color: '#17130B', fontSize: 12, fontWeight: '900' }, arenaInviteEmpty: { color: '#FFF', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 14 }, arenaShareButton: { minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: '#4A3C55', alignItems: 'center', justifyContent: 'center', marginTop: 8 }, arenaShareButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' },"
    s = s.replace(style_anchor, style_anchor + extra_styles, 1)
p.write_text(s)

# Source contract for group continuity.
p = Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
t = p.read_text()
if "invites additional players into the same arena" not in t:
    t += """

describe('KEEP Battle persistent group invitations', () => {
  const battle = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
  const live = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'keepBattleLiveService.ts'), 'utf8');

  it('invites additional players into the same arena instead of replacing the group', () => {
    expect(live).toContain("rpc('keep_battle_arena_challenge_send'");
    expect(battle).toContain('sendBattleArenaChallenge(arena.id, player.profileId)');
    expect(battle).toContain('GROUPE {arena.seats.length}/10');
    expect(battle).toContain("invited ? 'INVITÉ' : 'INVITER'");
    expect(battle).toContain('arena.openSeats > 0');
  });

  it('keeps post-match add-player controls smartphone sized', () => {
    expect(battle).toContain('arenaInviteButton: { minWidth: 94, minHeight: 52');
    expect(battle).toContain('arenaInviteRow: { minHeight: 62');
    expect(battle).toContain('INVITER UN AMI PAR LIEN');
  });
});
"""
p.write_text(t)
