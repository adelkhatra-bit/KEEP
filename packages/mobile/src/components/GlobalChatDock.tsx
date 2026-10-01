import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MusicAgoraPanel from './MusicAgoraPanel';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { loadMusicAgoraShareableTracks } from '../services/musicAgoraService';
import { navigateToSharedProfile } from '../navigation/navigationRef';
import { useGlobalChatStore } from '../store/useGlobalChatStore';

export default function GlobalChatDock() {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const open = useGlobalChatStore((state) => state.isOpen);
  const side = useGlobalChatStore((state) => state.side);
  const target = useGlobalChatStore((state) => state.target);
  const openChat = useGlobalChatStore((state) => state.open);
  const closeChat = useGlobalChatStore((state) => state.close);
  const setSide = useGlobalChatStore((state) => state.setSide);
  const [tracks, setTracks] = useState<any[]>([]);
  const pulse = useRef(new Animated.Value(1)).current;
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const enabled = Boolean(user && !isDemoMode && !isLocalGuest);

  useEffect(() => {
    if (!enabled) {
      closeChat();
      setTracks([]);
      return;
    }
    let live = true;
    loadMusicAgoraShareableTracks(120).then((rows) => {
      if (!live) return;
      setTracks(rows.map((row) => row.track));
    }).catch(() => { if (live) setTracks([]); });
    return () => { live = false; };
  }, [enabled, user?.id, closeChat]);

  useEffect(() => {
    if (!enabled || open) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, open, pulse]);

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 7 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_event, gesture) => {
      drag.setValue({ x: gesture.dx, y: 0 });
    },
    onPanResponderRelease: (_event, gesture) => {
      setSide(gesture.dx < -12 ? 'left' : gesture.dx > 12 ? 'right' : side);
      Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 }).start();
    },
  }), [drag, side]);

  const toggle = async () => {
    if (!enabled) return;
    const next = !open;
    if (next) openChat(target); else closeChat();
    if (next) {
      void loadMusicAgoraShareableTracks(120).then((rows) => setTracks(rows.map((row) => row.track))).catch(() => {});
    }
  };

  if (!enabled || !user) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open ? (
        <MusicAgoraPanel
          compact
          compactSide={side}
          currentProfileId={user.id}
          enabled
          shareableTracks={tracks}
          initialRoomSlug={target?.roomSlug ?? undefined}
          initialReplyTarget={target?.targetProfileId ? { profileId: target.targetProfileId, username: target.targetUsername || 'utilisateur' } : undefined}
          onOpenProfile={(username) => navigateToSharedProfile(username)}
          onCompactClose={closeChat}
        />
      ) : null}

      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.fabWrap,
          side === 'left' ? styles.fabLeft : styles.fabRight,
          { transform: [{ translateX: drag.x }, { scale: pulse }] },
        ]}
      >
        <TouchableOpacity
          style={[styles.fab, open && styles.fabOpen]}
          onPress={() => void toggle()}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Fermer le Tchat Loki' : 'Ouvrir le Tchat Loki'}
        >
          <View style={styles.fabDepthBack} />
          <View style={styles.fabDepthMid} />
          <View style={styles.fabFace}>
            <Text style={styles.fabIcon}>◉</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fabWrap: { position: 'absolute', bottom: 82, zIndex: 90, elevation: 30 },
  fabLeft: { left: 12 },
  fabRight: { right: 12 },
  fab: { width: 54, height: 54, position: 'relative' },
  fabOpen: { opacity: .94 },
  fabDepthBack: { position: 'absolute', left: 7, top: 8, width: 47, height: 47, borderRadius: 24, backgroundColor: 'rgba(90,61,196,.34)' },
  fabDepthMid: { position: 'absolute', left: 3, top: 4, width: 49, height: 49, borderRadius: 25, backgroundColor: 'rgba(41,194,255,.28)' },
  fabFace: {
    width: 49, height: 49, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.primaryLight,
    backgroundColor: 'rgba(20,14,31,.98)',
    shadowColor: '#000', shadowOpacity: .42, shadowRadius: 12, shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  fabIcon: { color: colors.keep, fontSize: 24, fontWeight: '900' },
});
