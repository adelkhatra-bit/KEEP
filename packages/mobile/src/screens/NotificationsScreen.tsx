import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import {
  KeepNotification,
  NotificationPreferences,
  deleteAllNotifications,
  deleteNotification,
  loadNotifications,
  loadNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
  subscribeToNotifications,
} from '../services/notificationService';
import { spacing, radius, typography } from '../theme/spacing';

function notificationTypeLabel(type: string) {
  const key = type.trim().toUpperCase();
  if (key === 'NEW_FOLLOWER') return 'NOUVEL ABONNÉ';
  if (key === 'FOLLOWER_LEFT') return 'DÉSABONNEMENT';
  if (key === 'NEW_PUBLIC_KEEP') return 'NOUVEAU KEEP';
  if (key === 'MUSIC_TAKEN') return 'KEEP PARTAGÉ';
  if (key === 'SOCIAL_REQUEST') return 'RÉSEAU SOCIAL';
  if (key === 'PLAN_GIFTED') return 'ABONNEMENT';
  if (key === 'BATTLE_CHALLENGE' || key === 'KEEP_BATTLE_CHALLENGE' || key === 'BATTLE_INVITE' || key === 'KEEP_BATTLE_INVITE') return 'INVITATION BATTLE';
  return key.replace(/_/g, ' ');
}

