import React, { useEffect, useMemo, useState } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useTranslation } from 'react-i18next';
import { isCloudProfileRecoverySession, useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useSessionStore } from '../store/useSessionStore';
import { KeepSession } from '../types';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { getDownloadCreditStatus } from '../services/creditService';

function autoTitle(session: KeepSession): string {
  if (session.title) return session.title;
  const date = new Date(session.startedAt);
  const datePart = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return session.locationLabel ? `${datePart} — ${session.locationLabel}` : `Session du ${datePart}`;
}

function pendingTracks(session: KeepSession): number {
  return session.tracks.filter((track) => track.status === 'pending').length;
}

export default function SessionHistoryScreen({ navigation }: any) {
  const { t } = useTranslation();
  const sessions = useSessionHistoryStore((s) => s.sessions);
  // Les morceaux gardés restaurés depuis Supabase alimentent le profil musical/Loki DNA,
  // mais ne constituent pas un historique complet de session (les PASS/pending
  // ne sont pas sur le serveur). La session technique de récupération reste
  // donc invisible ici pour ne jamais inventer une fausse écoute utilisateur.
  const visibleSessions = useMemo(() => sessions
    .filter((session) => !isCloudProfileRecoverySession(session))
    .slice()
    .sort((a, b) => {
      const aPending = pendingTracks(a);
      const bPending = pendingTracks(b);
      if ((aPending > 0) !== (bPending > 0)) return aPending > 0 ? -1 : 1;
      if (aPending !== bPending) return bPending - aPending;
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    }), [sessions]);
  const deleteSession = useSessionHistoryStore((s) => s.deleteSession);
  const refreshCreditLocks = useSessionHistoryStore((s) => s.refreshCreditLocks);
  const reconcileOrphanedLiveSessions = useSessionHistoryStore((s) => s.reconcileOrphanedLiveSessions);
  const isListening = useSessionStore((s) => s.isActive);
  const activeSessionId = useSessionStore((s) => s.sessionId);
  const [planBadge, setPlanBadge] = useState<{ label: string; focusPlan: string; paid: boolean }>({ label: 'Free', focusPlan: 'PREMIUM', paid: false });
  const realActiveSessionId = isListening ? activeSessionId : null;
  const hasOrphanedLiveSession = visibleSessions.some((session) => session.endedAt == null && session.id !== realActiveSessionId);

  const refreshPlanBadge = async () => {
    try {
      const status = await getDownloadCreditStatus();
      const rawCode = String(status.planCode || 'FREE').toUpperCase();
      const code = rawCode === 'GUEST' || rawCode === 'DEMO' ? 'FREE' : rawCode;
      const paid = code !== 'FREE';
      const label = code === 'PREMIUM'
        ? '♛ Premium'
        : code === 'CREATOR_PRO'
          ? 'Creator Pro'
          : code === 'VENUE_PRO'
            ? 'Venue Pro'
            : status.remaining == null ? 'Free' : `Free · ${status.remaining}`;
      setPlanBadge({ label, focusPlan: paid ? code : 'PREMIUM', paid });
    } catch {
      setPlanBadge({ label: 'Free', focusPlan: 'PREMIUM', paid: false });
    }
  };

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
      void refreshPlanBadge();
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
    const pendingCount = pendingTracks(item);
    const lockedCount = item.tracks.filter((tr) => tr.status === 'pending' && tr.creditLocked).length;
    const time = new Date(item.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    // endedAt=null n'est plus suffisant : un crash/reload pouvait laisser ce
    // marqueur dans AsyncStorage. L'UI n'affiche « Écoute en cours » que si le
    // moteur micro possède réellement la même session active en mémoire.
    const isLive = isListening && activeSessionId === item.id && item.endedAt == null;

    return (
      <View style={[styles.card, pendingCount > 0 && styles.cardNeedsSorting]}>
        <TouchableOpacity style={styles.cardMain} onPress={() => !isLive && navigation.navigate('SessionRecap', { sessionId: item.id })} disabled={isLive}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle} numberOfLines={1}>{autoTitle(item)}</Text>
            <Text style={styles.cardTime}>{time}</Text>
          </View>
          <Text style={styles.cardStats}>
            {t('session.detected', { count: item.tracks.length })} · {t('session.kept', { count: keptCount })}
            {pendingCount > 0 ? ` · ${pendingCount} à swiper` : ''}
          </Text>
          {isLive ? <Text style={styles.liveHint}>● Écoute en cours · les titres sont sauvegardés localement au fil de la session</Text> : null}
          {lockedCount > 0 ? <Text style={styles.lockedHint}>🔒 {lockedCount} morceau{lockedCount > 1 ? 'x' : ''} en attente de déblocage</Text> : null}
        </TouchableOpacity>
        {!isLive ? <View style={styles.cardFooter}>
          {pendingCount > 0 ? (
            <TouchableOpacity style={styles.sortButton} onPress={() => navigation.navigate('SessionRecap', { sessionId: item.id, openSwipe: true })} accessibilityRole="button" accessibilityLabel={`Swiper ${pendingCount} musiques`}>
              <Text style={styles.sortText}>SWIPER · {pendingCount}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.deleteButton, pendingCount === 0 && styles.deleteButtonFull]} onPress={() => requestDelete(item)} accessibilityRole="button" accessibilityLabel={`Supprimer ${autoTitle(item)}`}><Text style={styles.deleteText}>Supprimer</Text></TouchableOpacity>
        </View> : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} hitSlop={8}><Text style={styles.backArrow}>←</Text></TouchableOpacity>
        <Text style={styles.title}>{t('history.title')}</Text>
        <TouchableOpacity
          style={[styles.planBadge, planBadge.paid ? styles.planBadgePaid : styles.planBadgeFree]}
          onPress={() => navigation.navigate('Offers', { focusPlan: planBadge.focusPlan, sourceFeature: 'SESSION_PLAN_BADGE' })}
          accessibilityLabel="Voir mon offre Loki"
        >
          <Text style={[styles.planBadgeText, planBadge.paid ? styles.planBadgePaidText : styles.planBadgeFreeText]}>{planBadge.label}</Text>
        </TouchableOpacity>
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
  title: { ...typography.h2, color: colors.textPrimary, flex: 1 },
  planBadge: { minHeight: 30, minWidth: 70, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  planBadgeFree: { backgroundColor: '#10271F', borderColor: '#3BCB8B' },
  planBadgePaid: { backgroundColor: '#25183B', borderColor: colors.primaryLight },
  planBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: .3 },
  planBadgeFreeText: { color: '#68F2B1' },
  planBadgePaidText: { color: colors.primaryLight },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  list: { padding: spacing.xl, gap: spacing.md },
  card: { backgroundColor: colors.backgroundCard, borderRadius: radius.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardNeedsSorting: { borderColor: colors.primaryLight },
  cardMain: { padding: spacing.lg },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { ...typography.bodyBold, color: colors.textPrimary, flex: 1, marginRight: spacing.sm, textTransform: 'capitalize' },
  cardTime: { color: colors.textMuted, fontSize: 12 },
  cardStats: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  liveHint: { color: colors.keep, fontSize: 10, lineHeight: 15, marginTop: 7, fontWeight: '700' },
  lockedHint: { color: colors.primaryLight, fontSize: 10, lineHeight: 15, marginTop: 5, fontWeight: '800' },
  cardFooter: { minHeight: 42, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'stretch' },
  sortButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRightWidth: 1, borderRightColor: colors.border },
  sortText: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: .4 },
  deleteButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  deleteButtonFull: { flex: 1 },
  deleteText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
});