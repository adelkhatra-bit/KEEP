import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../store/usePlayerStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { musicEngine } from '../services/musicEngine';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { isListening, currentTrack, recommendations, lastConfirmation, error, startListening, passSong, keepSong } = usePlayerStore();

  const topRecommendation = recommendations[0];

  useEffect(() => {
    if (lastConfirmation) {
      const timer = setTimeout(() => usePlayerStore.setState({ lastConfirmation: null }), 2500);
      return () => clearTimeout(timer);
    }
  }, [lastConfirmation]);

  if (isListening) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.listeningText}>{t('listen.listening')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentTrack) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          {lastConfirmation ? (
            <Text style={styles.confirmationText}>✓ {lastConfirmation}</Text>
          ) : (
            <Text style={styles.emptyText}>🎵</Text>
          )}
          <Text style={styles.emptyMessage}>{t('listen.noSongTitle')}</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity style={styles.playButton} onPress={startListening}>
            <Text style={styles.buttonText}>{t('listen.startListening')}</Text>
          </TouchableOpacity>
          {musicEngine.isDemoMode && (
            <View style={styles.demoBadge}>
              <Text style={styles.demoText}>{t('demo.badge')}</Text>
            </View>
          )}
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
        <View style={styles.albumCover} />

        <View style={styles.songInfo}>
          <Text style={styles.songTitle}>{currentTrack.title}</Text>
          <Text style={styles.artist}>{currentTrack.artist}</Text>
          {currentTrack.album && <Text style={styles.album}>{currentTrack.album}</Text>}
        </View>

        {topRecommendation && (
          <View style={styles.recognizedBadge}>
            <Text style={styles.badgeText}>
              ✓ {t('listen.recognized')} → {topRecommendation.playlistName} · {t('listen.confidence', { value: Math.round(topRecommendation.score * 100) })}
            </Text>
          </View>
        )}

        <View style={styles.controls}>
          <TouchableOpacity style={[styles.button, styles.skipButton]} onPress={passSong}>
            <Text style={styles.skipButtonText}>✕ {t('listen.pass')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.keepButton]} onPress={() => keepSong()}>
            <Text style={styles.keepButtonText}>✓ {t('listen.keep')}</Text>
          </TouchableOpacity>
        </View>

        {musicEngine.isDemoMode && (
          <View style={styles.demoBadge}>
            <Text style={styles.demoText}>{t('demo.badge')}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyText: { fontSize: 60, marginBottom: spacing.lg },
  emptyMessage: { fontSize: 18, color: colors.textSecondary, marginBottom: spacing.xl },
  listeningText: { fontSize: 16, color: colors.textSecondary, marginTop: spacing.lg },
  confirmationText: { fontSize: 22, color: colors.keep, fontWeight: '700', marginBottom: spacing.lg },
  errorText: { fontSize: 13, color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  playButton: { backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl, borderRadius: radius.pill, minHeight: 48, justifyContent: 'center' },
  header: { paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs },
  playerContainer: { flex: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, justifyContent: 'space-around' },
  albumCover: {
    width: 260,
    height: 260,
    borderRadius: radius.xl,
    alignSelf: 'center',
    backgroundColor: colors.backgroundCard,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
  },
  songInfo: { alignItems: 'center', marginVertical: spacing.lg },
  songTitle: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  artist: { fontSize: 16, color: colors.textSecondary, marginTop: spacing.sm },
  album: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },
  recognizedBadge: {
    backgroundColor: colors.smartBadgeBg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  badgeText: { color: colors.smartBadgeText, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing.lg, gap: spacing.md },
  button: { flex: 1, paddingVertical: spacing.lg, borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center', minHeight: minTouchTargetSafe() },
  skipButton: { backgroundColor: colors.pass },
  skipButtonText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  keepButton: { backgroundColor: colors.keep },
  keepButtonText: { color: colors.black, fontWeight: '700', fontSize: 14 },
  demoBadge: {
    backgroundColor: colors.demoBadgeBg,
    borderWidth: 1,
    borderColor: colors.demoBadgeBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  demoText: { color: colors.demoBadgeText, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 16 },
});

function minTouchTargetSafe() {
  return 48;
}
