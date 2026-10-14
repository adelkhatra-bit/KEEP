import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import KeepModal from './KeepModal';
import StoryEmbeddedSourcePlayer from './StoryEmbeddedSourcePlayer';

/**
 * Lecture « dans Loki Music » d'un titre qui n'a ni extrait catalogue ni lecteur natif : on affiche le lecteur officiel
 * du fournisseur (YouTube / Spotify / Deezer) dans une fenêtre de l'app au lieu d'envoyer l'utilisateur hors de Loki.
 * Réutilise StoryEmbeddedSourcePlayer (même lecteur que les Stories, mêmes règles de sécurité : seuls les identifiants
 * reconnus par resolveEmbeddedMusicPlayer sont chargés). « Ouvrir sur la plateforme » reste un choix explicite.
 */
export default function EmbeddedSourceModal({ visible, sourceUrl, title, onClose }: { visible: boolean; sourceUrl: string; title?: string; onClose: () => void }) {
  return (
    <KeepModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay} testID="embedded-source-modal">
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>{title || 'Lecture dans Loki Music'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fermer le lecteur" testID="embedded-source-close"><Text style={styles.close}>✕</Text></TouchableOpacity>
          </View>
          {visible ? <StoryEmbeddedSourcePlayer sourceUrl={sourceUrl} /> : null}
          <TouchableOpacity
            style={styles.external}
            onPress={() => { void Linking.openURL(sourceUrl).catch(() => {}); }}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir la vidéo originale sur sa plateforme"
          >
            <Text style={styles.externalText}>↗ Ouvrir sur la plateforme</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeepModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 420, borderRadius: 18, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369', padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
  title: { color: '#F8F6FC', fontSize: 13, fontWeight: '800', flex: 1 },
  close: { color: '#8F879D', fontSize: 18, fontWeight: '900', paddingHorizontal: 6 },
  external: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#493369', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  externalText: { color: '#C9B8FF', fontSize: 12, fontWeight: '800' },
});
