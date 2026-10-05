import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import MusicStoryRail from './MusicStoryRail';
import MusicSwipeDeckModal from './MusicSwipeDeckModal';
import { keepLokiPulseTrack } from '../services/lokiPulseKeep';
import { stopTrackPreviewFast } from '../services/audioPreviewService';
import {
  loadOwnStory,
  enrichStoriesWithSales,
  isSaleStoryTrack,
  loadMusicStories,
  loadSeenStories,
  markStorySeen,
  orderStoriesForBar,
  type MusicStory,
} from '../services/musicStoriesService';
import { colors } from '../theme/colors';

/**
 * Bulles de stories du PROFIL, à côté de la photo (Adel, 05/10/2026).
 * Contenu : ta story (tes musiques partagées en public + celles en vente) + celles des profils suivis / du même style, avec leurs
 * musiques EN VENTE (titre masqué, mène à la boutique). Les stories vues se
 * grisent et passent après. Lecteur = le Swipe existant ; GARDER = même
 * économie FREE que Loki Pulse.
 */
type Props = {
  viewer: { id: string; username: string; avatarUrl?: string | null };
  freeCost: number;
  onOpenProfile?: (username: string) => void;
};

export default function ProfileStoryBar({ viewer, freeCost, onOpenProfile }: Props) {
  const [ownStory, setOwnStory] = useState<MusicStory | null>(null);
  const [stories, setStories] = useState<MusicStory[]>([]);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [openStory, setOpenStory] = useState<MusicStory | null>(null);
  const [moreOpen, setMoreOpen] = useState<MusicStory[] | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const seenMap = await loadSeenStories(viewer.id);
      if (live) setSeen(seenMap);
      try {
        const mine = await loadOwnStory(viewer);
        if (live) setOwnStory(mine);
        const base = await loadMusicStories(viewer.id);
        if (live) setStories(base);
        // Les musiques en vente arrivent ensuite : la rangée s'affiche sans les attendre.
        const withSales = await enrichStoriesWithSales(base);
        if (live) setStories(withSales);
      } catch {
        // Réseau indisponible : la rangée garde ta story locale, jamais d'écran cassé.
      }
    })();
    return () => { live = false; };
  }, [viewer.id]);

  const open = useCallback(async (story: MusicStory) => {
    stopTrackPreviewFast();
    setMoreOpen(null);
    setOpenStory(story);
    setSeen(await markStorySeen(viewer.id, story));
  }, [viewer.id]);

  const openOwn = () => {
    if (ownStory) { void open(ownStory); return; }
    Alert.alert('Ta story', 'Partage une musique sur ton profil (GARDER en Public) ou mets-en une en vente : elle apparaît ici pendant 72 heures.', [{ text: 'OK', style: 'cancel' }]);
  };

  const isOwnOpen = openStory?.profileId === viewer.id;

  return (
    <View testID="profile-story-bar">
      <MusicStoryRail
        stories={stories}
        seen={seen}
        own={{ story: ownStory, username: viewer.username, avatarUrl: viewer.avatarUrl }}
        onOpenOwn={openOwn}
        onOpen={(story) => { void open(story); }}
        onOpenMore={(hidden) => setMoreOpen(hidden)}
      />

      <Modal visible={Boolean(moreOpen)} transparent animationType="fade" onRequestClose={() => setMoreOpen(null)}>
        <SafeAreaView style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Toutes les stories</Text>
              <TouchableOpacity onPress={() => setMoreOpen(null)} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.sheetClose}>
                <Text style={styles.sheetCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {orderStoriesForBar(moreOpen ?? [], seen).map((story) => {
                const unseen = (seen[story.profileId] || '') < story.latestAt;
                return (
                  <TouchableOpacity key={story.profileId} style={styles.row} onPress={() => { void open(story); }} accessibilityRole="button" accessibilityLabel={`Story de ${story.username}`}>
                    {story.avatarUrl
                      ? <Image source={{ uri: story.avatarUrl }} style={styles.rowAvatar} />
                      : <View style={[styles.rowAvatar, styles.rowAvatarFallback]}><Text style={styles.rowInitial}>{story.username.slice(0, 1).toUpperCase()}</Text></View>}
                    <Text style={styles.rowName} numberOfLines={1}>@{story.username}</Text>
                    <Text style={[styles.rowState, unseen ? styles.rowStateNew : styles.rowStateSeen]}>{unseen ? 'Nouveau' : '✓ Vue'}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      <MusicSwipeDeckModal
        visible={Boolean(openStory)}
        tracks={openStory?.tracks ?? []}
        initialTrackId={openStory?.tracks[0]?.id ?? null}
        title={isOwnOpen ? 'Ta story' : `Story de @${openStory?.username ?? ''}`}
        subtitle={isOwnOpen ? 'Tes musiques partagées ou en vente' : `${openStory?.followed ? 'Tu le suis' : 'Même style que toi'} · GARDER coûte ${freeCost} FREE`}
        previewOnly={isOwnOpen}
        sourceUsername={isOwnOpen ? undefined : openStory?.username}
        sourceAvatarUrl={isOwnOpen ? null : openStory?.avatarUrl ?? null}
        sourceProfileId={isOwnOpen ? undefined : openStory?.profileId}
        emptyTitle="Cette story est terminée."
        backLabel="REVENIR AU PROFIL"
        loop={false}
        askVisibilityOnKeep
        keepCostNotice={`GARDER ce morceau débitera ${freeCost} FREE après ton choix Public ou Privé. PASSER reste gratuit.`}
        keepDebitAmount={freeCost}
        optimisticPass
        onKeep={async (track, visibility) => {
          // Musique en vente : jamais de GARDER direct, on ouvre la boutique du vendeur.
          if (isSaleStoryTrack(track)) {
            const seller = openStory?.username;
            setOpenStory(null);
            if (seller) onOpenProfile?.(seller);
            return false;
          }
          const { ok } = await keepLokiPulseTrack(track, visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE', freeCost);
          return ok;
        }}
        onPass={() => true}
        onOpenSourceProfile={(username) => { setOpenStory(null); onOpenProfile?.(username); }}
        onClose={() => setOpenStory(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 18 },
  sheet: { maxHeight: '75%', borderRadius: 20, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, padding: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: colors.white, fontSize: 18, fontWeight: '900' },
  sheetClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { color: colors.white, fontSize: 20, fontWeight: '900' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.border },
  rowAvatar: { width: 40, height: 40, borderRadius: 20 },
  rowAvatarFallback: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  rowInitial: { color: colors.white, fontSize: 16, fontWeight: '900' },
  rowName: { flex: 1, color: colors.white, fontSize: 15, fontWeight: '800' },
  rowState: { fontSize: 13, fontWeight: '900' },
  rowStateNew: { color: '#2DE1C2' },
  rowStateSeen: { color: colors.textSecondary },
});
