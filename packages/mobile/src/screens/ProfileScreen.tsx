import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { musicEngine } from '../services/musicEngine';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, isDemoMode, logout, profileCompletion } = useUserStore();

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredContainer}>
          <Text style={styles.emptyText}>Not logged in</Text>
        </View>
      </SafeAreaView>
    );
  }

  const completion = profileCompletion();

  const handleShare = async () => {
    // Lien universel réel (deep link scheme "keep://") — la résolution web
    // publique (keep.app/@handle) nécessite le déploiement du site public,
    // voir docs/PROJECT_STATUS.md (statut PLANNED).
    try {
      await Share.share({
        message: `Découvre mon KEEP 🎵 keep://profile/${user.username}`,
      });
    } catch {
      // L'utilisateur a annulé le partage natif — pas une erreur applicative.
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile.title')}</Text>
        </View>

        <View style={styles.avatarSection}>
          <View style={styles.avatar} />
          <Text style={styles.username}>{user.username}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.bio}>{user.bio}</Text>
        </View>

        <View style={styles.completionCard}>
          <Text style={styles.completionText}>{t('profile.completion', { percent: completion })}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${completion}%` }]} />
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user.playlistCount}</Text>
            <Text style={styles.statLabel}>Playlists</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user.followerCount}</Text>
            <Text style={styles.statLabel}>{t('profile.followers')}</Text>
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Text style={styles.actionButtonText}>🔗 {t('profile.shareProfile')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>⚙️ {t('profile.settings')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.logoutButton]} onPress={logout}>
            <Text style={styles.logoutButtonText}>🚪 {t('profile.logout')}</Text>
          </TouchableOpacity>
        </View>

        {isDemoMode && musicEngine.isDemoMode && (
          <View style={styles.demoBadge}>
            <Text style={styles.demoText}>{t('demo.badge')}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.xxl },
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: colors.textSecondary },
  header: { paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { ...typography.h1, color: colors.textPrimary },
  avatarSection: { alignItems: 'center', paddingVertical: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.backgroundCard, marginBottom: spacing.lg },
  username: { ...typography.h2, color: colors.textPrimary },
  email: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  bio: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.xl },
  completionCard: { marginHorizontal: spacing.xl, marginTop: spacing.lg },
  completionText: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.backgroundCard, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  statsContainer: { flexDirection: 'row', paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.backgroundCard, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: 'center' },
  statNumber: { ...typography.h2, color: colors.primaryLight },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  actionsContainer: { paddingHorizontal: spacing.xl, gap: spacing.md },
  actionButton: {
    backgroundColor: colors.backgroundCard,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
    justifyContent: 'center',
  },
  actionButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  logoutButton: { backgroundColor: colors.danger, borderColor: colors.danger },
  logoutButtonText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  demoBadge: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    backgroundColor: colors.demoBadgeBg,
    borderWidth: 1,
    borderColor: colors.demoBadgeBorder,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  demoText: { color: colors.demoBadgeText, fontSize: 11, fontWeight: '600' },
});
