import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CanonicalTrack } from '@keep/music';
import type { KeepNotification } from '../services/notificationService';
import {
  keepFromNewKeepNotification,
  loadNewKeepTrackState,
  newKeepNotificationOwner,
  revealedTrackLine,
} from '../services/newKeepNotification';
import { playAntiShazamPreviewSegment, playTrackPreviewFromGesture, stopTrackPreview } from '../services/audioPreviewService';
import { getCommercialRules } from '../services/growthAccessService';
import { Alert } from '../utils/keepAlert';
import { supabase } from '../services/supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';

/**
 * Actions de la notification « Nouveau morceau chez @x » : écouter un
 * extrait masqué (15 s) et GARDER sans quitter la notification. Le titre
 * n'apparaît qu'après l'ajout, ou tout de suite s'il est déjà dans la
 * collection. Utilisé par la bannière du haut ET l'écran Notifications
 * (une seule logique : services/newKeepNotification.ts).
 */
export default function NewKeepNotificationActions({
  notification,
  onInteract,
  onKept,
  onOpenProfile,
  isFollowing = false,
  onFollow,
}: {
  notification: KeepNotification;
  /** Appelé au premier geste (la bannière arrête alors de se refermer seule). */
  onInteract?: () => void;
  onKept?: () => void;
  /** Ouvre directement le profil qui a partagé le morceau. */
  onOpenProfile?: () => void;
  /** Jamais de désabonnement depuis une notification : true transforme le CTA en VOIR LE PROFIL. */
  isFollowing?: boolean;
  /** Abonnement unidirectionnel depuis la notification. */
  onFollow?: () => Promise<void> | void;
}) {
  const [track, setTrack] = useState<CanonicalTrack | null>(null);
  const [owned, setOwned] = useState(false);
  const [saleProtected, setSaleProtected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followedHere, setFollowedHere] = useState(false);
  const [kept, setKept] = useState(false);
  const [cost, setCost] = useState(3);
  const [isFollowingOwner, setIsFollowingOwner] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const currentUserId = useUserStore((state) => state.user?.id || '');
  const isDemoMode = useUserStore((state) => state.isDemoMode);
  const isLocalGuest = useUserStore((state) => state.isLocalGuest);
  const owner = newKeepNotificationOwner(notification);
  const previewKey = `new-keep-notif:${notification.id}`;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void loadNewKeepTrackState(notification).then((state) => {
      if (!mounted.current) return;
      setTrack(state.track);
      setOwned(state.owned);
      setSaleProtected(state.saleProtected);
      setLoading(false);
    });
    void getCommercialRules().then((rules) => { if (mounted.current) setCost(rules.freeCostPerKeep); }).catch(() => {});
    if (supabase && currentUserId && owner.profileId && currentUserId !== owner.profileId && !isDemoMode && !isLocalGuest) {
      void supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', currentUserId)
        .eq('followee_id', owner.profileId)
        .maybeSingle()
        .then(({ data }) => { if (mounted.current) setIsFollowingOwner(Boolean(data)); })
        .catch(() => {});
    } else {
      setIsFollowingOwner(false);
    }
    return () => {
      mounted.current = false;
      void stopTrackPreview(previewKey).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification.id, currentUserId, isDemoMode, isLocalGuest, owner.profileId]);

  const togglePreview = async () => {
    onInteract?.();
    if (!track?.previewUrl) return;
    if (playing) {
      await stopTrackPreview(previewKey).catch(() => {});
      setPlaying(false);
      return;
    }
    try {
      if (saleProtected) {
        await playAntiShazamPreviewSegment(
          previewKey,
          track.previewUrl,
          (isPlaying) => { if (mounted.current) setPlaying(isPlaying); },
          () => { if (mounted.current) setPlaying(false); },
        );
      } else {
        await playTrackPreviewFromGesture(
          previewKey,
          track.previewUrl,
          (isPlaying) => { if (mounted.current) setPlaying(isPlaying); },
          () => { if (mounted.current) setPlaying(false); },
          30000,
        );
      }
    } catch {
      setPlaying(false);
      Alert.alert('Écoute', 'Impossible de lire ce morceau pour le moment.');
    }
  };

  const keep = async (visibility: 'PUBLIC' | 'PRIVATE') => {
    if (!track || busy) return;
    setBusy(true);
    const result = await keepFromNewKeepNotification(notification, track, visibility, cost);
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) {
      Alert.alert('GARDER', result.error || 'Impossible d’ajouter ce morceau pour le moment.');
      return;
    }
    await stopTrackPreview(previewKey).catch(() => {});
    setPlaying(false);
    setKept(true);
    if (result.alreadyKept) setOwned(true);
    onKept?.();
  };

  const subscribeOrOpenProfile = async () => {
    onInteract?.();
    if (isFollowingOwner || !owner.profileId || owner.profileId === currentUserId) {
      onOpenProfile?.();
      return;
    }
    if (!currentUserId || isDemoMode || isLocalGuest || !supabase) {
      useAccountGateStore.getState().requestAccount('create', owner.username || undefined);
      return;
    }
    if (followBusy) return;
    setFollowBusy(true);
    try {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: owner.profileId });
      if (error) {
        if (String(error.message || '').includes('FOLLOW_LIMIT')) {
          Alert.alert('Limite atteinte', 'Ton offre actuelle limite le nombre de profils que tu peux suivre.');
        } else {
          Alert.alert('Abonnement', 'Impossible de suivre ce profil pour le moment.');
        }
        return;
      }
      if (mounted.current) setIsFollowingOwner(true);
    } finally {
      if (mounted.current) setFollowBusy(false);
    }
  };

  const profileActionLabel = followBusy
    ? 'ABONNEMENT…'
    : isFollowingOwner || owner.profileId === currentUserId
      ? 'VOIR LE PROFIL'
      : '+ S’ABONNER';

  const askKeep = () => {
    onInteract?.();
    Alert.alert(
      `GARDER · ${cost} FREE`,
      `Le morceau rejoint ta collection et son titre se dévoile. ${cost} FREE seront débités (rien si tu l’as déjà).`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Privé', onPress: () => { void keep('PRIVATE'); } },
        { text: 'Public', onPress: () => { void keep('PUBLIC'); } },
      ],
    );
  };

  const followingNow = isFollowing || followedHere;
  const profileOrFollowAction = onFollow && !followingNow ? (
    <TouchableOpacity
      testID="new-keep-follow"
      style={[s.profile, followBusy && s.disabled]}
      disabled={followBusy}
      onPress={() => {
        if (followBusy) return;
        onInteract?.();
        setFollowBusy(true);
        Promise.resolve(onFollow())
          .then(() => { if (mounted.current) setFollowedHere(true); })
          .catch(() => { if (mounted.current) Alert.alert('Abonnement', 'Impossible de s’abonner pour le moment.'); })
          .finally(() => { if (mounted.current) setFollowBusy(false); });
      }}
      accessibilityRole="button"
      accessibilityLabel="S’abonner à ce profil depuis la notification"
    >
      <Text style={s.profileText}>{followBusy ? 'ABONNEMENT…' : '＋ S’ABONNER'}</Text>
    </TouchableOpacity>
  ) : onOpenProfile ? (
    <TouchableOpacity
      testID="new-keep-profile"
      style={s.profile}
      onPress={() => { onInteract?.(); onOpenProfile(); }}
      accessibilityRole="button"
      accessibilityLabel="Voir le profil qui a partagé ce morceau"
    >
      <Text style={s.profileText}>VOIR LE PROFIL</Text>
    </TouchableOpacity>
  ) : null;

  if (loading) {
    return <View style={s.row}><ActivityIndicator size="small" color="#B79CFF" /></View>;
  }
  if (!track) {
    return <View><Text style={s.muted}>Morceau indisponible.</Text>{onOpenProfile ? <TouchableOpacity style={s.profile} disabled={followBusy} onPress={() => { void subscribeOrOpenProfile(); }}><Text style={s.profileText}>{profileActionLabel}</Text></TouchableOpacity> : null}</View>;
  }
  if (owned || kept) {
    return (
      <View>
        <View testID="new-keep-revealed" style={s.revealed}>
          <Text style={s.revealedLabel}>{kept && !owned ? '✓ AJOUTÉ À TA COLLECTION' : '✓ DÉJÀ DANS TA COLLECTION'}</Text>
          <Text style={s.revealedTitle} numberOfLines={2}>{revealedTrackLine(track)}</Text>
        </View>
        {onOpenProfile ? <TouchableOpacity style={s.profile} disabled={followBusy} onPress={() => { void subscribeOrOpenProfile(); }} accessibilityRole="button" accessibilityLabel={isFollowingOwner ? 'Voir le profil qui a partagé ce morceau' : 'S’abonner au profil qui a partagé ce morceau'}><Text style={s.profileText}>{profileActionLabel}</Text></TouchableOpacity> : null}
      </View>
    );
  }
  return (
    <View>
      <View style={s.row}>
      <TouchableOpacity
        testID="new-keep-listen"
        style={[s.listen, !track.previewUrl && s.disabled]}
        disabled={!track.previewUrl}
        onPress={() => { void togglePreview(); }}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Arrêter l’écoute' : saleProtected ? 'Écouter l’extrait protégé' : 'Écouter le morceau'}
      >
        <Text style={s.listenText}>{!track.previewUrl ? 'ÉCOUTE INDISPONIBLE' : playing ? '■ STOP' : saleProtected ? '▶ ÉCOUTER 15 s' : '▶ ÉCOUTER'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="new-keep-keep"
        style={[s.keep, busy && s.disabled]}
        disabled={busy}
        onPress={saleProtected ? () => { onInteract?.(); onOpenProfile?.(); } : askKeep}
        accessibilityRole="button"
        accessibilityLabel={saleProtected ? 'Ouvrir la Pépite protégée' : `Garder ce morceau pour ${cost} FREE`}
      >
        <Text style={s.keepText}>{saleProtected ? 'VOIR LA PÉPITE' : busy ? 'AJOUT…' : `GARDER · ${cost} FREE`}</Text>
      </TouchableOpacity>
      </View>
      {onOpenProfile ? <TouchableOpacity testID="new-keep-profile" style={s.profile} disabled={followBusy} onPress={() => { void subscribeOrOpenProfile(); }} accessibilityRole="button" accessibilityLabel={isFollowingOwner ? 'Voir le profil qui a partagé ce morceau' : 'S’abonner au profil qui a partagé ce morceau'}><Text style={s.profileText}>{profileActionLabel}</Text></TouchableOpacity> : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'column', gap: 8, marginTop: 8, alignItems: 'stretch', width: '100%' },
  listen: { width: '100%', minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: '#7C5CFC', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  listenText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  keep: { width: '100%', minHeight: 42, borderRadius: 14, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  keepText: { color: '#17130B', fontSize: 11, fontWeight: '900' },
  profile: { minHeight: 36, marginTop: 7, borderRadius: 14, borderWidth: 1, borderColor: '#B79CFF', backgroundColor: 'rgba(124,92,252,.10)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  profileText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: .4 },
  disabled: { opacity: 0.55 },
  muted: { color: '#FFFFFF', fontSize: 11, marginTop: 6, opacity: 0.8 },
  revealed: { marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#2DE1C2', backgroundColor: 'rgba(45,225,194,0.10)', paddingHorizontal: 10, paddingVertical: 7 },
  revealedLabel: { color: '#2DE1C2', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  revealedTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginTop: 2 },
});
