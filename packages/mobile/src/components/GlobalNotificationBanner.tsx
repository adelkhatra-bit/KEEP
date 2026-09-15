import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeepNotification, loadNotificationPreferences, markNotificationRead, subscribeToNotifications } from '../services/notificationService';
import { useUserStore } from '../store/useUserStore';
import { useBattleAvailabilityStore } from '../store/useBattleAvailabilityStore';
import { respondBattleChallenge } from '../services/keepBattleLiveService';
import { respondKeepBattleArenaRematch } from '../services/keepBattleService';
import { navigateToBattleArena } from '../navigation/navigationRef';

const VISIBLE_MS = 4600;
const BATTLE_VISIBLE_MS = 20000;
const BATTLE_INLINE_TYPES = new Set([
  'BATTLE_CHALLENGE',
  'KEEP_BATTLE_CHALLENGE',
  'BATTLE_INVITE',
  'KEEP_BATTLE_INVITE',
]);

function dataText(notification: KeepNotification | null, key: string): string {
  const value = notification?.data?.[key];
  return typeof value === 'string' ? value : '';
}

function isBattleChallenge(notification: KeepNotification): boolean {
  const type = String(notification.type || '').toUpperCase();
  if (BATTLE_INLINE_TYPES.has(type)) return true;
  const title = String(notification.title || '').toUpperCase();
  return title.includes('BATTLE Loki') || title.includes('BATTLE ?');
}

// Adel (03/09/2026) : "quand j'appuie sur revanche ... si je suis sur
// Profil/Playlists/Découvertes/Écoute c'est une notif" -- même distinction
// que pour un défi frais, mais pour une revanche d'arène (type
// BATTLE_ARENA_REMATCH côté serveur) -- répond via l'arène, pas via
// keep_battle_challenges.
function isBattleRematch(notification: KeepNotification): boolean {
  return String(notification.type || '').toUpperCase() === 'BATTLE_ARENA_REMATCH';
}

