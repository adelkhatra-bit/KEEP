import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { useSessionStore } from '../store/useSessionStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { DESKTOP_SIDEBAR_WIDTH } from '../layout/layoutMode';

export type DesktopNavItem = { name: string; label: string; icon: string };

/**
 * Navigation latérale du bureau (Adel, 11/10/2026) : remplace la barre du bas sur
 * ordinateur. Mêmes 5 destinations, mêmes libellés, même garde « Quitter la partie ? »
 * (fournie par `onSelect`). Jamais rendue sur téléphone ni tablette.
 */
export default function DesktopSidebar({ items, activeName, onSelect, onOpenSessions }: {
  items: DesktopNavItem[];
  activeName: string | null;
  onSelect: (name: string) => void;
  onOpenSessions: () => void;
}) {
  const { height } = useWindowDimensions();
  // Aucun défilement de la sidebar PC : compacter les éléments AVANT que
  // « MICRO À L’ARRÊT » et « MES SESSIONS » passent sous la fenêtre.
  const compact = height < 760;
  const veryShort = height < 520;
  const username = useUserStore((s) => s.user?.username);
  const isListening = useSessionStore((s) => s.isActive);
  const liveCount = useSessionStore((s) => s.tracks.length);
  const listenEconomy = useSessionStore((s) => s.listenEconomyStatus);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const lastCount = sessions.find((session) => !session.id.startsWith('__keep-'))?.tracks.length ?? 0;
  return (
    <View style={s.side} testID="desktop-sidebar" accessibilityLabel="Navigation Loki Music">
      <View style={[s.inner, compact && s.innerCompact, veryShort && s.innerVeryShort]} testID="desktop-sidebar-fitted">
        <View style={[s.brandBox, compact && s.brandBoxCompact]} accessibilityLabel="Compte Loki Music connecté">
          <Text style={[s.brand, compact && s.brandCompact]}>Loki Music</Text>
          <Text style={s.user} numberOfLines={1}>{username ? `@${String(username).replace(/^@/, '')}` : 'Utilisateur Loki'}</Text>
          <View style={s.brandAccent} />
        </View>
        <View style={[s.list, compact && s.listCompact]} testID="desktop-sidebar-nav">
          {items.map((item) => {
            const active = item.name === activeName;
            return (
              <TouchableOpacity
                key={item.name}
                testID={`desktop-nav-${item.name}`}
                style={[s.item, compact && s.itemCompact, veryShort && s.itemVeryShort, active && s.itemActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Aller à l’onglet ${item.label}`}
                onPress={() => onSelect(item.name)}
              >
                <Text style={[s.icon, compact && s.iconCompact, active && s.activeText]}>{item.icon}</Text>
                <Text style={[s.label, compact && s.labelCompact, active && s.activeText]} numberOfLines={1}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={[s.session, compact && s.sessionCompact, veryShort && s.sessionVeryShort]} testID="desktop-session-card">
          <Text style={[s.sessionStatus, compact && s.sessionStatusCompact]} testID="desktop-mic-status">{isListening ? '● MICRO EN COURS' : '● MICRO À L’ARRÊT'}</Text>
          {!veryShort ? <><Text style={[s.sessionValue, compact && s.sessionValueCompact]}>{isListening ? liveCount : lastCount}</Text>
          <Text style={s.sessionLabel}>morceaux {isListening ? 'détectés' : 'dans la dernière session'}</Text></> : null}
          {listenEconomy ? <Text style={s.quotaStatus}>{listenEconomy.includedRemaining} identifications restantes · {listenEconomy.periodMode === 'WEEK' ? 'semaine' : listenEconomy.periodMode === 'MONTH' ? 'mois' : listenEconomy.periodMode === 'NEVER' ? 'crédit sans recharge' : 'aujourd’hui'}</Text> : null}
          <TouchableOpacity style={[s.primary, compact && s.primaryCompact]} onPress={onOpenSessions} testID="desktop-open-sessions" accessibilityRole="button" accessibilityLabel="Afficher mes sessions">
            <Text style={s.primaryText}>{isListening ? 'VOIR SANS ARRÊTER' : 'MES SESSIONS'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  side: { width: DESKTOP_SIDEBAR_WIDTH, height: '100%', flexShrink: 0, backgroundColor: '#0E0A14', borderRightWidth: 1, borderRightColor: '#2B2038' },
  innerCompact: { paddingTop: 10, paddingBottom: 10, paddingHorizontal: 10, gap: 1 },
  innerVeryShort: { paddingTop: 4, paddingBottom: 4 },
  brandBoxCompact: { paddingBottom: 5 },
  brandCompact: { fontSize: 18 },
  listCompact: { marginTop: 7, gap: 2 },
  itemCompact: { minHeight: 40, paddingHorizontal: 9, gap: 8 },
  itemVeryShort: { minHeight: 34 },
  iconCompact: { fontSize: 17, width: 22 },
  labelCompact: { fontSize: 13 },
  sessionCompact: { marginTop: 'auto', padding: 9 },
  sessionVeryShort: { padding: 6 },
  sessionStatusCompact: { fontSize: 10 },
  sessionValueCompact: { fontSize: 24, marginTop: 2 },
  primaryCompact: { minHeight: 38, marginTop: 6 },
  inner: { flex: 1, minHeight: 0, paddingHorizontal: 14, paddingTop: 22, paddingBottom: 18, gap: 4 },
  brandBox: { paddingHorizontal: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#302444' },
  brandAccent: { width: 42, height: 3, marginTop: 10, borderRadius: 2, backgroundColor: colors.primaryLight },
  brand: { color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  quotaStatus: { color: colors.primaryLight, fontSize: 11, lineHeight: 17, fontWeight: '800', marginTop: 8 },
  user: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  list: { marginTop: 20, gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 12, borderRadius: 12 },
  itemActive: { backgroundColor: 'rgba(124,92,255,0.18)' },
  icon: { color: '#FFFFFF', fontSize: 20, width: 26, textAlign: 'center' },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  activeText: { color: colors.primaryLight },
  session: { marginTop: 22, padding: 12, backgroundColor: colors.backgroundCard, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  sessionStatus: { color: colors.keep, fontSize: 11, fontWeight: '900' },
  sessionValue: { color: colors.textPrimary, fontSize: 33, fontWeight: '900', marginTop: 5 },
  sessionLabel: { color: colors.textSecondary, fontSize: 12 },
  primary: { minHeight: 42, marginTop: 10, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  primaryText: { color: colors.white, fontWeight: '900', fontSize: 12 },
});
