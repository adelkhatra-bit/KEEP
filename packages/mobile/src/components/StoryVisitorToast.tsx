import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { formatWatchDuration } from '../services/storyActivity';

/**
 * Petite alerte « nouveau visiteur » (Adel, 05/10/2026) : quand quelqu'un regarde MA story, une pastille glisse brièvement depuis le bord
 * de l'écran (« 👁 @teyou regarde ta story ») puis repart. Rapide, discrète, jamais bloquante (aucun toucher). Reçue en direct (Realtime) :
 * seul le propriétaire de la story peut lire ses vues (politique RLS `story_watch_owner_select`).
 */
export default function StoryVisitorToast() {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const { width } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;
  const [message, setMessage] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShown = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    if (!supabase || !user?.id || isDemoMode || isLocalGuest) return undefined;
    const client = supabase;
    const ownerId = user.id;
    let live = true;
    const show = async (viewerId: string, kind: 'start' | 'left' | 'like', seconds = 0) => {
      const now = Date.now();
      // Un même visiteur ne re-déclenche pas la même alerte pendant 30 s.
      const key = `${viewerId}:${kind}`;
      if (lastShown.current && lastShown.current.id === key && now - lastShown.current.at < 30000) return;
      lastShown.current = { id: key, at: now };
      let name = 'Quelqu’un';
      try {
        const { data } = await client.from('profiles').select('username').eq('id', viewerId).maybeSingle();
        if (data?.username) name = `@${String(data.username)}`;
      } catch { /* nom inconnu : message générique */ }
      if (!live) return;
      setMessage(kind === 'start' ? `👁 ${name} regarde ta story` : kind === 'like' ? `❤ ${name} a aimé ta musique` : `${name} est parti · ${formatWatchDuration(seconds)}`);
      slide.setValue(0);
      Animated.timing(slide, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => { if (live) setMessage(null); });
      }, 2800);
    };
    let channel: any = null;
    try {
      channel = client.channel(`story-visits-${ownerId}`)
        // Vue réelle (après le délai de présence) : « regarde » à l'arrivée, « est parti · N s » au départ (Adel, 05/10/2026).
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_watch_sessions', filter: `owner_id=eq.${ownerId}` }, (payload: any) => {
          const viewerId = String(payload?.new?.viewer_id ?? '');
          if (viewerId && viewerId !== ownerId) void show(viewerId, 'start');
        })
        // « J'aime » reçu en direct (Adel, 05/10/2026) : « ❤ @x a aimé ta musique ».
        .on('postgres_changes', { event: '*', schema: 'public', table: 'story_likes', filter: `owner_id=eq.${ownerId}` }, (payload: any) => {
          const row = payload?.new;
          if (row?.liker_id && row.liker_id !== ownerId && row.active !== false) void show(String(row.liker_id), 'like');
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'story_watch_sessions', filter: `owner_id=eq.${ownerId}` }, (payload: any) => {
          const viewerId = String(payload?.new?.viewer_id ?? '');
          if (viewerId && viewerId !== ownerId && payload?.new?.ended_at) void show(viewerId, 'left', Number(payload.new.seconds) || 0);
        })
        .subscribe();
    } catch { /* Realtime indisponible : la liste « Voir qui » reste disponible dans la story */ }
    return () => {
      live = false;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      try { if (channel) void client.removeChannel(channel); } catch { /* déjà fermé */ }
    };
  }, [user?.id, isDemoMode, isLocalGuest, slide]);

  if (!message) return null;
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [Math.min(width, 420), 0] });
  return (
    <Animated.View pointerEvents="none" testID="story-visitor-toast" accessibilityLiveRegion="polite" style={[s.pill, { opacity: slide, transform: [{ translateX }] }]}>
      <Text style={s.text} numberOfLines={1}>{message}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  pill: { position: 'absolute', top: 96, right: 0, maxWidth: '88%', minHeight: 36, paddingHorizontal: 14, paddingVertical: 8, borderTopLeftRadius: 18, borderBottomLeftRadius: 18, backgroundColor: '#1B1230', borderWidth: 1.5, borderRightWidth: 0, borderColor: '#B79CFF', justifyContent: 'center', zIndex: 60, elevation: 60 },
  text: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '800' },
});
