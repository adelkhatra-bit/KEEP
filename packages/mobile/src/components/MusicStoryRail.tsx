import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import type { MusicStory } from '../services/musicStoriesService';

/**
 * Rangée de stories musicales en haut de l'écran Écouter (Adel, 05/10/2026,
 * inspiration accueil Instagram). Un rond = un membre suivi ou un passionné du
 * même style ; la plus récente à gauche. Anneau violet → turquoise animé tant
 * que la story n'est pas vue, gris ensuite. Même code iPhone et ordinateur ;
 * aucun texte sous 11 px, texte blanc sur fond sombre.
 */
type Props = {
  stories: MusicStory[];
  seen: Record<string, string>;
  onOpen: (story: MusicStory) => void;
};

function StoryRing({ unseen, children }: { unseen: boolean; children: React.ReactNode }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!unseen) return undefined;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin, unseen]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={s.ringBox}>
      {unseen ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          <LinearGradient colors={[colors.primary, colors.success, colors.primaryLight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ringGradient} />
        </Animated.View>
      ) : <View style={s.ringSeen} />}
      <View style={s.ringGap}>{children}</View>
    </View>
  );
}

export default function MusicStoryRail({ stories, seen, onOpen }: Props) {
  if (!stories.length) return null;
  return (
    <View style={s.wrap} testID="home-music-story-rail" accessibilityLabel="Stories musicales">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
        {stories.map((story) => {
          const unseen = (seen[story.profileId] || '') < story.latestAt;
          const initial = story.username.slice(0, 1).toUpperCase();
          return (
            <TouchableOpacity
              key={story.profileId}
              style={s.item}
              onPress={() => onOpen(story)}
              accessibilityRole="button"
              accessibilityLabel={`Écouter la story musicale de ${story.username}`}
            >
              <StoryRing unseen={unseen}>
                {story.avatarUrl
                  ? <Image source={{ uri: story.avatarUrl }} style={s.avatar} />
                  : <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarInitial}>{initial}</Text></View>}
              </StoryRing>
              <Text style={s.name} numberOfLines={1}>{story.username}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const RING = 66;
const s = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 692, alignSelf: 'center', marginBottom: 6 },
  rail: { paddingHorizontal: 2, gap: 12 },
  item: { width: 72, alignItems: 'center' },
  ringBox: { width: RING, height: RING, borderRadius: RING / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ringGradient: { flex: 1, borderRadius: RING / 2 },
  ringSeen: { ...StyleSheet.absoluteFillObject, borderRadius: RING / 2, borderWidth: 2, borderColor: colors.textMutedGrey },
  ringGap: { width: RING - 6, height: RING - 6, borderRadius: (RING - 6) / 2, backgroundColor: '#0B0A12', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: RING - 12, height: RING - 12, borderRadius: (RING - 12) / 2 },
  avatarFallback: { backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.white, fontSize: 20, fontWeight: '900' },
  name: { marginTop: 5, maxWidth: 72, color: colors.white, fontSize: 11, fontWeight: '800' },
});
