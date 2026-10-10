import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { useSessionStore } from '../store/useSessionStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useUserStore } from '../store/useUserStore';

/**
 * Un poste de travail exploite les gouttières autour de l'écoute centrale.
 * Jamais rendu sur iPhone, Android, tablette ou fenêtre étroite. Les cinq
 * écrans restent ceux de l'application (aucune duplication de navigation).
 */
export default function DesktopMusicWorkspaceRail({
  navigation, onOpenSessions,
}: { navigation: any; onOpenSessions: () => void }) {
  const { width, height } = useWindowDimensions();
  const isListening = useSessionStore((s) => s.isActive);
  const tracks = useSessionStore((s) => s.tracks);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const user = useUserStore((s) => s.user);

  if (Platform.OS !== 'web' || width < 1100) return null;
  const railWidth = Math.max(150, Math.min(260, Math.floor((width - 760) / 2) - 22));
  const recent = sessions.filter((session) => !session.id.startsWith('__keep-')).slice(0, 3);
  const shortcuts: Array<{ title: string; screen: string; hint: string }> = [
    { title: 'Découvertes', screen: 'Discover', hint: 'Explorer les trouvailles' },
    { title: 'Playlists', screen: 'MyMusic', hint: 'Mes collections' },
    { title: 'Soirées', screen: 'Parties', hint: 'Communauté et défis' },
    { title: 'Profil et boutique', screen: 'Profile', hint: 'Mon univers musical' },
  ];

  return (
    <View style={[s.rail, { width: railWidth, maxHeight: Math.max(280, height - 155) }]} testID="loki-desktop-music-rail">
      <ScrollView contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>
        <Text style={s.kicker}>ESPACE ORDINATEUR</Text>
        <Text style={s.head}>Loki Music</Text>
        {user?.username ? <Text style={s.username} numberOfLines={1}>@{user.username.replace(/^@/, '')}</Text> : null}
        <View style={s.session}>
          <Text style={s.sessionStatus}>{isListening ? '● MICRO EN COURS' : '● MICRO À L’ARRÊT'}</Text>
          <Text style={s.sessionValue}>{isListening ? tracks.length : recent[0]?.tracks.length ?? 0}</Text>
          <Text style={s.sessionLabel}>morceaux {isListening ? 'détectés' : 'dans la dernière session'}</Text>
          <TouchableOpacity style={s.primary} onPress={onOpenSessions} accessibilityRole="button" accessibilityLabel="Afficher mes sessions">
            <Text style={s.primaryText}>{isListening ? 'VOIR SANS ARRÊTER' : 'MES SESSIONS'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.section}>Accès rapide</Text>
        {shortcuts.map(({ title, screen, hint }) => (
          <TouchableOpacity key={screen} style={s.link} onPress={() => navigation.navigate(screen)} accessibilityRole="button" accessibilityLabel={'Ouvrir ' + title}>
            <Text style={s.linkName}>{title}</Text>
            <Text style={s.linkHint}>{hint}</Text>
          </TouchableOpacity>
        ))}
        {recent.length ? (
          <>
            <Text style={s.section}>Sessions récentes</Text>
            {recent.map((session) => (
              <Text key={session.id} style={s.recent} numberOfLines={2}>
                {session.title?.trim() || new Date(session.startedAt).toLocaleDateString('fr-FR')} · {session.tracks.length} morceaux
              </Text>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  rail: { position: 'absolute', left: 16, top: 86, zIndex: 4, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, overflow: 'hidden' },
  inner: { padding: 15, gap: 9 },
  kicker: { color: colors.primaryLight, fontSize: 10, letterSpacing: 1, fontWeight: '900' },
  head: { color: colors.textPrimary, fontSize: 23, fontWeight: '900' },
  username: { color: colors.textSecondary, fontSize: 12 },
  session: { padding: 12, marginTop: 8, backgroundColor: colors.backgroundCard, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  sessionStatus: { color: colors.keep, fontSize: 10, fontWeight: '900' },
  sessionValue: { color: colors.textPrimary, fontSize: 33, fontWeight: '900', marginTop: 5 },
  sessionLabel: { color: colors.textSecondary, fontSize: 11 },
  primary: { minHeight: 42, marginTop: 10, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  primaryText: { color: colors.white, fontWeight: '900', fontSize: 11 },
  section: { color: colors.textPrimary, fontSize: 13, fontWeight: '900', marginTop: 13 },
  link: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  linkName: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  linkHint: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  recent: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
});
