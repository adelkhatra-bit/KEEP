from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly once, got {count}')
    return text.replace(old, new, 1)

# Reuse the already-reviewed profile music/provenance transformation first.
legacy_patch = Path('scripts/one_time_profile_music_clarity.py')
if legacy_patch.exists():
    exec(compile(legacy_patch.read_text(), str(legacy_patch), 'exec'), {'__name__': '__main__'})

# Offers: show every plan immediately, simplify wording, and use the shared mobile caption size.
offers_path = Path('packages/mobile/src/screens/OffersScreen.tsx')
offers = offers_path.read_text()
offers = replace_once(
    offers,
    """  const visiblePlans = useMemo(() => {
    if (!focusPlan) return plans;
    const allowed = new Set(compatibleCodes);
    return plans.filter((plan) => allowed.has(plan.code));
  }, [compatibleCodes, focusPlan, plans]);""",
    """  // Toutes les formules restent visibles immédiatement, même lorsqu'un écran
  // ouvre Offres avec une recommandation précise. La formule minimale est
  // simplement mise en avant : aucun second clic ni remontée de page.
  const visiblePlans = useMemo(() => plans, [plans]);""",
    'show all plans immediately',
)
offers = replace_once(
    offers,
    "Partage tes KEEP, tes Vibes et ton univers musical. Tu peux construire une vraie communauté et devenir influent sans avoir besoin de montrer ton visage.",
    "Partage tes KEEP, tes Vibes et ton univers musical. Ta communauté se construit autour de tes goûts, de tes découvertes et des morceaux que tu choisis de partager.",
    'community wording',
)
offers = replace_once(
    offers,
    """        {focusPlan ? <TouchableOpacity style={s.allPlans} onPress={() => navigation.setParams({ focusPlan: undefined, sourceFeature: undefined })}>
          <Text style={s.allPlansText}>Voir toutes les formules</Text>
        </TouchableOpacity> : null}
""",
    "",
    'remove all plans button',
)
for label, old, new in [
    ('credit rule typography', "  creditRule: { color:'#FFFFFF', fontSize: 10, lineHeight: 15, marginTop: 7, fontWeight: '700' },", "  creditRule: { ...typography.caption, color:'#FFFFFF', lineHeight: 18, marginTop: 7, fontWeight: '700' },"),
    ('community text typography', "  communityOpportunityText: { color: '#FFFFFF', fontSize: 10, lineHeight: 16, fontWeight: '700', marginTop: 6 },", "  communityOpportunityText: { ...typography.caption, color: '#FFFFFF', lineHeight: 18, fontWeight: '700', marginTop: 6 },"),
    ('community note typography', "  communityOpportunityNote: { color: '#FFFFFF', fontSize: 9, lineHeight: 14, fontWeight: '800', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#493369' },", "  communityOpportunityNote: { ...typography.caption, color: '#FFFFFF', lineHeight: 18, fontWeight: '800', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#493369' },"),
    ('benefit typography', "  benefit: { color: '#F8F6FC', fontSize: 11, lineHeight: 17, fontWeight: '700' },", "  benefit: { ...typography.caption, color: '#F8F6FC', lineHeight: 18, fontWeight: '700' },"),
    ('subscription typography', "  subscriptionText: { color: '#F8F6FC', fontSize: 10, lineHeight: 16, marginTop: 5, fontWeight: '700' },", "  subscriptionText: { ...typography.caption, color: '#F8F6FC', lineHeight: 18, marginTop: 5, fontWeight: '700' },"),
]:
    offers = replace_once(offers, old, new, label)
offers = offers.replace("  allPlans: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },\n", "")
offers = offers.replace("  allPlansText: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' },\n", "")
offers_path.write_text(offers)

# Écouter: expose the real Free balance in the top bar and inside an active session.
home_path = Path('packages/mobile/src/screens/HomeScreenCompact.tsx')
home = home_path.read_text()
home = replace_once(home, "import { getDownloadCreditStatus } from '../services/creditService';", "import { getDownloadCreditStatus } from '../services/creditService';\nimport { typography } from '../theme/spacing';", 'home typography import')
home = replace_once(
    home,
    """function TopBar({ navigation }: any) {
  return <View style={s.topBar}>
    <TouchableOpacity style={s.round} onPress={() => navigation.navigate('SessionHistory')}><Text style={s.roundText}>☰</Text></TouchableOpacity>
    <Text style={s.brand}>KEEP</Text>
    <View style={s.topBarSpacer} />
  </View>;
}""",
    """function TopBar({ navigation, planCode, creditRemaining, creditUnlimited }: { navigation: any; planCode: string; creditRemaining: number | null; creditUnlimited: boolean }) {
  const freeLabel = creditUnlimited ? 'Free : ∞' : creditRemaining == null ? 'Free : …' : `Free : ${Math.max(0, creditRemaining)}`;
  const exhausted = !creditUnlimited && creditRemaining != null && creditRemaining <= 0;
  const paid = creditUnlimited && planCode !== 'FREE' && planCode !== 'GUEST';
  return <View style={s.topBar}>
    <TouchableOpacity style={s.round} onPress={() => navigation.navigate('SessionHistory')}><Text style={s.roundText}>☰</Text></TouchableOpacity>
    <Text style={s.brand}>KEEP</Text>
    <View style={[s.premium, paid ? s.planPaid : exhausted ? s.planExhausted : s.planFree]}>
      <Text style={[s.premiumText, exhausted ? s.planExhaustedText : paid ? undefined : s.planFreeText]}>{freeLabel}</Text>
    </View>
  </View>;
}""",
    'TopBar Free badge',
)
home = replace_once(
    home,
    """        </ListenEnergyAura>

        {error ? <View style={s.errorBanner}><Text style={s.errorBannerText}>{error}</Text></View> : null}""",
    """        </ListenEnergyAura>
        <View style={s.freeStatusRow}>
          <Text style={s.freeStatusText}>{creditUnlimited ? 'Free : ∞ · Écouter/PASSER = 0 · GARDER = 1' : `Free : ${creditRemaining == null ? '…' : Math.max(0, creditRemaining)} · Écouter/PASSER = 0 · GARDER = 1`}</Text>
        </View>

        {error ? <View style={s.errorBanner}><Text style={s.errorBannerText}>{error}</Text></View> : null}""",
    'active session Free rule',
)
home = replace_once(home, "  premiumText: { color: C.purpleLight, fontSize: 10, fontWeight: '800' },", "  premiumText: { ...typography.caption, color: C.purpleLight, fontWeight: '800' },", 'badge typography')
home = replace_once(home, "  miniLabel: { color: C.muted, fontSize: 9, marginTop: 1 },", "  miniLabel: { color: C.muted, fontSize: 9, marginTop: 1 },\n  freeStatusRow: { minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, marginTop: 5 },\n  freeStatusText: { ...typography.caption, color: C.text, lineHeight: 18, fontWeight: '800', textAlign: 'center' },", 'active Free styles')
home_path.write_text(home)

