import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import {
  KeepNotification,
  NotificationPreferences,
  deleteAllNotifications,
  loadNotifications,
  loadNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
} from '../services/notificationService';
import { spacing, radius, typography } from '../theme/spacing';

export default function NotificationsScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const [items, setItems] = useState<KeepNotification[]>([]);
  const [prefs, setPrefs] = useState<NotificationPreferences>({ systemEnabled: true, djEnabled: true, socialEnabled: true, marketingEnabled: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user) return;
      try {
        const [notifications, preferences] = await Promise.all([
          loadNotifications(user.id),
          loadNotificationPreferences(user.id),
        ]);
        if (!cancelled) {
          setItems(notifications);
          setPrefs(preferences);
        }
      } catch {
        if (!cancelled) setError('Impossible de charger les notifications.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 1800);
    return () => clearTimeout(timer);
  }, [notice]);

  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  const updatePrefs = async (patch: Partial<NotificationPreferences>) => {
    if (!user) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await saveNotificationPreferences(user.id, next);
      setNotice('Préférence enregistrée');
    } catch {
      setError('Impossible d’enregistrer les préférences.');
    }
  };

  const readOne = async (item: KeepNotification) => {
    if (!user || item.readAt) return;
    try {
      await markNotificationRead(user.id, item.id);
      setItems((current) => current.map((n) => n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n));
    } catch {
      setError('Impossible de marquer cette notification comme lue.');
    }
  };

  const readAll = async () => {
    if (!user) return;
    try {
      await markAllNotificationsRead(user.id);
      const now = new Date().toISOString();
      setItems((current) => current.map((n) => ({ ...n, readAt: n.readAt ?? now })));
      setNotice('Toutes les notifications sont lues');
    } catch {
      setError('Impossible de tout marquer comme lu.');
    }
  };

  const clearAll = async () => {
    if (!user || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAllNotifications(user.id);
      setItems([]);
      setNotice('Notifications supprimées');
    } catch {
      setError('Impossible de supprimer les notifications.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmClearAll = () => {
    if (!items.length || deleting) return;
    Alert.alert(
      'Supprimer les notifications',
      'Supprimer toutes les notifications de ce centre ? Cette action n’efface pas ton compte ni tes préférences.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Tout supprimer', style: 'destructive', onPress: () => void clearAll() },
      ],
    );
  };

  const openActions = () => {
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
          <Text style={styles.sectionTitle}>Préférences</Text>
          <Preference label="Système" value={prefs.systemEnabled} onValueChange={(v) => updatePrefs({ systemEnabled: v })} />
          <Preference label="DJ & soirées" value={prefs.djEnabled} onValueChange={(v) => updatePrefs({ djEnabled: v })} />
          <Preference label="Social" value={prefs.socialEnabled} onValueChange={(v) => updatePrefs({ socialEnabled: v })} />
          <Preference label="Marketing" value={prefs.marketingEnabled} onValueChange={(v) => updatePrefs({ marketingEnabled: v })} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Centre de notifications</Text>
            {items.length ? <TouchableOpacity onPress={confirmClearAll} disabled={deleting}><Text style={styles.clearText}>{deleting ? 'Suppression…' : 'Tout supprimer'}</Text></TouchableOpacity> : null}
          </View>
          {loading ? <ActivityIndicator color="#A884FA" /> : error && items.length === 0 ? <Text style={styles.error}>{error}</Text> : items.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyIcon}>♩</Text><Text style={styles.muted}>Aucune notification pour le moment.</Text></View>
          ) : items.map((item) => (
            <TouchableOpacity key={item.id} style={[styles.card, !item.readAt && styles.cardUnread]} onPress={() => readOne(item)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardType}>{item.type.toUpperCase()}</Text>
                {!item.readAt && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{item.body}</Text>
              <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString('fr-FR')}</Text>
            </TouchableOpacity>
          ))}
          {error && items.length > 0 && <Text style={styles.error}>{error}</Text>}
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
  subtitle: { color: '#8F879D', fontSize: 11, textAlign: 'center', marginTop: 2 },
  moreButton: { minWidth: 42, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#151020', borderWidth: 1, borderColor: '#312348' },
  moreText: { color: '#B79CFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  notice: { position: 'absolute', zIndex: 20, top: 12, alignSelf: 'center', maxWidth: '78%', backgroundColor: 'rgba(27,19,41,.96)', borderWidth: 1, borderColor: '#4D3A69', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  noticeText: { color: '#F8F6FC', fontSize: 10, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  section: { marginBottom: spacing.xxl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { color: '#F8F6FC', fontSize: 16, fontWeight: '900', marginBottom: spacing.md },
  clearText: { color: '#FF7D92', fontSize: 10, fontWeight: '900' },
  preference: { minHeight: 56, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#151020', borderWidth: 1, borderColor: '#312348', borderRadius: radius.md, marginBottom: spacing.sm },
  preferenceLabel: { color: '#F8F6FC', fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: '#151020', borderWidth: 1, borderColor: '#312348', borderRadius: 16, padding: spacing.md, marginBottom: spacing.sm },
  cardUnread: { borderColor: '#8B5CF6', backgroundColor: '#1B1329' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardType: { color: '#A884FA', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#68F2B1' },
  cardTitle: { color: '#F8F6FC', fontSize: 14, fontWeight: '900', marginTop: 7 },
  cardBody: { color: '#B7AEC2', fontSize: 12, lineHeight: 18, marginTop: 4 },
  cardDate: { color: '#756B84', fontSize: 10, marginTop: 8 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, backgroundColor: '#151020', borderRadius: 16, borderWidth: 1, borderColor: '#312348' },
  emptyIcon: { color: '#A884FA', fontSize: 28, marginBottom: spacing.sm },
  muted: { color: '#8F879D', fontSize: 12, textAlign: 'center' },
  error: { color: '#FF6B86', fontSize: 12, marginTop: spacing.sm },
});