export default function GlobalNotificationBanner() {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const [current, setCurrent] = useState<KeepNotification | null>(null);
  const [respondBusy, setRespondBusy] = useState(false);
  const OFFSCREEN_TOP = -260;
  const translateY = useRef(new Animated.Value(OFFSCREEN_TOP)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationsEnabled = useRef(true);
  const seenNotificationIds = useRef(new Set<string>());
  // Adel (04/09/2026) : "les notifications viennent du côté, je veux que tu
  // les fasses venir du haut vers le bas comme ça je peux les Swiper pour les
  // remonter vers le haut" -- remplace l'entrée/sortie latérale (translateX)
  // par une entrée/sortie verticale depuis le haut de l'écran, et le swipe de
  // fermeture latéral par un swipe vers le HAUT uniquement (le doigt ne peut
  // pas tirer le bandeau vers le bas au-delà de sa position posée).
  const dragY = useRef(0);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_evt, gesture) => {
      dragY.current = gesture.dy;
      translateY.setValue(Math.min(0, gesture.dy));
    },
    onPanResponderRelease: (_evt, gesture) => {
      if (gesture.dy < -70) {
        Animated.parallel([
          Animated.timing(translateY, { toValue: OFFSCREEN_TOP, duration: 200, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start(() => setCurrent(null));
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
      } else {
        Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 190, mass: 0.82, useNativeDriver: true }).start();
      }
    },
  }), [opacity, translateY]);

  const animateOut = (after?: () => void) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, { toValue: OFFSCREEN_TOP, duration: 260, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setCurrent(null);
      after?.();
    });
  };

  useEffect(() => {
    if (!user || isDemoMode || isLocalGuest) {
      notificationsEnabled.current = false;
      seenNotificationIds.current.clear();
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

      const battleChallenge = isBattleChallenge(notification);
      const battleRematch = isBattleRematch(notification);
      // Adel (02/09/2026) : "il pourra recevoir des invite dans n'importe
      // quelle page" -- seul un utilisateur explicitement rendu disponible
      // (bascule sur le Profil, voir useBattleAvailabilityStore) reçoit ce
      // bandeau actionnable pour un Battle ; sinon l'invitation reste gérée
      // uniquement à l'intérieur de l'écran Battle lui-même (déjà en place),
      // pour ne jamais couper une session d'écoute en cours sans consentement.
      if (battleChallenge || battleRematch) {
        if (!useBattleAvailabilityStore.getState().available) return;
        // Adel (03/09/2026) : "dans Soirées tu mets que du fixe, la
        // notification tu l'intègres uniquement dans
        // Profil/Playlists/Découvertes/Écoute" -- `partiesTabOpen` reste vrai
        // tant que l'écran Parties est monté, QUEL QUE SOIT son sous-onglet
        // (classement compris) -- ce bandeau flottant ne doit jamais s'y
        // afficher, un bandeau fixe interne prend déjà le relais partout là-
        // bas. Remplace l'ancien test `battleScreenOpen` (trop étroit : ne
        // couvrait que l'arène grande ouverte, pas tout l'onglet Soirées).
        if (useBattleAvailabilityStore.getState().partiesTabOpen) return;
      }

      // Realtime reconnects must never replay the same visual notification.
      if (seenNotificationIds.current.has(notification.id)) return;
      seenNotificationIds.current.add(notification.id);
      if (seenNotificationIds.current.size > 80) {
        const oldest = seenNotificationIds.current.values().next().value;
        if (oldest) seenNotificationIds.current.delete(oldest);
      }

      if (hideTimer.current) clearTimeout(hideTimer.current);
      translateY.stopAnimation();
      opacity.stopAnimation();
      translateY.setValue(OFFSCREEN_TOP);
      opacity.setValue(0);
      setCurrent(notification);

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 190, mass: 0.82, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 170, useNativeDriver: true }),
        ]).start();
      });

      hideTimer.current = setTimeout(() => animateOut(), (battleChallenge || battleRematch) ? BATTLE_VISIBLE_MS : VISIBLE_MS);
    });

    return () => {
      active = false;
      unsubscribe();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = null;
    };
  }, [isDemoMode, isLocalGuest, opacity, translateY, user?.id]);

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

  const battleChallenge = isBattleChallenge(current);
  const battleRematch = isBattleRematch(current);
  const challengeId = dataText(current, 'challengeId');
  const rematchArenaId = dataText(current, 'arenaId');

  // Adel (02/09/2026) : "il pourra recevoir des invite dans n'importe quelle
  // page ... êtes-vous prêt oui ou non" -- une fois "disponible" activé, le
  // bandeau global doit permettre de répondre directement, pas seulement
  // avertir puis renvoyer vers l'écran Battle.
  const respondFromBanner = async (accept: boolean) => {
    if (!challengeId || respondBusy) return;
    setRespondBusy(true);
    try {
      const result = await respondBattleChallenge(challengeId, accept);
      void markNotificationRead(user.id, current!.id).catch(() => {});
      animateOut(() => {
        if (accept && result.arenaId) navigateToBattleArena(result.arenaId);
      });
    } catch {
      animateOut();
    } finally {
      setRespondBusy(false);
    }
  };

  // Adel (03/09/2026) : "quand j'appuie sur revanche, pareil ça me met une
  // invite fixe ... si je suis sur Profil/Playlists/Découvertes/Écoute c'est
  // une notif" -- même geste que `respondFromBanner`, mais via l'arène (pas
  // via keep_battle_challenges) : accepter charge et ouvre directement
  // l'arène.
  const respondRematchFromBanner = async (accept: boolean) => {
    if (!rematchArenaId || respondBusy) return;
    setRespondBusy(true);
    try {
      await respondKeepBattleArenaRematch(rematchArenaId, accept);
      void markNotificationRead(user.id, current!.id).catch(() => {});
      animateOut(() => {
        if (accept) navigateToBattleArena(rematchArenaId);
      });
    } catch {
      animateOut();
    } finally {
      setRespondBusy(false);
    }
  };

  if (battleRematch && rematchArenaId) {
    return (
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <View style={styles.banner}>
          <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={styles.closeButtonText}>×</Text></TouchableOpacity>
          <View style={styles.artworkFallback}><Text style={styles.note}>🔁</Text></View>
          <View style={styles.copy}>
            <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>Loki BATTLE</Text></View>
            <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{current.body}</Text>
            <View style={styles.battleActions}>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleNo, respondBusy && styles.battleDisabled]} onPress={() => { void respondRematchFromBanner(false); }} accessibilityRole="button" accessibilityLabel="Refuser la revanche">
                <Text style={styles.battleNoText}>REFUSER</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleYes, respondBusy && styles.battleDisabled]} onPress={() => { void respondRematchFromBanner(true); }} accessibilityRole="button" accessibilityLabel="Accepter la revanche">
                <Text style={styles.battleYesText}>{respondBusy ? '...' : 'ACCEPTER'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  if (battleChallenge && challengeId) {
    return (
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <View style={styles.banner}>
          <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={styles.closeButtonText}>×</Text></TouchableOpacity>
          {artworkUrl ? (
            <Image source={{ uri: artworkUrl }} style={styles.artwork} />
          ) : (
            <View style={styles.artworkFallback}><Text style={styles.note}>⚡</Text></View>
          )}
          <View style={styles.copy}>
            <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>Loki BATTLE</Text></View>
            <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{displayBody}</Text>
            <View style={styles.battleActions}>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleNo, respondBusy && styles.battleDisabled]} onPress={() => { void respondFromBanner(false); }} accessibilityRole="button" accessibilityLabel="Refuser le Battle">
                <Text style={styles.battleNoText}>REFUSER</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleYes, respondBusy && styles.battleDisabled]} onPress={() => { void respondFromBanner(true); }} accessibilityRole="button" accessibilityLabel="Accepter le Battle">
                <Text style={styles.battleYesText}>{respondBusy ? '...' : 'ACCEPTER'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { opacity, transform: [{ translateY }] },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        activeOpacity={0.94}
        style={styles.banner}
        onPress={() => { void markReadAndHide(); }}
        accessibilityRole="button"
        accessibilityLabel={`${current.title}. ${displayBody}. Toucher pour marquer comme lu.`}
      >
        <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={styles.closeButtonText}>×</Text></TouchableOpacity>
        {artworkUrl ? (
          <Image source={{ uri: artworkUrl }} style={styles.artwork} />
        ) : (
          <View style={styles.artworkFallback}><Text style={styles.note}>♫</Text></View>
        )}
        <View style={styles.copy}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>{isMusic ? 'Loki LIVE' : 'Loki'}</Text>
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
  closeButton: { position: 'absolute', top: 6, right: 6, zIndex: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { color: '#FFF', fontSize: 15, lineHeight: 16, fontWeight: '700' },
  artwork: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#21162E' },
  artworkFallback: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#26183A', borderWidth: 1, borderColor: '#513474' },
  note: { color: '#B79CFF', fontSize: 23, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  battleActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  battleNo: { flex: 1, minHeight: 32, borderRadius: 16, borderWidth: 1, borderColor: '#8A7795', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' },
  battleNoText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  battleYes: { flex: 1, minHeight: 32, borderRadius: 16, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' },
  battleYesText: { color: '#17130B', fontSize: 11, fontWeight: '900' },
  battleDisabled: { opacity: 0.62 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { color: '#68F2B1', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  closeHint: { color:'#FFFFFF', fontSize: 8, fontWeight: '700' },
  title: { color: '#F8F6FC', fontSize: 13, lineHeight: 18, fontWeight: '900', marginTop: 2 },
  body: { color:'#FFFFFF', fontSize: 11, lineHeight: 15, marginTop: 2 },
});
