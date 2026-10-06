import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutAnimation, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { isDormantMember, orderStoriesForBar, type MusicStory } from '../services/musicStoriesService';
import { rankBadgeFor } from '../services/storyActivity';

/**
 * Bulles de stories à côté de la photo du profil (Adel, 05/10/2026, inspiré
 * d'Instagram). Règles : AUCUN défilement ni swipe — tout ce qui tient est
 * affiché d'un coup, le reste passe derrière « +N ». Cercle coloré animé tant
 * qu'il y a une nouveauté ; une story VUE se grise, reçoit un ✓ et passe après
 * les nouveautés. Texte blanc, 11 px minimum, même code iPhone et ordinateur.
 */
type OwnBubble = { story: MusicStory | null; username: string; avatarUrl?: string | null };
type Props = {
  stories: MusicStory[];
  seen: Record<string, string>;
  onOpen: (story: MusicStory) => void;
  /** Ta photo + ta story (musiques partagées en public + en vente). */
  own?: OwnBubble;
  onOpenOwn?: () => void;
  /** Ouvre la liste complète quand toutes les bulles ne tiennent pas. */
  /** Diamètre des bulles (la même taille que la photo de profil). */
  size?: number;
  /** Présence par profil : true = vert, false = rouge, absent = inconnue (aucune pastille, jamais un faux « hors ligne »). */
  online?: Record<string, boolean | undefined>;
  /** Premier élément de la rangée, qui défile avec elle (ta photo avec le « + »). */
  leading?: React.ReactNode;
  /** Suivre directement un membre non suivi (bouton « +👤 » sur sa bulle, comme Instagram). */
  onFollow?: (story: MusicStory) => void | Promise<void>;
  followBusyId?: string | null;
  /** Vrai quand l'activité des membres est connue : sans elle, on ne range personne parmi les « endormis ». */
  activityKnown?: boolean;
  /** Classement de la semaine par profil : médaille / étoile discrète en haut à gauche de la bulle. */
  ranking?: Record<string, { rank: number; score: number } | undefined>;
};

const RING = 60;
const THICK = 5; // contour bien visible : on voit tout de suite qu'une story attend
const VIVID = ['#FF3D9A', '#FFB020', '#2DE1C2', '#7C5CFC'];
const PINK = ['#FF3D9A', '#FF8AC9', '#FF3D9A', '#FFC2E3'];
const BLUE = ['#2D8CFF', '#6FD3FF', '#2D8CFF', '#A9C8FF'];
const GAP = 4;
const DOT = 16;
const ONLINE_GREEN = '#2DE17A';
const OFFLINE_RED = '#FF4D5E';

export function StoryRing({ unseen, children, size = RING, plain = false, tone }: { unseen: boolean; children: React.ReactNode; size?: number; plain?: boolean; tone?: 'PINK' | 'BLUE' }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!unseen) return undefined;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin, unseen]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const box = { width: size, height: size, borderRadius: size / 2 };
  // plain : pas de story, la photo reste telle quelle (aucun anneau).
  if (plain) return <View style={box}>{children}</View>;
  const gap = { width: size - THICK * 2, height: size - THICK * 2, borderRadius: (size - THICK * 2) / 2 };
  return (
    <View style={[s.glowBox, unseen && s.glowOn, tone === 'BLUE' && { shadowColor: '#2D8CFF' }, box]}><View style={[s.ringBox, box]}>
      {unseen ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          <LinearGradient colors={(tone === 'PINK' ? PINK : tone === 'BLUE' ? BLUE : VIVID) as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.ringGradient, { borderRadius: size / 2 }]} />
        </Animated.View>
      ) : <View style={[s.ringSeen, { borderRadius: size / 2 }]} />}
      <View style={[s.ringGap, gap]}>{children}</View>
    </View></View>
  );
}

function Avatar({ uri, name, ring = RING }: { uri?: string | null; name: string; ring?: number }) {
  const size = ring - THICK * 2 - 6;
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={box} />;
  return <View style={[box, s.avatarFallback]}><Text style={s.avatarInitial}>{(name || '?').slice(0, 1).toUpperCase()}</Text></View>;
}

