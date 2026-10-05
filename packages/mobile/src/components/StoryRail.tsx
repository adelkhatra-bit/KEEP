import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import MusicSwipeDeckModal from './MusicSwipeDeckModal';
import { keepLokiPulseTrack } from '../services/lokiPulseKeep';
import {
  buildOwnStory,
  loadMusicStories,
  loadSeenStories,
  markStorySeen,
  MusicStory,
} from '../services/musicStoriesService';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { colors } from '../theme/colors';

/**
 * Rangée de stories de l'accueil (Adel, 05/10/2026 — inspirée d'Instagram).
 *
 * 1. Ta photo + ta story (toutes tes musiques identifiées des dernières 72 h,
 *    y compris privées/masquées : visibles de toi seul).
 * 2. Les stories des profils que tu suis et des passionnés de ton style.
 * Le contour s'allume tant qu'il y a une nouveauté non vue, puis devient gris.
 * Les nouveaux morceaux publics passent ici au lieu d'encombrer la cloche.
 */
type Props = {
  viewer: { id: string; username: string; avatarUrl?: string | null };
  freeCost: number;
};

const BUBBLE = 64;

function Avatar({ uri, name, size }: { uri?: string | null; name: string; size: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarInitial}>{(name || '?').slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export default function StoryRail({ viewer, freeCost }: Props) {
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const [stories, setStories] = useState<MusicStory[]>([]);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [openStory, setOpenStory] = useState<MusicStory | null>(null);

  const ownStory = useMemo(() => buildOwnStory(viewer, sessions), [viewer.id, viewer.username, viewer.avatarUrl, sessions]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [list, seenMap] = await Promise.all([loadMusicStories(viewer.id), loadSeenStories(viewer.id)]);
        if (!live) return;
        setStories(list);
        setSeen(seenMap);
      } catch {
        // Une indisponibilité réseau ne doit jamais vider ni casser la rangée :
        // ta propre story (locale) reste affichée.
        const seenMap = await loadSeenStories(viewer.id);
        if (live) setSeen(seenMap);
      }
    })();
    return () => { live = false; };
  }, [viewer.id]);

  const isLit = useCallback((story: MusicStory) => seen[story.profileId] !== story.latestAt, [seen]);

  const open = useCallback(async (story: MusicStory) => {
    setOpenStory(story);
    setSeen(await markStorySeen(viewer.id, story));
  }, [viewer.id]);

  const openOwn = () => {
    if (ownStory) { void open(ownStory); return; }
    Alert.alert('Ta story', 'Identifie un morceau avec Écouter : il apparaît ici pendant 72 heures, visible de toi seul tant que tu ne le gardes pas en public.', [{ text: 'OK', style: 'cancel' }]);
  };

  const isOwnOpen = openStory?.profileId === viewer.id;

  return (
    <View style={styles.wrap} testID="story-rail">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <TouchableOpacity
          style={styles.item}
          onPress={openOwn}
          accessibilityRole="button"
          accessibilityLabel={ownStory ? 'Ouvrir ta story' : 'Ta story : aucune musique pour le moment'}
          testID="story-bubble-own"
        >
          <View style={[styles.ring, ownStory && isLit(ownStory) ? styles.ringLit : styles.ringSeen]}>
            <Avatar uri={viewer.avatarUrl} name={viewer.username} size={BUBBLE - 10} />
          </View>
          <Text style={styles.label} numberOfLines={1}>Ta story</Text>
        </TouchableOpacity>
        {stories.map((story) => (
          <TouchableOpacity
            key={story.profileId}
            style={styles.item}
            onPress={() => { void open(story); }}
            accessibilityRole="button"
            accessibilityLabel={`Story de ${story.username}${isLit(story) ? ', nouveauté' : ''}`}
            testID={`story-bubble-${story.profileId}`}
          >
            <View style={[styles.ring, isLit(story) ? styles.ringLit : styles.ringSeen]}>
              <Avatar uri={story.avatarUrl} name={story.username} size={BUBBLE - 10} />
            </View>
            <Text style={styles.label} numberOfLines={1}>{story.username}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <MusicSwipeDeckModal
        visible={Boolean(openStory)}
        tracks={openStory?.tracks ?? []}
        title={isOwnOpen ? 'Ta story' : `Story de @${openStory?.username ?? ''}`}
        subtitle={isOwnOpen ? 'Tes musiques identifiées · visibles de toi seul' : `GARDER coûte actuellement ${freeCost} FREE`}
        sourceUsername={isOwnOpen ? undefined : openStory?.username}
        sourceAvatarUrl={isOwnOpen ? undefined : openStory?.avatarUrl}
        sourceProfileId={isOwnOpen ? undefined : openStory?.profileId}
        emptyTitle="Cette story est vide pour le moment."
        backLabel="REVENIR À L'ACCUEIL"
        loop={false}
        previewOnly={isOwnOpen}
        askVisibilityOnKeep
        keepCostNotice={`GARDER ce morceau débitera ${freeCost} FREE après ton choix Public ou Privé. PASSER reste gratuit.`}
        keepDebitAmount={freeCost}
        onKeep={async (track, visibility) => {
          const { ok } = await keepLokiPulseTrack(track, visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE', freeCost);
          return ok;
        }}
        onPass={() => true}
        onClose={() => setOpenStory(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 96, justifyContent: 'center' },
  row: { paddingHorizontal: 14, gap: 14, alignItems: 'center' },
  item: { width: BUBBLE + 8, alignItems: 'center', minHeight: 48 },
  ring: { width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringLit: { borderColor: colors.keep, shadowColor: colors.keep, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  ringSeen: { borderColor: colors.border },
  label: { color: colors.textPrimary, fontSize: 12, fontWeight: '800', marginTop: 5, maxWidth: BUBBLE + 8 },
  avatarFallback: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
});
