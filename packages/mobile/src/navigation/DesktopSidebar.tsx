import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { useSessionStore } from '../store/useSessionStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { DESKTOP_COMPACT_SIDEBAR_WIDTH, DESKTOP_SIDEBAR_WIDTH } from '../layout/layoutMode';

export type DesktopNavItem = { name: string; label: string; icon: string };

/**
 * Navigation latérale du bureau (Adel, 11/10/2026) : remplace la barre du bas sur
 * ordinateur. Mêmes 5 destinations, mêmes libellés, même garde « Quitter la partie ? »
 * (fournie par `onSelect`). Jamais rendue sur téléphone ni tablette.
 */
export default function DesktopSidebar({ items, activeName, onSelect, onOpenSessions, compact = false }: {
  compact?: boolean;
  items: DesktopNavItem[];
  activeName: string | null;
  onSelect: (name: string) => void;
  onOpenSessions: () => void;
}) {
  const [hoverName, setHoverName] = useState<string | null>(null);
  const username = useUserStore((s) => s.user?.username);
  const isListening = useSessionStore((s) => s.isActive);
  const liveCount = useSessionStore((s) => s.tracks.length);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const lastCount = sessions.find((session) => !session.id.startsWith('__keep-'))?.tracks.length ?? 0;
  if (compact) {
    // Fenêtre de PC étroite (640–1023 px) : icônes seules + infobulle au survol (jamais de libellé tronqué).
    return (
      <View style={[s.side, s.sideCompact]} testID="desktop-sidebar" accessibilityLabel="Navigation Loki Music">
        <ScrollView contentContainerStyle={s.innerCompact} showsVerticalScrollIndicator={false}>
          <Text style={s.brandCompact} accessibilityLabel="Loki Music">L</Text>
          {items.map((item) => {
            const active = item.name === activeName;
            return (
              <View key={item.name} style={s.compactCell}>
                <Pressable
                  testID={`desktop-nav-${item.name}`}
                  style={[s.itemCompact, active && s.itemActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Aller à l’onglet ${item.label}`}
                  onPress={() => onSelect(item.name)}
                  onHoverIn={() => setHoverName(item.name)}
                  onHoverOut={() => setHoverName((current) => (current === item.name ? null : current))}
                  onFocus={() => setHoverName(item.name)}
                  onBlur={() => setHoverName((current) => (current === item.name ? null : current))}
                >
                  <Text style={[s.icon, active && s.activeText]}>{item.icon}</Text>
                </Pressable>
                {hoverName === item.name ? <View pointerEvents="none" style={s.tooltip} testID={`desktop-nav-tip-${item.name}`}><Text style={s.tooltipText}>{item.label}</Text></View> : null}
              </View>
            );
          })}
          <TouchableOpacity style={s.sessionCompact} onPress={onOpenSessions} accessibilityRole="button" accessibilityLabel={isListening ? 'Voir sans arrêter la session' : 'Afficher mes sessions'} testID="desktop-session-card">
            <Text style={s.sessionCompactDot}>{isListening ? '●' : '○'}</Text>
            <Text style={s.sessionCompactValue}>{isListening ? liveCount : lastCount}</Text>
            <Text style={s.sessionCompactLabel}>sessions</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={s.side} testID="desktop-sidebar" accessibilityLabel="Navigation Loki Music">
      <ScrollView contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>
        <Text style={s.brand}>Loki Music</Text>
        {username ? <Text style={s.user} numberOfLines={1}>@{String(username).replace(/^@/, '')}</Text> : null}
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
          <TouchableOpacity style={s.primary} onPress={onOpenSessions} accessibilityRole="button" accessibilityLabel="Afficher mes sessions">
            <Text style={s.primaryText}>{isListening ? 'VOIR SANS ARRÊTER' : 'MES SESSIONS'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  sideCompact: { width: DESKTOP_COMPACT_SIDEBAR_WIDTH },
  innerCompact: { paddingHorizontal: 8, paddingTop: 16, paddingBottom: 16, gap: 6, alignItems: 'center' },
  brandCompact: { color: colors.primaryLight, fontSize: 24, fontWeight: '900', marginBottom: 10 },
  compactCell: { width: '100%', alignItems: 'center' },
  itemCompact: { width: 56, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  tooltip: { position: 'absolute', left: 64, top: 10, backgroundColor: '#171020', borderWidth: 1, borderColor: '#403052', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, zIndex: 50 },
  tooltipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  sessionCompact: { width: 56, marginTop: 18, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  sessionCompactDot: { color: colors.keep, fontSize: 11, fontWeight: '900' },
  sessionCompactValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  sessionCompactLabel: { color: colors.textSecondary, fontSize: 11 },
  side: { width: DESKTOP_SIDEBAR_WIDTH, backgroundColor: '#0E0A14', borderRightWidth: 1, borderRightColor: '#2B2038' },
  inner: { paddingHorizontal: 14, paddingTop: 22, paddingBottom: 18, gap: 4 },
  brand: { color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
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
