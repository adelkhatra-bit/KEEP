from pathlib import Path

# 1) Notification center: explicit Battle actions.
p = Path('packages/mobile/src/screens/NotificationsScreen.tsx')
s = p.read_text()
s = s.replace("import { spacing, radius, typography } from '../theme/spacing';", "import { spacing, radius, typography } from '../theme/spacing';\nimport { respondBattleChallenge } from '../services/keepBattleLiveService';", 1)
s = s.replace("  if (key === 'PLAN_GIFTED') return 'ABONNEMENT';", "  if (key === 'PLAN_GIFTED') return 'ABONNEMENT';\n  if (key === 'BATTLE_CHALLENGE' || key === 'KEEP_BATTLE_CHALLENGE' || key === 'BATTLE_INVITE' || key === 'KEEP_BATTLE_INVITE') return 'INVITATION BATTLE';", 1)
s = s.replace("  const [deletingId, setDeletingId] = useState<string | null>(null);", "  const [deletingId, setDeletingId] = useState<string | null>(null);\n  const [battleBusyId, setBattleBusyId] = useState<string | null>(null);", 1)
anchor = """  const readAll = async () => {
"""
insert = """  const isBattleInvite = (item: KeepNotification) => {
    const type = String(item.type || '').toUpperCase();
    return ['BATTLE_CHALLENGE', 'KEEP_BATTLE_CHALLENGE', 'BATTLE_INVITE', 'KEEP_BATTLE_INVITE'].includes(type)
      || Boolean(item.data?.challengeId);
  };

  const battleTheme = (item: KeepNotification) => String(item.data?.themeCode || 'MIX').replace(/_/g, ' ');

  const openBattle = (arenaId?: string | null) => {
    navigation.navigate('Main', {
      screen: 'Parties',
      params: { openBattle: true, arenaId: arenaId || undefined, source: 'notification' },
    });
  };

  const answerBattleInvite = async (item: KeepNotification, accept: boolean) => {
    if (!user || battleBusyId) return;
    const challengeId = String(item.data?.challengeId || '');
    if (!challengeId) {
      openBattle();
      return;
    }
    setBattleBusyId(item.id);
    try {
      const response = await respondBattleChallenge(challengeId, accept);
      await readOne(item);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (accept) {
        if (!response.arenaId) throw new Error('BATTLE_ARENA_MISSING');
        openBattle(response.arenaId);
      } else {
        setNotice('Battle refusé');
      }
    } catch (e: any) {
      const message = String(e?.message || '');
      if (message.includes('EXPIRED') || message.includes('NOT_PENDING')) {
        setNotice('Cette invitation a expiré');
        void refresh();
      } else {
        setError('Impossible de répondre à cette invitation Battle.');
      }
    } finally {
      setBattleBusyId(null);
    }
  };

"""
if anchor not in s:
    raise SystemExit('Notifications readAll anchor missing')
s = s.replace(anchor, insert + anchor, 1)
old = """              <TouchableOpacity style={styles.cardMain} onPress={() => { void readOne(item); }} activeOpacity={0.84} accessibilityLabel={`${item.title}. ${item.readAt ? 'Lue' : 'Non lue'}`}>
"""
new = """              <TouchableOpacity style={styles.cardMain} onPress={() => { if (isBattleInvite(item)) openBattle(); else void readOne(item); }} activeOpacity={0.84} accessibilityLabel={`${item.title}. ${item.readAt ? 'Lue' : 'Non lue'}`}>
"""
if old not in s:
    raise SystemExit('Notifications card press target missing')
s = s.replace(old, new, 1)
old = """                <Text style={styles.cardBody}>{item.body}</Text>
                <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString('fr-FR')}</Text>
              </TouchableOpacity>
              <View style={styles.cardFooter}>
"""
new = """                <Text style={styles.cardBody}>{item.body}</Text>
                {isBattleInvite(item) ? <View style={styles.battleTheme}><Text style={styles.battleThemeLabel}>STYLE DU MATCH</Text><Text style={styles.battleThemeValue}>{battleTheme(item)}</Text></View> : null}
                <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString('fr-FR')}</Text>
              </TouchableOpacity>
              {isBattleInvite(item) ? <View style={styles.battleActions}>
                <TouchableOpacity style={[styles.battleAction, styles.battleRefuse]} disabled={battleBusyId === item.id} onPress={() => void answerBattleInvite(item, false)} accessibilityRole="button" accessibilityLabel="Refuser le Battle"><Text style={styles.battleRefuseText}>REFUSER</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.battleAction, styles.battleAccept]} disabled={battleBusyId === item.id} onPress={() => void answerBattleInvite(item, true)} accessibilityRole="button" accessibilityLabel="Accepter le Battle"><Text style={styles.battleAcceptText}>{battleBusyId === item.id ? '...' : 'ACCEPTER'}</Text></TouchableOpacity>
              </View> : null}
              <View style={styles.cardFooter}>
"""
if old not in s:
    raise SystemExit('Notifications card body target missing')
s = s.replace(old, new, 1)
style_anchor = """  cardFooter: { minHeight: 38, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: '#2A2035', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
"""
style_insert = """  battleTheme: { marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#5D3D7B', backgroundColor: '#241630', paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  battleThemeLabel: { color: '#D8C7FF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  battleThemeValue: { color: '#E5F266', fontSize: 12, fontWeight: '900' },
  battleActions: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  battleAction: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  battleRefuse: { backgroundColor: '#1B121F', borderColor: '#78435A' },
  battleAccept: { backgroundColor: '#E5F266', borderColor: '#E5F266' },
  battleRefuseText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  battleAcceptText: { color: '#17130C', fontSize: 11, fontWeight: '900' },
"""
if style_anchor not in s:
    raise SystemExit('Notifications style anchor missing')
