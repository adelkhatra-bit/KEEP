from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly once, got {count}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Offers: display the real remaining promotional Free balance, not a theoretical
# lifetime total. Authenticated accounts use the exact Battle/Free ledger; local
# guests use the same download-credit source as Listen sessions.
# ---------------------------------------------------------------------------
offers_path = Path('packages/mobile/src/screens/OffersScreen.tsx')
offers = offers_path.read_text()
offers = replace_once(
    offers,
    "import { DEFAULT_KEEP_BATTLE_RULES, KeepBattleArenaRules, loadKeepBattleArenaRules } from '../services/keepBattleExperienceService';",
    "import { DEFAULT_KEEP_BATTLE_RULES, KeepBattleArenaRules, loadKeepBattleArenaRules } from '../services/keepBattleExperienceService';\nimport { loadBattleFreeCreditStatus } from '../services/keepBattleService';\nimport { getDownloadCreditStatus } from '../services/creditService';",
    'offers credit imports',
)
offers = replace_once(
    offers,
    "  const [currentPlan, setCurrentPlan] = useState('FREE');\n  const [loading, setLoading] = useState(true);",
    "  const [currentPlan, setCurrentPlan] = useState('FREE');\n  const [freeBalance, setFreeBalance] = useState<number | null>(null);\n  const [freeUnlimited, setFreeUnlimited] = useState(false);\n  const [loading, setLoading] = useState(true);",
    'offers credit state',
)
offers = replace_once(
    offers,
    """        const [livePlans, liveFunnel, planCode, liveRules, liveBattleRules, liveGrowth] = await Promise.all([
          loadPlans(),
          loadCreditFunnel(),
          user ? loadCurrentPlanCode(user.id) : Promise.resolve('FREE'),
          getCommercialRules(),
          loadKeepBattleArenaRules(),
          canLoadGrowth ? getGrowthRewardStatus().catch(() => null) : Promise.resolve(null),
        ]);""",
    """        const [livePlans, liveFunnel, planCode, liveRules, liveBattleRules, liveGrowth, liveFreeStatus] = await Promise.all([
          loadPlans(),
          loadCreditFunnel(),
          user ? loadCurrentPlanCode(user.id) : Promise.resolve('FREE'),
          getCommercialRules(),
          loadKeepBattleArenaRules(),
          canLoadGrowth ? getGrowthRewardStatus().catch(() => null) : Promise.resolve(null),
          canLoadGrowth
            ? loadBattleFreeCreditStatus().catch(() => null)
            : getDownloadCreditStatus().catch(() => null),
        ]);""",
    'offers load real Free status',
)
offers = replace_once(
    offers,
    """        setBattleRules(liveBattleRules);
        setGrowth(liveGrowth);""",
    """        setBattleRules(liveBattleRules);
        setGrowth(liveGrowth);
        if (liveFreeStatus && 'remainingFree' in liveFreeStatus) {
          setFreeBalance(Number(liveFreeStatus.remainingFree ?? 0));
          setFreeUnlimited(false);
        } else if (liveFreeStatus) {
          setFreeBalance(liveFreeStatus.remaining == null ? null : Number(liveFreeStatus.remaining));
          setFreeUnlimited(Boolean(liveFreeStatus.unlimited));
        } else {
          setFreeBalance(null);
          setFreeUnlimited(false);
        }""",
    'offers set real Free status',
)
offers = replace_once(
    offers,
    "  const freeTotal = useMemo(() => funnel.guestSuccessLimit + funnel.signupBonusSuccesses + (growth?.bonusFreeCredits ?? 0), [funnel, growth?.bonusFreeCredits]);",
    "  const freeBalanceLabel = freeUnlimited ? '∞' : freeBalance == null ? '—' : String(Math.max(0, freeBalance));",
    'remove theoretical Free total',
)
offers = replace_once(
    offers,
    "<View><Text style={s.sectionTitle}>Tes Free</Text><Text style={s.creditBig}>{freeTotal}</Text></View>",
    "<View><Text style={s.sectionTitle}>Tes Free disponibles</Text><Text style={s.creditBig}>{freeBalanceLabel}</Text></View>",
    'real Free balance label',
)
offers = replace_once(
    offers,
    "<Text style={s.creditText}>{funnel.guestSuccessLimit} avant inscription + {funnel.signupBonusSuccesses} après création du compte{growth?.bonusFreeCredits ? ` + ${growth.bonusFreeCredits} gagnés avec ta communauté` : ''}.</Text>",
    "<Text style={s.creditText}>Ce nombre est ton solde réellement disponible. Au démarrage : {funnel.guestSuccessLimit} Free avant inscription + {funnel.signupBonusSuccesses} après création du compte. Les Free utilisés sont déduits ; les récompenses communauté et Battle s’ajoutent automatiquement.</Text>",
    'Free balance explanation',
)
offers_path.write_text(offers)