export default function MusicStoryRail({ stories, seen, onOpen, own, onOpenOwn, size = RING, online, leading, onFollow, followBusyId, activityKnown = false, ranking }: Props) {
  const ITEM = size + 2;
  // Adel (05/10/2026) — EXACTEMENT comme Instagram : une seule rangée, toute d'une pièce (photo + « + » comprise), qui défile sur le côté.
  //  1. stories non vues, la plus récente d'abord (mes abonnements, puis les membres liés) ;
  //  2. mes abonnements sans story du jour (le dernier connecté d'abord) ;
  //  3. suggestions d'amis (liens par reprise/abonnement, puis style musical) avec le bouton « suivre » intégré ;
  //  4. les stories DÉJÀ VUES tout au bout : dès qu'une story est vue, sa bulle disparaît d'ici et part au fond de la ligne.
  const scrollRef = useRef<ScrollView | null>(null);
  const hasStory = (story: MusicStory) => story.tracks.length > 0;
  const isUnseen = (story: MusicStory) => hasStory(story) && (seen[story.profileId] || '') < story.latestAt;
  const byLastSeen = (a: MusicStory, b: MusicStory) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '');
  const unseenFollowed = orderStoriesForBar(stories.filter((story) => story.followed && isUnseen(story)), seen);
  const unseenOthers = orderStoriesForBar(stories.filter((story) => !story.followed && isUnseen(story)), seen);
  // Membres inactifs (aucune connexion/activité depuis > 7 jours) : leur bulle SANS story disparaît automatiquement (elle revient dès qu'ils se reconnectent).
  const dormant = (story: MusicStory) => activityKnown && story.lastSeenAt !== undefined && isDormantMember(story.lastSeenAt || null);
  const friendsNoStoryAll = stories.filter((story) => story.followed && !hasStory(story)).sort(byLastSeen);
  const friendsNoStory = friendsNoStoryAll.filter((story) => !dormant(story));
  const linkedAll = stories.filter((story) => !story.followed && !hasStory(story) && !story.styleMatch).sort(byLastSeen);
  const linkedSuggestions = linkedAll.filter((story) => !dormant(story));
  const styleSuggestions = stories.filter((story) => !story.followed && !hasStory(story) && story.styleMatch && !dormant(story));
  const seenStories = orderStoriesForBar(stories.filter((story) => hasStory(story) && !isUnseen(story)), seen);
  // Adel (05/10/2026) : « on met toujours les plus récents en visibilité » -- toute bulle AVEC story du jour (vue ou non) passe avant les membres sans story ni les suggestions.
  const row = [...unseenFollowed, ...unseenOthers, ...seenStories, ...friendsNoStory, ...linkedSuggestions, ...styleSuggestions];
  const empty = !row.length && !own && !leading;

  // Les bulles glissent (comme Instagram) quand l'ordre change : la story qu'on vient de voir part au bout, la suivante avance.
  const orderKey = row.map((story) => `${story.profileId}:${isUnseen(story) ? 1 : 0}:${story.followed ? 1 : 0}`).join('|');
  const lastOrderKey = useRef(orderKey);
  useEffect(() => {
    if (lastOrderKey.current !== orderKey) {
      lastOrderKey.current = orderKey;
      try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch { /* animation indisponible : l'ordre change quand même */ }
    }
  }, [orderKey]);

  const renderRank = (profileId: string) => {
    const badge = rankBadgeFor(ranking?.[profileId]?.rank, ranking?.[profileId]?.score);
    return badge ? <View style={s.rankBadge} testID={`story-rank-${profileId}`} accessibilityLabel={badge.label}><Text style={s.rankBadgeText}>{badge.icon}</Text></View> : null;
  };
  const renderStory = (story: MusicStory) => {
    const withStory = hasStory(story);
    const unseen = isUnseen(story);
    const dashed = !story.followed && !withStory;
    const canFollow = !story.followed && Boolean(onFollow);
    return (
      <View key={story.profileId} style={[s.item, { width: ITEM }]}>
        <TouchableOpacity
          onPress={() => onOpen(story)}
          accessibilityRole="button"
          accessibilityLabel={withStory ? `Story musicale de ${story.username}${unseen ? ', nouveauté' : ', déjà vue'}` : story.styleMatch ? `Suggestion d’ami : ${story.username} aime les mêmes styles que toi` : story.followed ? `Profil de ${story.username}, pas de story pour le moment` : `Voir le profil de ${story.username}`}
          testID={`home-story-${story.profileId}`}
          style={{ alignItems: 'center', opacity: !withStory && story.followed ? 0.55 : 1 }}
        >
          {withStory
            ? <StoryRing size={size} unseen={unseen}><Avatar ring={size} uri={story.avatarUrl} name={story.username} /></StoryRing>
            : <View style={[dashed ? s.suggestRing : s.friendRing, { width: size, height: size, borderRadius: size / 2 }]}><Avatar ring={size} uri={story.avatarUrl} name={story.username} /></View>}
          {online && online[story.profileId] !== undefined && !canFollow ? <View style={[s.presenceDot, { backgroundColor: online[story.profileId] ? ONLINE_GREEN : OFFLINE_RED, left: size - DOT - 2, top: size - DOT - 2 }]} testID={`story-presence-${story.profileId}`} accessibilityLabel={online[story.profileId] ? 'En ligne' : 'Hors ligne'} /> : null}
          {renderRank(story.profileId)}
          {withStory && !unseen ? <View style={[s.seenBadge, { top: 2, right: 2 }]}><Text style={s.seenBadgeText}>✓</Text></View> : null}
          <Text style={[s.name, withStory && !unseen && s.nameSeen, canFollow && { marginTop: 14 }]} numberOfLines={1}>{story.username}</Text>
        </TouchableOpacity>
        {canFollow ? (
          <TouchableOpacity
            style={[s.followPill, { left: ITEM / 2 - 22, top: size - 20 }]}
            onPress={() => { void onFollow?.(story); }}
            disabled={followBusyId === story.profileId}
            accessibilityRole="button"
            accessibilityLabel={`Suivre ${story.username}`}
            testID={`story-follow-${story.profileId}`}
          >
            <Text style={s.followPillText}>{followBusyId === story.profileId ? '…' : '+👤'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  if (empty) return null;

  return (
    <View style={s.wrap} testID="home-music-story-rail" accessibilityLabel="Stories musicales">
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
        keyboardShouldPersistTaps="handled"
        testID="story-rail-scroll"
      >
        {leading ?? null}
        {own ? (
          <TouchableOpacity
            style={[s.item, { width: ITEM }]}
            onPress={onOpenOwn}
            accessibilityRole="button"
            accessibilityLabel={own.story ? 'Ouvrir ta story' : 'Ta story : aucune musique pour le moment'}
            testID="home-story-own"
          >
            <StoryRing size={size} unseen={Boolean(own.story && isUnseen(own.story))}>
              <Avatar ring={size} uri={own.avatarUrl} name={own.username} />
            </StoryRing>
            <View style={[s.presenceDot, { backgroundColor: ONLINE_GREEN, left: size - DOT - 2, top: size - DOT - 2 }]} testID="story-presence-own" />
            {own.story ? renderRank(own.story.profileId) : null}
            <Text style={s.name} numberOfLines={1}>Ta story</Text>
          </TouchableOpacity>
        ) : null}
        {row.map(renderStory)}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP, paddingRight: 8 },
  friendRing: { borderWidth: 2, borderColor: '#5B5870', alignItems: 'center', justifyContent: 'center' },
  suggestIcon: { fontSize: 26 },
  item: { alignItems: 'center', minHeight: 48 },
  presenceDot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, borderColor: '#0B0A12' },
  glowBox: { borderRadius: 999 },
  glowOn: { shadowColor: '#FF3D9A', shadowOpacity: 0.85, shadowRadius: 9, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  ringBox: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ringGradient: { flex: 1 },
  ringSeen: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: '#5B5870' },
  ringGap: { backgroundColor: '#0B0A12', alignItems: 'center', justifyContent: 'center' },
  avatarFallback: { backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.white, fontSize: 18, fontWeight: '900' },
  name: { marginTop: 4, maxWidth: 84, color: colors.white, fontSize: 11, fontWeight: '800' },
  nameSeen: { opacity: 0.75 },
  seenBadge: { position: 'absolute', right: 2, top: RING - 16, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0B0A12' },
  rankBadge: { position: 'absolute', left: -2, top: -2, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#3A2A00', borderWidth: 2, borderColor: '#FFD166', alignItems: 'center', justifyContent: 'center', zIndex: 3, shadowColor: '#FFD166', shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  rankBadgeText: { fontSize: 13, lineHeight: 16 },
  seenBadgeText: { color: '#04130F', fontSize: 11, fontWeight: '900', lineHeight: 13 },
  suggestRing: { borderWidth: 3, borderStyle: 'dashed', borderColor: '#B79CFF', backgroundColor: 'rgba(124,92,252,.22)', alignItems: 'center', justifyContent: 'center' },
  suggestCaption: { color: '#B79CFF', fontSize: 11, fontWeight: '900', marginTop: -1 },
  followPill: { position: 'absolute', minWidth: 44, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  followPillText: { color: '#14101D', fontSize: 14, fontWeight: '900' },
  suggestBadge: { backgroundColor: colors.primaryLight },
  newBadge: { backgroundColor: '#FF3D9A' },
  newBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  moreCircle: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard },
  moreText: { color: colors.white, fontSize: 14, fontWeight: '900' },
});