s = s.replace(style_anchor, style_insert + style_anchor, 1)
p.write_text(s)

# 2) Parties consumes navigation intent without touching Navigation.tsx.
p = Path('packages/mobile/src/screens/PartiesScreen.tsx')
s = p.read_text()
s = s.replace("export default function PartiesScreen({ navigation }: any) {", "export default function PartiesScreen({ navigation, route }: any) {", 1)
anchor = """  useEffect(() => { void reload(); }, [user?.id, isLocalGuest, isDemoMode]);
"""
insert = """  useEffect(() => {
    if (!route?.params?.openBattle) return;
    setBattleOpen(true);
    navigation.setParams?.({ openBattle: undefined, source: undefined });
  }, [navigation, route?.params?.openBattle]);
"""
if anchor not in s:
    raise SystemExit('Parties reload effect anchor missing')
s = s.replace(anchor, anchor + insert, 1)
s = s.replace("          enabled={Boolean(user && !isLocalGuest && !isDemoMode)}\n", "          enabled={Boolean(user && !isLocalGuest && !isDemoMode)}\n          initialArenaId={route?.params?.arenaId}\n", 1)
p.write_text(s)

# 3) Battle loads accepted arena passed by the notification action.
p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()
s = s.replace("  onExit?: () => void;\n};", "  onExit?: () => void;\n  initialArenaId?: string | null;\n};", 1)
s = s.replace("export default function KeepBattleMobileGameV3({ enabled, onOpenProfile, onRequireAccount, onExit }: Props) {", "export default function KeepBattleMobileGameV3({ enabled, onOpenProfile, onRequireAccount, onExit, initialArenaId }: Props) {", 1)
anchor = """  React.useEffect(() => { void loadKeepBattleThemes().then((rows) => rows.length && setThemes(rows)).catch(() => {}); }, []);
"""
insert = """  React.useEffect(() => {
    if (!enabled || !initialArenaId) return;
    let active = true;
    void (async () => {
      try {
        await stopTrackPreview();
        await leaveSoloBattle().catch(() => {});
        const loaded = await loadKeepBattleArena(initialArenaId);
        if (!active) return;
        setSolo(null); setBrowseOnline(false); setAudioReady(false); setArena(loaded);
        animateVersus();
      } catch {
        if (active) Alert.alert('Battle', 'Impossible d’ouvrir ce salon. L’invitation a peut-être expiré.');
      }
    })();
    return () => { active = false; };
  }, [enabled, initialArenaId]);
"""
if anchor not in s:
    raise SystemExit('Battle theme effect anchor missing')
# animateVersus is defined later, so place effect after animateVersus definition instead.
marker = """  const playVerified = React.useCallback(async (key: string, url?: string | null, duration = ROUND_MS): Promise<boolean> => {
"""
if marker not in s:
    raise SystemExit('Battle playVerified marker missing')
s = s.replace(marker, insert + "\n" + marker, 1)
p.write_text(s)

# 4) Native notification default taps + web realtime Battle taps route to Notifications, not Listen/home.
p = Path('packages/mobile/src/services/pushNotificationService.ts')
s = p.read_text()
s = s.replace("import { Platform } from 'react-native';", "import { Linking, Platform } from 'react-native';", 1)
s = s.replace("let trackActionSubscription: Notifications.EventSubscription | null = null;", "let trackActionSubscription: Notifications.EventSubscription | null = null;\nlet battleTapSubscription: Notifications.EventSubscription | null = null;", 1)
helper_anchor = """Notifications.setNotificationHandler({
"""
helper = """function battleLike(type: unknown, title: unknown, data?: Record<string, unknown> | null) {
  const normalized = String(type || data?.type || data?.notificationType || '').toUpperCase();
  if (['BATTLE_CHALLENGE', 'KEEP_BATTLE_CHALLENGE', 'BATTLE_INVITE', 'KEEP_BATTLE_INVITE'].includes(normalized)) return true;
  if (data?.challengeId) return true;
  return String(title || '').toUpperCase().includes('BATTLE');
}

function installBattleNotificationTapRouter() {
  if (Platform.OS === 'web' || battleTapSubscription) return;
  battleTapSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.actionIdentifier === TRACK_KEEP_ACTION || response.actionIdentifier === TRACK_PASS_ACTION) return;
    const content = response.notification.request.content;
    const data = (content.data || {}) as Record<string, unknown>;
    if (!battleLike(data.type, content.title, data)) return;
    void Linking.openURL('keep://notifications');
  });
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const content = response.notification.request.content;
    const data = (content.data || {}) as Record<string, unknown>;
    if (battleLike(data.type, content.title, data)) void Linking.openURL('keep://notifications');
  }).catch(() => {});
}

installBattleNotificationTapRouter();

"""
if helper_anchor not in s:
    raise SystemExit('Push handler anchor missing')
s = s.replace(helper_anchor, helper + helper_anchor, 1)
s = s.replace("function showWebKeepToast(title: string, body: string) {", "function showWebKeepToast(title: string, body: string, row?: Record<string, unknown>) {", 1)
s = s.replace("  toast.onclick = () => {\n    const base = `${globalThis.location?.origin ?? ''}/KEEP/notifications`;", "  toast.onclick = () => {\n    const base = `${globalThis.location?.origin ?? ''}/KEEP/notifications`;", 1)
s = s.replace("        showWebKeepToast(title, body);", "        showWebKeepToast(title, body, row);", 1)
p.write_text(s)
