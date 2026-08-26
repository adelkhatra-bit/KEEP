import React from 'react';
import { Alert, Platform, View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { KeepSession } from '../types';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

function autoTitle(session: KeepSession): string {
  if (session.title) return session.title;
  const date = new Date(session.startedAt);
  const datePart = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return session.locationLabel ? `${datePart} — ${session.locationLabel}` : `Session du ${datePart}`;
}

/**
 * "Mes Sessions" — l'utilisateur retrouve non seulement ses morceaux mais
 * le moment où il les a découverts. Une session encore `pending` reste
 * modifiable en rouvrant son récapitulatif. Chaque session peut aussi être
 * supprimée pour éviter d'encombrer l'historique local.
 */
export default function SessionHistoryScreen({ navigation }: any) {
  const { t } = useTranslation();
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const deleteSession = useSessionHistoryStore((s) => s.deleteSession);

  const requestDelete = (session: KeepSession) => {
    const title = autoTitle(session);
    const message = `Supprimer « ${title} » de Mes Sessions ? Les morceaux déjà ajoutés à une playlist musicale ne seront pas supprimés de Spotify ou Apple Music.`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) deleteSession(session.id);
      return;
    }

    Alert.alert('Supprimer cette session ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteSession(session.id) },
    ]);
  };

  const renderItem = ({ item }: { item: KeepSession }) => {
    const keptCount = item.tracks.filter((tr) => tr.status === 'kept').length;
    const pendingCount = item.tracks.filter((tr) => tr.status === 'pending').length;
    const time = new Date(item.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardMain} onPress={() => navigation.navigate('SessionRecap', { sessionId: item.id })}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle} numberOfLines={1}>{autoTitle(item)}</Text>
            <Text style={styles.cardTime}>{time}</Text>
          </View>
          <Text style={styles.cardStats}>
            {t('session.detected', { count: item.tracks.length })} · {t('session.kept', { count: keptCount })}
            {pendingCount > 0 ? ` · ${t('session.pendingCount', { count: pendingCount })}` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => requestDelete(item)}
          accessibilityRole="button"
          accessibilityLabel={`Supprimer ${autoTitle(item)}`}
        >
          <Text style={styles.deleteText}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('history.title')}</Text>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🕐</Text>
          <Text style={styles.emptyText}>{t('history.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backArrow: { color: colors.textPrimary, fontSize: 22 },
  title: { ...typography.h2, color: colors.textPrimary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  list: { padding: spacing.xl, gap: spacing.md },
  card: {
    backgroundColor: colors.backgroundCard, borderRadius: radius.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  cardMain: { padding: spacing.lg },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { ...typography.bodyBold, color: colors.textPrimary, flex: 1, marginRight: spacing.sm, textTransform: 'capitalize' },
  cardTime: { color: colors.textMuted, fontSize: 12 },
  cardStats: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  deleteButton: { minHeight: 38, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
});
