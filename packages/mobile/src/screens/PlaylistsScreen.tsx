import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { usePlaylistStore } from '../store/usePlaylistStore';

export default function PlaylistsScreen() {
  const { playlists } = usePlaylistStore();

  const renderPlaylist = ({ item }: any) => (
    <TouchableOpacity style={styles.playlistCard}>
      <Image source={{ uri: item.cover }} style={styles.playlistCover} />
      <View style={styles.playlistInfo}>
        <Text style={styles.playlistName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.playlistDesc} numberOfLines={1}>
          {item.description}
        </Text>
        <Text style={styles.songCount}>{item.songCount} songs</Text>
        {item.isSmartPlaylist && (
          <View style={styles.smartBadge}>
            <Text style={styles.smartText}>🤖 Smart</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Playlists</Text>
      </View>

      <FlatList
        data={playlists}
        renderItem={renderPlaylist}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        scrollEnabled={true}
      />

      <View style={styles.demoBadge}>
        <Text style={styles.demoText}>🎭 DEMO - Sample Playlists</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  list: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  playlistCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginVertical: 8,
    overflow: 'hidden',
  },
  playlistCover: {
    width: 100,
    height: 100,
    backgroundColor: '#333',
  },
  playlistInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  playlistName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  playlistDesc: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  songCount: {
    fontSize: 12,
    color: '#1DB954',
    marginTop: 4,
    fontWeight: '600',
  },
  smartBadge: {
    backgroundColor: '#1DB954',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  smartText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 10,
  },
  demoBadge: {
    backgroundColor: 'rgba(255, 193, 7, 0.2)',
    borderTopWidth: 1,
    borderTopColor: '#FFC107',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  demoText: {
    color: '#FFC107',
    fontSize: 12,
    fontWeight: '500',
  },
});
