import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeepNotification, loadNotificationPreferences, markNotificationRead, subscribeToNotifications } from '../services/notificationService';
import { useUserStore } from '../store/useUserStore';

const VISIBLE_MS = 4600;

function dataText(notification: KeepNotification | null, key: string): string {
  const value = notification?.data?.[key];
  return typeof value === 'string' ? value : '';
}

export default function GlobalNotificationBanner() {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const [current, setCurrent] = useState<KeepNotification | null>(null);
  const translateX = useRef(new Animated.Value(430)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationsEnabled = useRef(true);

  const animateOut = (after?: () => void) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(translateX, { toValue: 430, duration: 260, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setCurrent(null);
      after?.();
    });
  };

  useEffect(() => {
    if (!user || isDemoMode || isLocalGuest) {
      notificationsEnabled.current = false;
      setCurrent(null);
      return undefined;
    }

    let active = true;
    notificationsEnabled.current = true;
    void loadNotificationPreferences(user.id)
      .then((prefs) => {
        if (active) notificationsEnabled.current = prefs.systemEnabled;
      })
      .catch(() => {});

    const unsubscribe = subscribeToNotifications(user.id, (notification) => {
      if (!active || !notificationsEnabled.current) return;

      if (hideTimer.current) clearTimeout(hideTimer.current);
      translateX.stopAnimation();
      opacity.stopAnimation();
      translateX.setValue(430);
      opacity.setValue(0);
      setCurrent(notification);

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(translateX, { toValue: 0, damping: 18, stiffness: 190, mass: 0.82, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 170, useNativeDriver: true }),
        ]).start();
      });

      hideTimer.current = setTimeout(() => animateOut(), VISIBLE_MS);
    });

    return () => {
      active = false;
      unsubscribe();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = null;
    };
  }, [isDemoMode, isLocalGuest, opacity, translateX, user?.id]);

  if (!current || !user || isDemoMode || isLocalGuest) return null;

  const artworkUrl = dataText(current, 'artworkUrl');
  const trackTitle = dataText(current, 'trackTitle');
  const trackArtist = dataText(current, 'trackArtist');
  const isMusic = current.type.toUpperCase() === 'NEW_PUBLIC_KEEP';
  const displayBody = isMusic && (trackTitle || trackArtist)
    ? [trackTitle, trackArtist].filter(Boolean).join(' — ')
    : current.body;

  const markReadAndHide = async () => {
    if (!current) return;
    const id = current.id;
    setCurrent((item) => item ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item);
    void markNotificationRead(user.id, id).catch(() => {});
    animateOut();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { opacity, transform: [{ translateX }] },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.94}
        style={styles.banner}
        onPress={() => { void markReadAndHide(); }}
        accessibilityRole="button"
        accessibilityLabel={`${current.title}. ${displayBody}. Toucher pour marquer comme lu.`}
      >
        {artworkUrl ? (
          <Image source={{ uri: artworkUrl }} style={styles.artwork} />
        ) : (
          <View style={styles.artworkFallback}><Text style={styles.note}>♫</Text></View>
        )}
        <View style={styles.copy}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>{isMusic ? 'KEEP LIVE' : 'KEEP'}</Text>
            <Text style={styles.closeHint}>toucher = lu</Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{displayBody}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 10000,
    elevation: 30,
    top: Platform.OS === 'ios' ? 54 : 18,
    left: 12,
    right: 12,
    alignItems: 'flex-end',
  },
  banner: {
    width: '100%',
    maxWidth: 390,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#49345F',
    backgroundColor: 'rgba(20, 14, 31, 0.97)',
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  artwork: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#21162E' },
  artworkFallback: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#26183A', borderWidth: 1, borderColor: '#513474' },
  note: { color: '#B79CFF', fontSize: 23, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { color: '#68F2B1', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  closeHint: { color: '#756B84', fontSize: 8, fontWeight: '700' },
  title: { color: '#F8F6FC', fontSize: 13, lineHeight: 18, fontWeight: '900', marginTop: 2 },
  body: { color: '#BDB4C8', fontSize: 11, lineHeight: 15, marginTop: 2 },
});