# ---------------------------------------------------------------------------
# Session history: same professional Free naming as the offers/profile system.
# The numeric source is already getDownloadCreditStatus, so no ledger change.
# ---------------------------------------------------------------------------
sessions_path = Path('packages/mobile/src/screens/SessionHistoryScreen.tsx')
sessions = sessions_path.read_text()
sessions = sessions.replace("{ label: 'FREE', focusPlan: 'PREMIUM', paid: false }", "{ label: 'Free', focusPlan: 'PREMIUM', paid: false }")
sessions = sessions.replace("status.remaining == null ? 'FREE' : `FREE · ${status.remaining}`", "status.remaining == null ? 'Free' : `Free · ${status.remaining}`")
sessions = sessions.replace("setPlanBadge({ label: 'FREE', focusPlan: 'PREMIUM', paid: false });", "setPlanBadge({ label: 'Free', focusPlan: 'PREMIUM', paid: false });")
sessions_path.write_text(sessions)

# ---------------------------------------------------------------------------
# Battle service: authenticated, best-effort, keyless central catalog refresh.
# ---------------------------------------------------------------------------
battle_service_path = Path('packages/mobile/src/services/keepBattleService.ts')
battle_service = battle_service_path.read_text()
anchor = """function unwrap<T>(data: T | null, error: any): T {
  if (error) throw new Error(String(error?.message || error?.code || 'KEEP_BATTLE_FAILED'));
  if (data == null) throw new Error('KEEP_BATTLE_EMPTY_RESPONSE');
  return data;
}
"""
addition = anchor + """
export type KeepBattleCatalogRefresh = {
  ok: boolean;
  secretRequired: boolean;
  provider?: string;
  scanned?: number;
  enriched?: number;
  themeLinksAdded?: number;
  playableBefore?: number;
  playableAfter?: number;
  skipped?: boolean;
};

/**
 * Enrichit la réserve centrale Battle sans utiliser la bibliothèque personnelle
 * du joueur. La fonction serveur ne nécessite aucune clé musicale privée : elle
 * complète uniquement les morceaux déjà connus de KEEP avec des extraits
 * promotionnels publics disponibles.
 */
export async function refreshKeepBattleCatalog(limit = 24): Promise<KeepBattleCatalogRefresh | null> {
  try {
    const { data, error } = await client().functions.invoke('keep-battle-catalog-refresh', {
      body: { limit: Math.max(5, Math.min(Math.floor(limit), 36)) },
    });
    if (error || !data) return null;
    return data as KeepBattleCatalogRefresh;
  } catch {
    return null;
  }
}
"""
if 'export async function refreshKeepBattleCatalog' not in battle_service:
    battle_service = replace_once(battle_service, anchor, addition, 'battle catalog service')
battle_service_path.write_text(battle_service)

# ---------------------------------------------------------------------------
# Arena: warm catalog in background, and refresh again before matchmaking while
# the reserve is still growing. No personal music is required to participate.
# ---------------------------------------------------------------------------
arena_path = Path('packages/mobile/src/components/KeepBattleArenaPanel.tsx')
arena = arena_path.read_text()
arena = replace_once(
    arena,
    "  loadKeepBattleThemes,\n  startKeepBattleArena,",
    "  loadKeepBattleThemes,\n  refreshKeepBattleCatalog,\n  startKeepBattleArena,",
    'arena catalog import',
)
arena = replace_once(
    arena,
    """  React.useEffect(() => {
    let live = true;
    void loadKeepBattleThemes().then((rows) => { if (live && rows.length) setThemes(rows); }).catch(() => {});
    void refreshLobby();
    return () => { live = false; };
  }, [refreshLobby]);""",
    """  React.useEffect(() => {
    let live = true;
    void loadKeepBattleThemes().then((rows) => { if (live && rows.length) setThemes(rows); }).catch(() => {});
    if (enabled) void refreshKeepBattleCatalog(24).catch(() => null);
    void refreshLobby();
    return () => { live = false; };
  }, [enabled, refreshLobby]);""",
    'arena background catalog warmup',
)
arena = replace_once(
    arena,
    """    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('keep_battle_arena_matchmake', { p_theme_code: themeCode });""",
    """    setBusy(true);
    try {
      // Le Salon utilise une réserve musicale centrale : un joueur peut entrer
      // même avec zéro morceau personnel. Tant que la réserve grandit, KEEP la
      // complète automatiquement avant le matchmaking, sans clé payante.
      await refreshKeepBattleCatalog(24).catch(() => null);
      const { data, error } = await supabase.rpc('keep_battle_arena_matchmake', { p_theme_code: themeCode });""",
    'arena catalog before matchmaking',
)
arena_path.write_text(arena)