export default function NotificationsScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const [items, setItems] = useState<KeepNotification[]>([]);
  const [prefs, setPrefs] = useState<NotificationPreferences>({ systemEnabled: true, djEnabled: true, socialEnabled: true, marketingEnabled: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = async () => {
    if (!user) return;
    try {
      const [notifications, preferences] = await Promise.all([
        loadNotifications(user.id),
        loadNotificationPreferences(user.id),
      ]);
      setItems(notifications);
      setPrefs(preferences);
      setError(null);
    } catch {
      setError('Impossible de charger les notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!user) return undefined;

    const run = async () => {
      try {
        const [notifications, preferences] = await Promise.all([
          loadNotifications(user.id),
          loadNotificationPreferences(user.id),
        ]);
        if (!cancelled) {
          setItems(notifications);
          setPrefs(preferences);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Impossible de charger les notifications.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    const unsubscribeFocus = navigation?.addListener?.('focus', () => { void refresh(); });
    const unsubscribeRealtime = subscribeToNotifications(user.id, (notification) => {
      if (cancelled) return;
      setItems((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
    });

    return () => {
      cancelled = true;
      unsubscribeFocus?.();
      unsubscribeRealtime();
    };
  }, [navigation, user?.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 1800);
    return () => clearTimeout(timer);
  }, [notice]);

  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  const updatePrefs = async (patch: Partial<NotificationPreferences>) => {
    if (!user) return;
    const previous = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await saveNotificationPreferences(user.id, next);
      setNotice('Préférence enregistrée');
      setError(null);
    } catch {
      setPrefs(previous);
      setError('Impossible d’enregistrer les préférences.');
    }
  };

  const readOne = async (item: KeepNotification) => {
    if (!user || item.readAt) return;
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => n.id === item.id ? { ...n, readAt: now } : n));
    try {
      await markNotificationRead(user.id, item.id);
      setError(null);
    } catch {
      setItems((current) => current.map((n) => n.id === item.id ? { ...n, readAt: item.readAt } : n));
      setError('Impossible de marquer cette notification comme lue.');
    }
  };

  const isBattleInvite = (item: KeepNotification) => {
    const type = String(item.type || '').toUpperCase();
    return ['BATTLE_CHALLENGE', 'KEEP_BATTLE_CHALLENGE', 'BATTLE_INVITE', 'KEEP_BATTLE_INVITE'].includes(type)
      || Boolean(item.data?.challengeId);
  };

  const battleTheme = (item: KeepNotification) => String(item.data?.themeCode || 'MIX').replace(/_/g, ' ');


  const readAll = async () => {
    if (!user) return;
    const previous = items;
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    try {
      await markAllNotificationsRead(user.id);
      setNotice('Toutes les notifications sont lues');
      setError(null);
    } catch {
      setItems(previous);
      setError('Impossible de tout marquer comme lu.');
    }
  };

  const removeOne = async (item: KeepNotification) => {
    if (!user || deletingId) return;
    setDeletingId(item.id);
    const previous = items;
    setItems((current) => current.filter((n) => n.id !== item.id));
    try {
      await deleteNotification(user.id, item.id);
      setNotice('Notification supprimée');
      setError(null);
    } catch {
      setItems(previous);
      setError('Impossible de supprimer cette notification.');
    } finally {
      setDeletingId(null);
    }
  };

  const clearAll = async () => {
    if (!user || deleting) return;
    setDeleting(true);
    setError(null);
    const previous = items;
    setItems([]);
    try {
      await deleteAllNotifications(user.id);
      setNotice('Notifications supprimées');
    } catch {
      setItems(previous);
      setError('Impossible de supprimer les notifications.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmClearAll = () => {
    if (!items.length || deleting) return;
    const message = 'Supprimer toutes les notifications de ce centre ? Cette action n’efface pas ton compte ni tes préférences.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) void clearAll();
      return;
    }
    Alert.alert(
      'Supprimer les notifications',
      message,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Tout supprimer', style: 'destructive', onPress: () => void clearAll() },
      ],
    );
  };

  const openActions = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Marquer toutes les notifications comme lues ?')) void readAll();
      return;
    }
    Alert.alert('Notifications', undefined, [
      { text: 'Tout marquer comme lu', onPress: () => void readAll() },
      { text: 'Tout supprimer', style: 'destructive', onPress: confirmClearAll },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {notice ? <View pointerEvents="none" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Retour"><Text style={styles.back}>‹</Text></TouchableOpacity>
          <View><Text style={styles.title}>Notifications</Text><Text style={styles.subtitle}>{unread} non lue{unread > 1 ? 's' : ''}</Text></View>
          <TouchableOpacity style={styles.moreButton} onPress={openActions} accessibilityLabel="Actions notifications"><Text style={styles.moreText}>•••</Text></TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleNoMargin}>Centre de notifications</Text>
            {items.length ? <TouchableOpacity onPress={confirmClearAll} disabled={deleting}><Text style={styles.clearText}>{deleting ? 'Suppression…' : 'Tout supprimer'}</Text></TouchableOpacity> : null}
          </View>
          {loading ? <ActivityIndicator color="#A884FA" /> : error && items.length === 0 ? <Text style={styles.error}>{error}</Text> : items.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyIcon}>♩</Text><Text style={styles.muted}>Aucune notification pour le moment.</Text></View>
          ) : items.map((item) => (
            <View key={item.id} style={[styles.card, !item.readAt && styles.cardUnread]}>
              <TouchableOpacity style={styles.cardMain} onPress={() => { void readOne(item); }} activeOpacity={0.84} accessibilityLabel={`${item.title}. ${item.readAt ? 'Lue' : 'Non lue'}`}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardType}>{notificationTypeLabel(item.type)}</Text>
                  <View style={styles.readState}>{!item.readAt ? <View style={styles.unreadDot} /> : <Text style={styles.readText}>LU</Text>}</View>
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
                {isBattleInvite(item) ? <View style={styles.battleTheme}><Text style={styles.battleThemeLabel}>STYLE DU MATCH</Text><Text style={styles.battleThemeValue}>{battleTheme(item)}</Text></View> : null}
                <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString('fr-FR')}</Text>
              </TouchableOpacity>
              <View style={styles.cardFooter}>
                {!item.readAt ? <TouchableOpacity onPress={() => { void readOne(item); }}><Text style={styles.readAction}>Marquer comme lu</Text></TouchableOpacity> : <View />}
                <TouchableOpacity onPress={() => { void removeOne(item); }} disabled={deletingId === item.id} accessibilityLabel={`Supprimer ${item.title}`}>
                  <Text style={styles.deleteOneText}>{deletingId === item.id ? 'Suppression…' : 'Supprimer'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {error && items.length > 0 && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Réglages des notifications</Text>
          <Text style={styles.preferenceHint}>Active ou désactive ce que KEEP peut t’envoyer. Les réglages restent accessibles en bas du centre.</Text>
          <Preference label="Système" value={prefs.systemEnabled} onValueChange={(v) => updatePrefs({ systemEnabled: v })} />
          <Preference label="DJ & soirées" value={prefs.djEnabled} onValueChange={(v) => updatePrefs({ djEnabled: v })} />
          <Preference label="Social" value={prefs.socialEnabled} onValueChange={(v) => updatePrefs({ socialEnabled: v })} />
          <Preference label="Marketing" value={prefs.marketingEnabled} onValueChange={(v) => updatePrefs({ marketingEnabled: v })} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Preference({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={styles.preference}><Text style={styles.preferenceLabel}>{label}</Text><Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#2A2035', true: '#6D35CF' }} thumbColor={value ? '#C3ADFF' : '#8F879D'} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090610' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  back: { color: '#F8F6FC', fontSize: 38, lineHeight: 40 },
  title: { ...typography.h2, color: '#F8F6FC', textAlign: 'center' },
  subtitle: { color:'#FFFFFF', fontSize: 11, textAlign: 'center', marginTop: 2 },
  moreButton: { minWidth: 42, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#151020', borderWidth: 1, borderColor: '#312348' },
  moreText: { color: '#B79CFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  notice: { position: 'absolute', zIndex: 20, top: 12, alignSelf: 'center', maxWidth: '78%', backgroundColor: 'rgba(27,19,41,.96)', borderWidth: 1, borderColor: '#4D3A69', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  noticeText: { color: '#F8F6FC', fontSize: 10, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  section: { marginBottom: spacing.xxl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { color: '#F8F6FC', fontSize: 16, fontWeight: '900', marginBottom: spacing.md },
  sectionTitleNoMargin: { color: '#F8F6FC', fontSize: 16, fontWeight: '900' },
  clearText: { color: '#FF7D92', fontSize: 10, fontWeight: '900' },
  preferenceHint: { color:'#FFFFFF', fontSize: 10, lineHeight: 15, marginBottom: spacing.md },
  preference: { minHeight: 56, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#151020', borderWidth: 1, borderColor: '#312348', borderRadius: radius.md, marginBottom: spacing.sm },
  preferenceLabel: { color: '#F8F6FC', fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: '#151020', borderWidth: 1, borderColor: '#312348', borderRadius: 16, marginBottom: spacing.sm, overflow: 'hidden' },
  cardUnread: { borderColor: '#8B5CF6', backgroundColor: '#1B1329' },
  cardMain: { padding: spacing.md, paddingBottom: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardType: { color: '#A884FA', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  readState: { minWidth: 24, alignItems: 'flex-end' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#68F2B1' },
  readText: { color:'#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  cardTitle: { color: '#F8F6FC', fontSize: 14, fontWeight: '900', marginTop: 7 },
  cardBody: { color:'#FFFFFF', fontSize: 12, lineHeight: 18, marginTop: 4 },
  cardDate: { color:'#FFFFFF', fontSize: 10, marginTop: 8 },
  battleTheme: { marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#5D3D7B', backgroundColor: '#241630', paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  battleThemeLabel: { color: '#D8C7FF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  battleThemeValue: { color: '#E5F266', fontSize: 12, fontWeight: '900' },
  battleActions: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  battleAction: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  battleRefuse: { backgroundColor: '#1B121F', borderColor: '#78435A' },
  battleAccept: { backgroundColor: '#E5F266', borderColor: '#E5F266' },
  battleRefuseText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  battleAcceptText: { color: '#17130C', fontSize: 11, fontWeight: '900' },
  cardFooter: { minHeight: 38, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: '#2A2035', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readAction: { color: '#A884FA', fontSize: 9, fontWeight: '800' },
  deleteOneText: { color: '#FF7D92', fontSize: 9, fontWeight: '900' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, backgroundColor: '#151020', borderRadius: 16, borderWidth: 1, borderColor: '#312348' },
  emptyIcon: { color: '#A884FA', fontSize: 28, marginBottom: spacing.sm },
  muted: { color:'#FFFFFF', fontSize: 12, textAlign: 'center' },
  error: { color: '#FF6B86', fontSize: 12, marginTop: spacing.sm },
});