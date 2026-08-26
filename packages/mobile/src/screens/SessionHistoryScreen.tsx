import React, { useEffect } from 'react';
import { Alert, Platform, View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { isCloudProfileRecoverySession, useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useSessionStore } from '../store/useSessionStore';
import { KeepSession } from '../types';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

function autoTitle(session: KeepSession): string {
  if (session.title) return session.title;
  const date = new Date(session.startedAt);
  const datePart = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return session.locationLabel ? `${datePart} — ${session.locationLabel}` : `Session du ${datePart}`;
}

export default function SessionHistoryScreen({ navigation }: any) {
  const { t } = useTranslation();
  const sessions = useSessionHistoryStore((s) => s.sessions);
  // Les KEEP restaurés depuis Supabase alimentent le profil musical/KEEP DNA,
  // mais ne constituent pas un historique complet de session (les PASS/pending
  // ne sont pas sur le serveur). La session technique de récupération reste
  // donc invisible ici pour ne jamais inventer une fausse écoute utilisateur.
  const visibleSessions = sessions.filter((session) => !isCloudProfileRecoverySession(session));
  const deleteSession = useSessionHistoryStore((s) => s.deleteSession);
  const refreshCreditLocks = useSessionHistoryStore((s) => s.refreshCreditLocks);
  const reconcileOrphanedLiveSessions = useSessionHistoryStore((s) => s.reconcileOrphanedLiveSessions);
  const isListening = useSessionStore((s) => s.isActive);
  const activeSessionId = useSessionStore((s) => s.sessionId);
  const realActiveSessionId = isListening ? activeSessionId : null;
  const hasOrphanedLiveSession = visibleSessions.some((session) => session.endedAt == null && session.id !== realActiveSessionId);

  useEffect(() => {
    // AsyncStorage se réhydrate après le premier rendu. Cette dépendance passe à
    // true dès qu'une ancienne session endedAt=null réapparaît : elle est alors
    // fermée automatiquement, sans toucher à une écoute réellement active.
    if (hasOrphanedLiveSession) reconcileOrphanedLiveSessions(realActiveSessionId);
  }, [hasOrphanedLiveSession, realActiveSessionId, reconcileOrphanedLiveSessions]);

  useEffect(() => {
    const refresh = () => {
      reconcileOrphanedLiveSessions(realActiveSessionId);
      void refreshCreditLocks().catch(() => {});
    };
    refresh();
    const unsubscribe = navigation?.addListener?.('focus', refresh);
    return () => unsubscribe?.();
  }, [navigation, realActiveSessionId, reconcileOrphanedLiveSessions, refreshCreditLocks]);

  const requestDelete = (session: KeepSession) => {
    const title = autoTitle(session);
    const message = `Supprimer « ${title} » de Mes Sessions ? Les morceaux déjà ajoutés à une playlist musicale ne seront pas supprimés de Spotify ou Apple Music.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') { if (window.confirm(message)) deleteSession(session.id); return; }
    Alert.alert('Supprimer cette session ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteSession(session.id) },
    ]);
  };

  const renderItem = ({ item }: { item: KeepSession }) => {
    const keptCount = item.tracks.filter((tr) => tr.status === 'kept').length;
    const pendingCount = item.tracks.filter((tr) => tr.status === 'pending').length;
    const lockedCount = item.tracks.filter((tr) => tr.status === 'pending' && tr.creditLocked).length;
    const time = new Date(item.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    // endedAt=null n'est plus suffisant : un crash/reload pouvait laisser ce
    // marqueur dans AsyncStorage. L'UI n'affiche « Écoute en cours » que si le
    // moteur micro possède réellement la même session active en mémoire.
    const isLive = isListening && activeSessionId === item.id && item.endedAt == null;

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardMain} onPress={() => !isLive && navigation.navigate('SessionRecap', { sessionId: item.id })} disabled={isLive}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle} numberOfLines={1}>{autoTitle(item)}</Text>
            <Text style={styles.cardTime}>{time}</Text>
          </View>
          <Text style={styles.cardStats}>
            {t('session.detected', { count: item.tracks.length })} · {t('session.kept', { count: keptCount })}
            {pendingCount > 0 ? ` · ${pendingCount} à trier` : ''}
          </Text>
          {isLive ? <Text style={styles.liveHint}>● Écoute en cours · les titres sont sauvegardés localement au fil de la session</Text> : null}
          {lockedCount > 0 ? <Text style={styles.lockedHint}>🔒 {lockedCount} morceau{lockedCount > 1 ? 'x' : ''} en attente de déblocage</Text> : null}
        </TouchableOpacity>
        {!isLive ? <TouchableOpacity style={styles.deleteButton} onPress={() => requestDelete(item)} accessibilityRole="button" accessibilityLabel={`Supprimer ${autoTitle(item)}`}><Text style={styles.deleteText}>Supprimer</Text></TouchableOpacity> : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}><Text style={styles.backArrow}>←</Text></TouchableOpacity>
        <Text style={styles.title}>{t('history.title')}</Text>
      </View>
      {visibleSessions.length === 0 ? (
        <View style={styles.centered}><Text style={styles.emptyEmoji}>🕐</Text><Text style={styles.emptyText}>{t('history.empty')}</Text></View>
      ) : (
        <FlatList data={visibleSessions} keyExtractor={(item) => item.id} renderItem={renderItem} contentContainerStyle={styles.list} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backArrow: { color: colors.textPrimary, fontSize: 22 },
  title: { ...typography.h2, color: colors.textPrimary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  list: { padding: spacing.xl, gap: spacing.md },
  card: { backgroundColor: colors.backgroundCard, borderRadius: radius.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardMain: { padding: spacing.lg },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { ...typography.bodyBold, color: colors.textPrimary, flex: 1, marginRight: spacing.sm, textTransform: 'capitalize' },
  cardTime: { color: colors.textMuted, fontSize: 12 },
  cardStats: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  liveHint: { color: colors.keep, fontSize: 10, lineHeight: 15, marginTop: 7, fontWeight: '700' },
  lockedHint: { color: colors.primaryLight, fontSize: 10, lineHeight: 15, marginTop: 5, fontWeight: '800' },
  deleteButton: { minHeight: 38, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
});