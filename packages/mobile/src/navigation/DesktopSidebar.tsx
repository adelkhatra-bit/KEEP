import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const username = useUserStore((s) => s.user?.username);
  const isListening = useSessionStore((s) => s.isActive);
  const liveCount = useSessionStore((s) => s.tracks.length);
  const listenEconomy = useSessionStore((s) => s.listenEconomyStatus);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const lastCount = sessions.find((session) => !session.id.startsWith('__keep-'))?.tracks.length ?? 0;
  return (
    <View style={s.side} testID="desktop-sidebar" accessibilityLabel="Navigation Loki Music">
      <ScrollView contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>
        <View style={s.brandBox} accessibilityLabel="Compte Loki Music connecté">
          <Text style={s.brand}>Loki Music</Text>
          <Text style={s.user} numberOfLines={1}>{username ? `@${String(username).replace(/^@/, '')}` : 'Utilisateur Loki'}</Text>
          <View style={s.brandAccent} />
        </View>
        <View style={s.list}>
          {items.map((item) => {
            const active = item.name === activeName;
            return (
              <TouchableOpacity
                key={item.name}
                testID={`desktop-nav-${item.name}`}
                style={[s.item, active && s.itemActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Aller à l’onglet ${item.label}`}
                onPress={() => onSelect(item.name)}
              >
                <Text style={[s.icon, active && s.activeText]}>{item.icon}</Text>
                <Text style={[s.label, active && s.activeText]} numberOfLines={1}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={s.session} testID="desktop-session-card">
          <Text style={s.sessionStatus}>{isListening ? '● MICRO EN COURS' : '● MICRO À L’ARRÊT'}</Text>
          <Text style={s.sessionValue}>{isListening ? liveCount : lastCount}</Text>
          <Text style={s.sessionLabel}>morceaux {isListening ? 'détectés' : 'dans la dernière session'}</Text>
          {listenEconomy ? <Text style={s.quotaStatus}>{listenEconomy.includedRemaining} identifications restantes · {listenEconomy.periodMode === 'WEEK' ? 'semaine' : listenEconomy.periodMode === 'MONTH' ? 'mois' : listenEconomy.periodMode === 'NEVER' ? 'crédit sans recharge' : 'aujourd’hui'}</Text> : null}
          <TouchableOpacity style={s.primary} onPress={onOpenSessions} accessibilityRole="button" accessibilityLabel="Afficher mes sessions">
            <Text style={s.primaryText}>{isListening ? 'VOIR SANS ARRÊTER' : 'MES SESSIONS'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  side: { width: DESKTOP_SIDEBAR_WIDTH, backgroundColor: '#0E0A14', borderRightWidth: 1, borderRightColor: '#2B2038' },
  inner: { paddingHorizontal: 14, paddingTop: 22, paddingBottom: 18, gap: 4 },
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
