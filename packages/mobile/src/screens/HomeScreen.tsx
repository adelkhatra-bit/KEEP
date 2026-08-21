import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { usePlayerStore } from '../store/usePlayerStore';

export default function HomeScreen() {
  const { currentSong, isPlaying, playSong, pauseSong, skipSong, keepSong } =
    usePlayerStore();

  if (!currentSong) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>🎵</Text>
          <Text style={styles.emptyMessage}>No song playing</Text>
          <TouchableOpacity
            style={styles.playButton}
            onPress={() => playSong(currentSong!)}
          >
            <Text style={styles.buttonText}>Start Listening</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>KEEP</Text>
        <Text style={styles.subtitle}>Music Recognition</Text>
      </View>

      <View style={styles.playerContainer}>
        {/* Album Cover */}
        <Image
          source={{ uri: currentSong.cover }}
          style={styles.albumCover}
        />

        {/* Song Info */}
        <View style={styles.songInfo}>
          <Text style={styles.songTitle}>{currentSong.title}</Text>
          <Text style={styles.artist}>{currentSong.artist}</Text>
          <Text style={styles.album}>{currentSong.album}</Text>
        </View>

        {/* Recognition Badge */}
        {currentSong.isRecognized && (
          <View style={styles.recognizedBadge}>
            <Text style={styles.badgeText}>✓ Recognized</Text>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {/* Skip Button (Red) */}
          <TouchableOpacity
            style={[styles.button, styles.skipButton]}
            onPress={skipSong}
          >
            <Text style={styles.skipButtonText}>✕ PASS</Text>
          </TouchableOpacity>

          {/* Play/Pause Button */}
          <TouchableOpacity
            style={[styles.button, styles.playPauseButton]}
            onPress={isPlaying ? pauseSong : () => playSong(currentSong)}
          >
            <Text style={styles.playPauseText}>
              {isPlaying ? '⏸ PAUSE' : '▶ LISTEN'}
            </Text>
          </TouchableOpacity>

          {/* Keep Button (Green/Turquoise) */}
          <TouchableOpacity
            style={[styles.button, styles.keepButton]}
            onPress={() => keepSong(currentSong)}
          >
            <Text style={styles.keepButtonText}>✓ KEEP</Text>
          </TouchableOpacity>
        </View>

        {/* Demo Badge */}
        <View style={styles.demoBadge}>
          <Text style={styles.demoText}>🎭 DEMO Mode - Sample Data</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 60,
    marginBottom: 20,
  },
  emptyMessage: {
    fontSize: 18,
    color: '#999',
    marginBottom: 30,
  },
  playButton: {
    backgroundColor: '#1DB954',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  playerContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 30,
    justifyContent: 'space-around',
  },
  albumCover: {
    width: 280,
    height: 280,
    borderRadius: 20,
    alignSelf: 'center',
    backgroundColor: '#222',
    shadowColor: '#1DB954',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
  },
  songInfo: {
    alignItems: 'center',
    marginVertical: 20,
  },
  songTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  artist: {
    fontSize: 16,
    color: '#bbb',
    marginTop: 8,
  },
  album: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  recognizedBadge: {
    backgroundColor: '#1DB954',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignSelf: 'center',
    marginVertical: 10,
  },
  badgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 20,
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 'bold',
  },
  skipButton: {
    backgroundColor: '#DC2626',
  },
  skipButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  playPauseButton: {
    backgroundColor: '#333',
  },
  playPauseText: {
    color: '#1DB954',
    fontWeight: 'bold',
    fontSize: 14,
  },
  keepButton: {
    backgroundColor: '#1DB954',
  },
  keepButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  demoBadge: {
    backgroundColor: 'rgba(255, 193, 7, 0.2)',
    borderWidth: 1,
    borderColor: '#FFC107',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  demoText: {
    color: '#FFC107',
    fontSize: 12,
    fontWeight: '500',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
