import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { useSessionStore } from '../store/useSessionStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { DESKTOP_MIN_WIDTH, DESKTOP_RAIL_WIDTH, DESKTOP_SIDEBAR_WIDTH } from '../layout/layoutMode';

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
  const { height, width } = useWindowDimensions();
  // Sous 1024 px (PC zoomé + panneau ouvert) : rail d'icônes, toute la largeur restante va au contenu.
  const rail = width < DESKTOP_MIN_WIDTH;
  // Aucun défilement de la sidebar PC : compacter les éléments AVANT que
  // « MICRO À L’ARRÊT » et « MES SESSIONS » passent sous la fenêtre.
  const compact = height < 900;
  // En fenêtre PC basse (écran HP / zoom navigateur), la carte du micro
  // reste dans le viewport, sans ScrollView ni barre latérale défilante.
  const veryShort = height < 720;
  const tiny = height < 520;
  const username = useUserStore((s) => s.user?.username);
  const isListening = useSessionStore((s) => s.isActive);
  const liveCount = useSessionStore((s) => s.tracks.length);
  const listenEconomy = useSessionStore((s) => s.listenEconomyStatus);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const lastCount = sessions.find((session) => !session.id.startsWith('__keep-'))?.tracks.length ?? 0;
  return (
    <View style={[s.side, rail && s.sideRail]} testID="desktop-sidebar" accessibilityLabel="Navigation Loki Music">
      {rail ? <View style={s.railInner} testID="desktop-sidebar-rail">
        <Text style={s.railBrand}>L</Text>
        {items.map((item) => {
          const active = item.name === activeName;
          return (
            <TouchableOpacity key={item.name} testID={`desktop-nav-${item.name}`} style={[s.railItem, active && s.itemActive]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`Aller à l’onglet ${item.label}`} onPress={() => onSelect(item.name)}>
              <Text style={[s.railIcon, active && s.activeText]}>{item.icon}</Text>
              <Text style={[s.railLabel, active && s.activeText]} numberOfLines={1}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={s.railSessions} onPress={onOpenSessions} accessibilityRole="button" accessibilityLabel="Afficher mes sessions"><Text style={s.railSessionsText}>{isListening ? '●' : '☰'}</Text></TouchableOpacity>
      </View> : <>
      <View style={[s.inner, compact && s.innerCompact, veryShort && s.innerVeryShort, tiny && s.innerTiny]} testID="desktop-sidebar-fitted">
        <View style={[s.brandBox, compact && s.brandBoxCompact, veryShort && s.brandBoxVeryShort]} accessibilityLabel="Compte Loki Music connecté">
          <Text style={[s.brand, compact && s.brandCompact]}>Loki Music</Text>
          <Text style={s.user} numberOfLines={1}>{username ? `@${String(username).replace(/^@/, '')}` : 'Utilisateur Loki'}</Text>
          {/* Toujours visible sans défilement, directement sous l'identité. */}
          <View style={[s.micBadge, veryShort && s.micBadgeCompact]}>
            <Text style={[s.sessionStatus, compact && s.sessionStatusCompact]} testID="desktop-mic-status" numberOfLines={1}>{isListening ? '● MICRO EN COURS' : '● MICRO À L’ARRÊT'}</Text>
          </View>
          {!veryShort ? <View style={s.brandAccent} /> : null}
        </View>
        <View style={[s.list, compact && s.listCompact]} testID="desktop-sidebar-nav">
          {items.map((item) => {
            const active = item.name === activeName;
            return (
              <TouchableOpacity
                key={item.name}
                testID={`desktop-nav-${item.name}`}
                style={[s.item, compact && s.itemCompact, veryShort && s.itemVeryShort, tiny && s.itemTiny, active && s.itemActive]}
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
        <View style={[s.session, compact && s.sessionCompact, veryShort && s.sessionVeryShort, tiny && s.sessionTiny]} testID="desktop-session-card">
          {!veryShort ? <><Text style={[s.sessionValue, compact && s.sessionValueCompact]}>{isListening ? liveCount : lastCount}</Text>
          <Text style={s.sessionLabel}>morceaux {isListening ? 'détectés' : 'dans la dernière session'}</Text></> : null}
          {listenEconomy && !compact ? <Text style={[s.quotaStatus, veryShort && s.quotaCompact]} numberOfLines={veryShort ? 1 : 2}>{listenEconomy.includedRemaining} identifications restantes · {listenEconomy.periodMode === 'WEEK' ? 'semaine' : listenEconomy.periodMode === 'MONTH' ? 'mois' : listenEconomy.periodMode === 'NEVER' ? 'crédit sans recharge' : 'aujourd’hui'}</Text> : null}
          <TouchableOpacity style={[s.primary, compact && s.primaryCompact, tiny && s.primaryTiny]} onPress={onOpenSessions} testID="desktop-open-sessions" accessibilityRole="button" accessibilityLabel="Afficher mes sessions">
            <Text style={s.primaryText}>{isListening ? 'VOIR SANS ARRÊTER' : 'MES SESSIONS'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>}
    </View>
  );
}

const s = StyleSheet.create({
  sideRail: { width: DESKTOP_RAIL_WIDTH },
  railInner: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 4 },
  railBrand: { color: colors.primaryLight, fontSize: 22, fontWeight: '900', marginBottom: 8 },
  railItem: { width: 64, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  railIcon: { color: '#CFC3E6', fontSize: 18 },
  railLabel: { color: '#CFC3E6', fontSize: 9, fontWeight: '800' },
  railSessions: { marginTop: 'auto', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  railSessionsText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  side: { width: DESKTOP_SIDEBAR_WIDTH, height: '100%', flexShrink: 0, overflow: 'hidden', backgroundColor: '#0E0A14', borderRightWidth: 1, borderRightColor: '#2B2038' },
  innerCompact: { paddingTop: 10, paddingBottom: 10, paddingHorizontal: 10, gap: 1 },
  innerVeryShort: { paddingTop: 5, paddingBottom: 5, gap: 0 },
  innerTiny: { paddingTop: 2, paddingBottom: 2 },
  brandBoxVeryShort: { paddingBottom: 3 },
  itemTiny: { minHeight: 36, paddingVertical: 0 },
  sessionTiny: { paddingVertical: 5 },
  quotaCompact: { marginTop: 2, lineHeight: 13 },
  primaryTiny: { minHeight: 38, marginTop: 4 },
  brandBoxCompact: { paddingBottom: 5 },
  brandCompact: { fontSize: 18 },
  listCompact: { marginTop: 6, gap: 2 },
  itemCompact: { minHeight: 40, paddingHorizontal: 9, gap: 8 },
  itemVeryShort: { minHeight: 36 },
  iconCompact: { fontSize: 17, width: 22 },
  labelCompact: { fontSize: 13 },
  sessionCompact: { marginTop: 'auto', padding: 9 },
  sessionVeryShort: { paddingHorizontal: 8, paddingVertical: 7, marginTop: 'auto' },
  sessionStatusCompact: { fontSize: 11 },
  sessionValueCompact: { fontSize: 24, marginTop: 2 },
  primaryCompact: { minHeight: 36, marginTop: 4 },
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
  micBadge: { alignSelf: 'flex-start', marginTop: 9, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: 'rgba(45,225,194,.10)', borderRadius: 11, borderWidth: 1, borderColor: 'rgba(45,225,194,.24)' },
  micBadgeCompact: { marginTop: 5, paddingVertical: 4 },
  session: { marginTop: 'auto', padding: 12, backgroundColor: colors.backgroundCard, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  sessionStatus: { color: colors.keep, fontSize: 11, fontWeight: '900' },
  sessionValue: { color: colors.textPrimary, fontSize: 33, fontWeight: '900', marginTop: 5 },
  sessionLabel: { color: colors.textSecondary, fontSize: 12 },
  primary: { minHeight: 42, marginTop: 10, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  primaryText: { color: colors.white, fontWeight: '900', fontSize: 12 },
});