# ---------------------------------------------------------------------------
# Soirées: one compact launcher, Salon in a modal. No sixth tab and no permanent
# full Battle panel cluttering the event feed.
# ---------------------------------------------------------------------------
parties_path = Path('packages/mobile/src/screens/PartiesScreen.tsx')
parties = parties_path.read_text()
parties = replace_once(
    parties,
    "import SwipeDeck from '../components/SwipeDeck';",
    "import SwipeDeck from '../components/SwipeDeck';\nimport KeepBattleArenaPanel from '../components/KeepBattleArenaPanel';",
    'Parties Battle import',
)
parties = replace_once(
    parties,
    "  const [createOpen, setCreateOpen] = useState(false);",
    "  const [createOpen, setCreateOpen] = useState(false);\n  const [battleOpen, setBattleOpen] = useState(false);",
    'Parties Battle state',
)
creator_end = """            : <View style={styles.creatorHint}><Text style={styles.creatorHintText}>Venue Pro : soirées illimitées · seuil {minEventFollowers} abonnés atteint.</Text></View>}

      {loading ? <ActivityIndicator color={colors.primaryLight}/> : null}"""
creator_with_battle = """            : <View style={styles.creatorHint}><Text style={styles.creatorHintText}>Venue Pro : soirées illimitées · seuil {minEventFollowers} abonnés atteint.</Text></View>}

      <TouchableOpacity style={styles.battleLauncher} onPress={() => setBattleOpen(true)} accessibilityRole="button" accessibilityLabel="Ouvrir le Salon KEEP Battle">
        <View style={styles.battleLauncherIcon}><Text style={styles.battleLauncherBolt}>⚡</Text></View>
        <View style={styles.battleLauncherCopy}>
          <Text style={styles.battleLauncherKicker}>KEEP BATTLE</Text>
          <Text style={styles.battleLauncherTitle}>Salon musical</Text>
          <Text style={styles.battleLauncherMeta}>Joue avec la réserve KEEP · aucune bibliothèque personnelle requise</Text>
        </View>
        <Text style={styles.battleLauncherOpen}>OUVRIR ›</Text>
      </TouchableOpacity>

      {loading ? <ActivityIndicator color={colors.primaryLight}/> : null}"""
parties = replace_once(parties, creator_end, creator_with_battle, 'Battle launcher')
modal_anchor = """    <Modal visible={createOpen} transparent animationType=\"slide\" onRequestClose={()=>setCreateOpen(false)}>"""
battle_modal = """    <Modal visible={battleOpen} transparent animationType=\"slide\" onRequestClose={() => setBattleOpen(false)}>
      <View style={styles.backdrop}><View style={[styles.sheet, styles.battleSheet]}>
        <View style={styles.modalHeader}><View><Text style={styles.battleModalKicker}>KEEP BATTLE</Text><Text style={styles.modalTitle}>Salon musical</Text></View><TouchableOpacity onPress={() => setBattleOpen(false)} accessibilityLabel=\"Fermer le Salon KEEP Battle\"><Text style={styles.close}>Fermer</Text></TouchableOpacity></View>
        <ScrollView keyboardShouldPersistTaps=\"handled\" showsVerticalScrollIndicator={false} contentContainerStyle={styles.battleModalScroll}>
          <KeepBattleArenaPanel
            enabled={Boolean(user && !isLocalGuest && !isDemoMode)}
            onOpenProfile={(username) => { setBattleOpen(false); navigation.navigate('PublicUserProfile', { username }); }}
            onRequireAccount={() => { setBattleOpen(false); navigation.navigate('Main', { screen: 'Profile' }); }}
          />
        </ScrollView>
      </View></View>
    </Modal>

""" + modal_anchor
parties = replace_once(parties, modal_anchor, battle_modal, 'Battle modal')
style_anchor = "container:{flex:1,backgroundColor:'#090610'},"
style_add = """container:{flex:1,backgroundColor:'#090610'},battleLauncher:{minHeight:64,marginBottom:spacing.md,paddingHorizontal:11,paddingVertical:9,borderRadius:17,backgroundColor:'#151020',borderWidth:1,borderColor:'#5E4385',flexDirection:'row',alignItems:'center',gap:9},battleLauncherIcon:{width:40,height:40,borderRadius:20,backgroundColor:'#2A1A14',borderWidth:1,borderColor:'#D6AA36',alignItems:'center',justifyContent:'center'},battleLauncherBolt:{fontSize:18},battleLauncherCopy:{flex:1,minWidth:0},battleLauncherKicker:{color:'#D6AA36',fontSize:8,fontWeight:'900',letterSpacing:1},battleLauncherTitle:{color:'#FFFFFF',fontSize:14,fontWeight:'900',marginTop:1},battleLauncherMeta:{color:'#FFFFFF',fontSize:8,lineHeight:12,fontWeight:'700',marginTop:2},battleLauncherOpen:{color:'#B693FF',fontSize:9,fontWeight:'900'},battleSheet:{maxHeight:'94%'},battleModalScroll:{paddingBottom:8},battleModalKicker:{color:'#D6AA36',fontSize:8,fontWeight:'900',letterSpacing:1,marginBottom:2},"""
parties = replace_once(parties, style_anchor, style_add, 'Battle launcher styles')
parties_path.write_text(parties)
