import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  onOpenMore?: (hidden: MusicStory[]) => void;
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

export default function MusicStoryRail({ stories, seen, onOpen, own, onOpenOwn, onOpenMore, size = RING, online }: Props) {
  const ITEM = size + 2;
  const [width, setWidth] = useState(0);
  if (!stories.length && !own) return null;
  // Les suggestions (ils ont repris tes musiques) viennent toujours APRÈS les vraies stories.
  const ordered = [...orderStoriesForBar(stories.filter((story) => !story.suggestion), seen), ...stories.filter((story) => story.suggestion)];
  const ownSlots = own ? 1 : 0;
  // Tout est visible d'un coup : on affiche ce qui tient, jamais de défilement.
  const capacity = width > 0 ? Math.max(1, Math.floor((width + GAP) / (ITEM + GAP))) : ownSlots + ordered.length;
  const overflow = ordered.length + ownSlots > capacity;
  const suggestions = ordered.filter((story) => story.suggestion);
  const realOrdered = ordered.filter((story) => !story.suggestion);
  // Adel (05/10/2026) : « je ne vois pas les suggestions » -- quand tout ne tient pas, UNE suggestion (reprise de tes musiques) reste toujours visible à côté des stories.
  const reserveSuggestion = overflow && suggestions.length > 0 && capacity - ownSlots >= 3;
  const visibleReal = overflow ? Math.max(0, capacity - ownSlots - 1 - (reserveSuggestion ? 1 : 0)) : realOrdered.length;
  const visible = overflow ? [...realOrdered.slice(0, visibleReal), ...(reserveSuggestion ? suggestions.slice(0, 1) : [])] : ordered;
  const hidden = overflow ? [...realOrdered.slice(visibleReal), ...suggestions.slice(reserveSuggestion ? 1 : 0)] : [];
  const isUnseen = (story: MusicStory) => (seen[story.profileId] || '') < story.latestAt;

  return (
    <View
      style={s.wrap}
      testID="home-music-story-rail"
      accessibilityLabel="Stories musicales"
      onLayout={(event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <View style={s.row}>
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
        {visible.map((story) => {
          const suggestion = Boolean(story.suggestion);
          const unseen = !suggestion && isUnseen(story);
          return (
            <TouchableOpacity
              key={story.profileId}
              style={[s.item, { width: ITEM }]}
              onPress={() => onOpen(story)}
              accessibilityRole="button"
              accessibilityLabel={suggestion ? `Suggestion : ${story.username} a repris une de tes musiques` : `Story musicale de ${story.username}${unseen ? ', nouveauté' : ', déjà vue'}`}
              testID={`home-story-${story.profileId}`}
            >
              {suggestion
                ? <View style={[s.suggestRing, { width: size, height: size, borderRadius: size / 2 }]}><Avatar ring={size} uri={story.avatarUrl} name={story.username} /></View>
                : <StoryRing size={size} unseen={unseen}>
                    <Avatar ring={size} uri={story.avatarUrl} name={story.username} />
                  </StoryRing>}
              {online && online[story.profileId] !== undefined ? <View style={[s.presenceDot, { backgroundColor: online[story.profileId] ? ONLINE_GREEN : OFFLINE_RED, left: size - DOT - 2, top: size - DOT - 2 }]} testID={`story-presence-${story.profileId}`} accessibilityLabel={online[story.profileId] ? 'En ligne' : 'Hors ligne'} /> : null}
              {suggestion ? <View style={[s.seenBadge, s.suggestBadge, { top: 2, right: 2 }]}><Text style={s.seenBadgeText}>↻</Text></View> : !unseen ? <View style={[s.seenBadge, { top: 2, right: 2 }]}><Text style={s.seenBadgeText}>✓</Text></View> : null}
              <Text style={[s.name, !unseen && s.nameSeen]} numberOfLines={1}>{story.username}</Text>
            </TouchableOpacity>
          );
        })}
        {overflow ? (
          <TouchableOpacity
            style={[s.item, { width: ITEM }]}
            onPress={() => onOpenMore?.(hidden)}
            accessibilityRole="button"
            accessibilityLabel={`Voir ${hidden.length} autres stories`}
            testID="home-story-more"
          >
            <View style={[s.moreCircle, { width: size, height: size, borderRadius: size / 2 }]}><Text style={s.moreText}>+{hidden.length}</Text></View>
            <Text style={s.name} numberOfLines={1}>Autres</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP, flexWrap: 'nowrap', overflow: 'hidden' },
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
  suggestRing: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  suggestBadge: { backgroundColor: colors.primaryLight },
  moreCircle: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard },
  moreText: { color: colors.white, fontSize: 14, fontWeight: '900' },
});