# Session recap: display the current Free balance and rules without forcing a detour.
recap_path = Path('packages/mobile/src/screens/SessionRecapScreen.tsx')
recap = recap_path.read_text()
recap = replace_once(recap, "import { spacing, radius, typography } from '../theme/spacing';", "import { spacing, radius, typography } from '../theme/spacing';\nimport { getDownloadCreditStatus } from '../services/creditService';", 'recap credit import')
recap = replace_once(
    recap,
    """  const [swipeOpen, setSwipeOpen] = useState(false);
  const [swipeTracks, setSwipeTracks] = useState<CanonicalTrack[]>([]);

  useEffect(() => {
    void refreshCreditLocks().catch(() => {});
    const unsubscribe = navigation?.addListener?.('focus', () => {
      void refreshCreditLocks().catch(() => {});
    });""",
    """  const [swipeOpen, setSwipeOpen] = useState(false);
  const [swipeTracks, setSwipeTracks] = useState<CanonicalTrack[]>([]);
  const [creditRemaining, setCreditRemaining] = useState<number | null>(null);
  const [creditUnlimited, setCreditUnlimited] = useState(false);

  const refreshFreeStatus = async () => {
    try {
      const status = await getDownloadCreditStatus();
      setCreditRemaining(status.remaining);
      setCreditUnlimited(status.unlimited);
    } catch {
      setCreditRemaining(null);
      setCreditUnlimited(false);
    }
  };

  useEffect(() => {
    void refreshCreditLocks().catch(() => {});
    void refreshFreeStatus();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      void refreshCreditLocks().catch(() => {});
      void refreshFreeStatus();
    });""",
    'recap Free state',
)
recap = replace_once(recap, """      await refreshCreditLocks().catch(() => {});
      await keepAllPendingInSession(sessionId, visibility);
    } finally {""", """      await refreshCreditLocks().catch(() => {});
      await keepAllPendingInSession(sessionId, visibility);
      await refreshFreeStatus();
    } finally {""", 'keep all Free refresh')
recap = replace_once(recap, """    await refreshCreditLocks().catch(() => {});
    await keepTrackInSession(sessionId, entry.id, undefined, visibility);
    const refreshed = useSessionHistoryStore.getState().sessions.find""", """    await refreshCreditLocks().catch(() => {});
    await keepTrackInSession(sessionId, entry.id, undefined, visibility);
    await refreshFreeStatus();
    const refreshed = useSessionHistoryStore.getState().sessions.find""", 'swipe Free refresh')
recap = replace_once(
    recap,
    """      </View>

      {lockedCount > 0 ? (
        <TouchableOpacity style={styles.lockedBanner}""",
    """      </View>

      <View style={styles.freeCard}>
        <View style={styles.freeCardTop}>
          <Text style={styles.freeCardTitle}>SOLDE FREE</Text>
          <Text style={styles.freeCardValue}>{creditUnlimited ? '∞ Free' : `${creditRemaining == null ? '…' : Math.max(0, creditRemaining)} Free`}</Text>
        </View>
        <Text style={styles.freeCardText}>Écouter / reconnaître / PASSER = 0 Free · GARDER un morceau découvert avec Écouter = 1 Free · morceau pris sur le profil d’un autre membre = 0 Free.</Text>
      </View>

      {lockedCount > 0 ? (
        <TouchableOpacity style={styles.lockedBanner}""",
    'recap Free card',
)
recap = recap.replace('KEEP vérifie d’abord ton solde. S’il reste des crédits, le cadenas disparaît automatiquement ; sinon appuie ici pour voir Premium.', 'KEEP vérifie d’abord ton solde Free. S’il en reste, le cadenas disparaît automatiquement ; sinon appuie ici pour voir Premium.')
recap = replace_once(recap, "  statsDot: { color: colors.textMuted },", "  statsDot: { color: colors.textMuted },\n  freeCard: { marginHorizontal: spacing.xl, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },\n  freeCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },\n  freeCardTitle: { ...typography.caption, color: colors.primaryLight, fontWeight: '900', letterSpacing: .5 },\n  freeCardValue: { ...typography.caption, color: colors.keep, fontWeight: '900' },\n  freeCardText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 5, fontWeight: '600' },", 'recap Free styles')
recap_path.write_text(recap)
