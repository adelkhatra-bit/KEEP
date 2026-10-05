import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { orderStoriesForBar, type MusicStory } from '../services/musicStoriesService';

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
  /** Nombre de suggestions d'amis (reprises de mes musiques, pas encore suivis) : rond « Suggestions » en fin de rangée. */
  suggestionCount?: number;
  onOpenSuggestions?: () => void;
  /** Diamètre des bulles (la même taille que la photo de profil). */
  size?: number;
  /** Présence par profil : true = vert, false = rouge, absent = inconnue (aucune pastille, jamais un faux « hors ligne »). */
  online?: Record<string, boolean | undefined>;
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

export default function MusicStoryRail({ stories, seen, onOpen, own, onOpenOwn, size = RING, online, suggestionCount = 0, onOpenSuggestions }: Props) {
  const ITEM = size + 2;
  if (!stories.length && !own && !suggestionCount) return null;
  // Adel (05/10/2026) : « je swipe sur le côté et je vois tout ». Une seule rangée qui défile en longueur :
  // stories à lire d'abord (nouveautés devant), puis les amis sans story du jour (bulle grise), puis le rond « Suggestions ».
  const withStory = stories.filter((story) => story.tracks.length > 0);
  const friendsOnly = stories.filter((story) => story.tracks.length === 0);
  const ordered = [...orderStoriesForBar(withStory, seen), ...friendsOnly];
  const isUnseen = (story: MusicStory) => story.tracks.length > 0 && (seen[story.profileId] || '') < story.latestAt;

  return (
    <View style={s.wrap} testID="home-music-story-rail" accessibilityLabel="Stories musicales">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} keyboardShouldPersistTaps="handled" testID="story-rail-scroll">
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
            <Text style={s.name} numberOfLines={1}>Ta story</Text>
          </TouchableOpacity>
        ) : null}
        {ordered.map((story) => {
          const hasStory = story.tracks.length > 0;
          const unseen = isUnseen(story);
          return (
            <TouchableOpacity
              key={story.profileId}
              style={[s.item, { width: ITEM }]}
              onPress={() => onOpen(story)}
              accessibilityRole="button"
              accessibilityLabel={hasStory ? `Story musicale de ${story.username}${unseen ? ', nouveauté' : ', déjà vue'}` : `Profil de ${story.username}, pas de story pour le moment`}
              testID={`home-story-${story.profileId}`}
            >
              {hasStory
                ? <StoryRing size={size} unseen={unseen}><Avatar ring={size} uri={story.avatarUrl} name={story.username} /></StoryRing>
                : <View style={[s.friendRing, { width: size, height: size, borderRadius: size / 2 }]}><Avatar ring={size} uri={story.avatarUrl} name={story.username} /></View>}
              {online && online[story.profileId] !== undefined ? <View style={[s.presenceDot, { backgroundColor: online[story.profileId] ? ONLINE_GREEN : OFFLINE_RED, left: size - DOT - 2, top: size - DOT - 2 }]} testID={`story-presence-${story.profileId}`} accessibilityLabel={online[story.profileId] ? 'En ligne' : 'Hors ligne'} /> : null}
              {hasStory && !unseen ? <View style={[s.seenBadge, { top: 2, right: 2 }]}><Text style={s.seenBadgeText}>✓</Text></View> : null}
              <Text style={[s.name, hasStory && !unseen && s.nameSeen]} numberOfLines={1}>{story.username}</Text>
            </TouchableOpacity>
          );
        })}
        {suggestionCount > 0 ? (
          <TouchableOpacity
            style={[s.item, { width: ITEM }]}
            onPress={onOpenSuggestions}
            accessibilityRole="button"
            accessibilityLabel={`Suggestions d’amis : ${suggestionCount} membre${suggestionCount > 1 ? 's' : ''} ont repris tes musiques`}
            testID="home-story-suggestions"
          >
            <View style={[s.suggestRing, { width: size, height: size, borderRadius: size / 2 }]}><Text style={s.suggestIcon}>👥</Text></View>
            <View style={[s.seenBadge, s.suggestBadge, { top: 2, right: 2, width: 22, height: 22, borderRadius: 11 }]}><Text style={s.seenBadgeText}>{suggestionCount > 9 ? '9+' : suggestionCount}</Text></View>
            <Text style={[s.name, s.suggestCaption]} numberOfLines={1}>Suggestions</Text>
          </TouchableOpacity>
        ) : null}
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
  seenBadgeText: { color: '#04130F', fontSize: 11, fontWeight: '900', lineHeight: 13 },
  suggestRing: { borderWidth: 3, borderStyle: 'dashed', borderColor: '#B79CFF', backgroundColor: 'rgba(124,92,252,.22)', alignItems: 'center', justifyContent: 'center' },
  suggestCaption: { color: '#B79CFF', fontSize: 11, fontWeight: '900', marginTop: -1 },
  suggestBadge: { backgroundColor: colors.primaryLight },
  moreCircle: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard },
  moreText: { color: colors.white, fontSize: 14, fontWeight: '900' },
});
