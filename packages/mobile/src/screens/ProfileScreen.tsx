import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Share, TextInput, Switch, Modal, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import QRCode from 'react-native-qrcode-svg';
import { computeMusicDNA, compareMusicDNA, DnaSourceDecision } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { musicEngine } from '../services/musicEngine';
import { ProfileKind, SocialLink, GenderOption } from '../types';

const KIND_OPTIONS: ProfileKind[] = ['USER', 'CREATOR', 'DJ', 'ARTIST', 'PRODUCER', 'VENUE'];
const PLATFORM_OPTIONS: SocialLink['platform'][] = ['instagram', 'tiktok', 'facebook', 'snapchat', 'youtube', 'x', 'website', 'other'];
const GENDER_OPTIONS: GenderOption[] = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'];

/**
 * Fabrique un ADN "démo" plausible et STABLE (pas aléatoire à chaque rendu)
 * pour illustrer "Comparer nos KEEP" tant qu'il n'existe aucun second
 * utilisateur KEEP réel — voir docs/PROJECT_STATUS.md (réseau social PLANNED).
 */
const DEMO_FRIEND_DECISIONS: DnaSourceDecision[] = [
  { artist: 'The Weeknd', genres: ['pop', 'synthwave'], decision: 'KEPT', createdAt: '2026-08-01T20:00:00.000Z' },
  { artist: 'Glass Animals', genres: ['indie', 'pop'], decision: 'KEPT', createdAt: '2026-08-01T20:10:00.000Z' },
  { artist: 'Glass Animals', genres: ['indie', 'pop'], decision: 'KEPT', createdAt: '2026-08-02T21:00:00.000Z' },
  { artist: 'Harry Styles', genres: ['pop', 'rock'], decision: 'KEPT', createdAt: '2026-08-03T19:00:00.000Z' },
];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const {
    user, isDemoMode, logout, profileCompletion, updateUser,
    addFavoriteGenre, removeFavoriteGenre, addFavoriteArtist, removeFavoriteArtist,
    addSocialLink, removeSocialLink, toggleSocialLinkVisibility, setPrivateInfo,
  } = useUserStore();
  const sessions = useSessionHistoryStore((s) => s.sessions);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ bio: '', city: '', countryCode: '', website: '' });
  const [genreInput, setGenreInput] = useState('');
  const [artistInput, setArtistInput] = useState('');
  const [newLinkPlatform, setNewLinkPlatform] = useState<SocialLink['platform']>('instagram');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [qrVisible, setQrVisible] = useState(false);

  const myDna = useMemo(() => {
    const decisions: DnaSourceDecision[] = sessions.flatMap((s) =>
      s.tracks
        .filter((tr) => tr.status === 'kept')
        .map((tr) => ({ artist: tr.track.artist, genres: tr.track.genres ?? [], decision: 'KEPT' as const, createdAt: tr.detectedAt }))
    );
    return computeMusicDNA(decisions);
  }, [sessions]);

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
      await Share.share({ message: `Découvre mon KEEP 🎵 keep://profile/${user.username}` });
    } catch {
      // L'utilisateur a annulé le partage natif — pas une erreur applicative.
    }
  };

  const startEditing = () => {
    setDraft({ bio: user.bio, city: user.city ?? '', countryCode: user.countryCode ?? '', website: user.website ?? '' });
    setEditing(true);
  };

  const saveEditing = () => {
    updateUser({
      bio: draft.bio,
      city: draft.city.trim() || undefined,
      countryCode: draft.countryCode.trim().toUpperCase().slice(0, 2) || undefined,
      website: draft.website.trim() || undefined,
    });
    setEditing(false);
  };

  const cycleKind = () => {
    const idx = KIND_OPTIONS.indexOf(user.kind);
    updateUser({ kind: KIND_OPTIONS[(idx + 1) % KIND_OPTIONS.length] });
  };

  const kindLabel = (kind: ProfileKind) =>
    ({ USER: t('profile.kindUser'), CREATOR: t('profile.kindCreator'), DJ: t('profile.kindDj'), ARTIST: t('profile.kindArtist'), PRODUCER: t('profile.kindProducer'), VENUE: t('profile.kindVenue') }[kind]);

  const genderLabel = (g: GenderOption) =>
    ({ MALE: t('profile.genderMale'), FEMALE: t('profile.genderFemale'), OTHER: t('profile.genderOther'), PREFER_NOT_TO_SAY: t('profile.genderPreferNot') }[g]);

  const handleToggleLocation = async (value: boolean) => {
    if (!value) {
      updateUser({ locationOptIn: false });
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      updateUser({ locationOptIn: true });
    } else {
      Alert.alert(t('profile.locationOptIn'), t('discover.noLocation'));
    }
  };

  const handleAddSocialLink = () => {
    const url = newLinkUrl.trim();
    if (!url) return;
    addSocialLink({ platform: newLinkPlatform, url, visibility: 'PUBLIC' });
    setNewLinkUrl('');
  };

  const handleCompare = () => {
    if (myDna.totalDecisions === 0) {
      Alert.alert(t('profile.compareKeep'), t('profile.compareNeedsData'));
      return;
    }
    const friendDna = computeMusicDNA(DEMO_FRIEND_DECISIONS);
    const score = Math.round(compareMusicDNA(myDna, friendDna) * 100);
    Alert.alert(t('profile.compareKeep'), `${t('profile.compareResult', { name: 'Léa (démo)', percent: score })}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <TouchableOpacity onPress={editing ? saveEditing : startEditing}>
            <Text style={styles.editLink}>{editing ? t('profile.save') : t('profile.edit')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.avatarSection}>
          <View style={styles.avatar} />
          <Text style={styles.username}>{user.username}</Text>
          <TouchableOpacity style={styles.kindChip} onPress={cycleKind}>
            <Text style={styles.kindChipText}>{kindLabel(user.kind)}</Text>
          </TouchableOpacity>
          <Text style={styles.email}>{user.email}</Text>

          {editing ? (
            <TextInput
              style={styles.bioInput}
              value={draft.bio}
              onChangeText={(v) => setDraft((d) => ({ ...d, bio: v }))}
              placeholder={t('profile.bio')}
              placeholderTextColor={colors.textMuted}
              multiline
            />
          ) : (
            !!user.bio && <Text style={styles.bio}>{user.bio}</Text>
          )}

          {editing ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.smallInput}
                value={draft.city}
                onChangeText={(v) => setDraft((d) => ({ ...d, city: v }))}
                placeholder={t('profile.city')}
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={styles.smallInput}
                value={draft.countryCode}
                onChangeText={(v) => setDraft((d) => ({ ...d, countryCode: v }))}
                placeholder={t('profile.country')}
                placeholderTextColor={colors.textMuted}
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>
          ) : (
            (user.city || user.countryCode) && (
              <Text style={styles.locationText}>{[user.city, user.countryCode].filter(Boolean).join(' · ')}</Text>
            )
          )}

          {editing ? (
            <TextInput
              style={styles.smallInput}
              value={draft.website}
              onChangeText={(v) => setDraft((d) => ({ ...d, website: v }))}
              placeholder={t('profile.website')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
          ) : (
            !!user.website && <Text style={styles.websiteText}>{user.website}</Text>
          )}
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
            <Text style={styles.statLabel}>{t('myMusic.playlists')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user.followerCount}</Text>
            <Text style={styles.statLabel}>{t('profile.followers')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user.followingCount}</Text>
            <Text style={styles.statLabel}>{t('profile.following')}</Text>
          </View>
        </View>

        <Section title={t('profile.favoriteGenres')}>
          <ChipInput
            items={user.favoriteGenres}
            onRemove={removeFavoriteGenre}
            value={genreInput}
            onChangeValue={setGenreInput}
            onAdd={() => { addFavoriteGenre(genreInput); setGenreInput(''); }}
            placeholder={t('profile.addGenre')}
          />
        </Section>

        <Section title={t('profile.favoriteArtists')}>
          <ChipInput
            items={user.favoriteArtists}
            onRemove={removeFavoriteArtist}
            value={artistInput}
            onChangeValue={setArtistInput}
            onAdd={() => { addFavoriteArtist(artistInput); setArtistInput(''); }}
            placeholder={t('profile.addArtist')}
          />
        </Section>

        <Section title={t('profile.socialLinks')}>
          {user.socialLinks.map((link) => (
            <View key={link.platform} style={styles.linkRow}>
              <Text style={styles.linkPlatform}>{link.platform}</Text>
              <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text>
              <TouchableOpacity onPress={() => toggleSocialLinkVisibility(link.platform)}>
                <Text style={styles.linkVisibility}>{link.visibility === 'PUBLIC' ? t('profile.public') : t('profile.private')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeSocialLink(link.platform)} hitSlop={8}>
                <Text style={styles.linkRemove}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.platformPicker}>
            {PLATFORM_OPTIONS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.platformChip, newLinkPlatform === p && styles.platformChipActive]}
                onPress={() => setNewLinkPlatform(p)}
              >
                <Text style={[styles.platformChipText, newLinkPlatform === p && styles.platformChipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.addLinkRow}>
            <TextInput
              style={styles.addLinkInput}
              value={newLinkUrl}
              onChangeText={setNewLinkUrl}
              placeholder="https://…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              onSubmitEditing={handleAddSocialLink}
            />
            <TouchableOpacity style={styles.addLinkBtn} onPress={handleAddSocialLink}>
              <Text style={styles.addLinkBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title={t('profile.keepDnaTitle')} hint={t('profile.keepDnaHint')}>
          {myDna.totalDecisions === 0 ? (
            <Text style={styles.mutedHint}>{t('profile.keepDnaEmpty')}</Text>
          ) : (
            <>
              <View style={styles.chipsWrap}>
                {myDna.topGenres.map((g) => (
                  <View key={g.genre} style={styles.dnaChip}>
                    <Text style={styles.dnaChipText}>{g.genre}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.diversityText}>
                {t('profile.diversity')} : {Math.round(myDna.diversityScore * 100)}%
              </Text>
            </>
          )}
        </Section>

        <View style={styles.switchRow}>
          <View style={styles.switchLabelBlock}>
            <Text style={styles.switchLabel}>{t('profile.publicProfile')}</Text>
            <Text style={styles.switchHint}>{t('profile.publicProfileHint')}</Text>
          </View>
          <Switch
            value={user.isPublic}
            onValueChange={(v) => updateUser({ isPublic: v })}
            trackColor={{ false: colors.backgroundCard, true: colors.primary }}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchLabelBlock}>
            <Text style={styles.switchLabel}>{t('profile.locationOptIn')}</Text>
            <Text style={styles.switchHint}>{t('profile.locationOptInHint')}</Text>
          </View>
          <Switch
            value={user.locationOptIn}
            onValueChange={handleToggleLocation}
            trackColor={{ false: colors.backgroundCard, true: colors.primary }}
          />
        </View>

        <Section title={t('profile.privateInfoTitle')} hint={t('profile.privateInfoHint')}>
          <TextInput
            style={styles.smallInput}
            value={user.privateInfo.birthDate ?? ''}
            onChangeText={(v) => setPrivateInfo({ birthDate: v || undefined })}
            placeholder={`${t('profile.birthDate')} (AAAA-MM-JJ)`}
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.platformPicker}>
            {GENDER_OPTIONS.map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.platformChip, user.privateInfo.gender === g && styles.platformChipActive]}
                onPress={() => setPrivateInfo({ gender: g })}
              >
                <Text style={[styles.platformChipText, user.privateInfo.gender === g && styles.platformChipTextActive]}>
                  {genderLabel(g)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Text style={styles.actionButtonText}>🔗 {t('profile.shareProfile')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => setQrVisible(true)}>
            <Text style={styles.actionButtonText}>▦ {t('profile.qrTitle')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleCompare}>
            <Text style={styles.actionButtonText}>🎧 {t('profile.compareKeep')}</Text>
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

      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>{t('profile.qrTitle')}</Text>
            <View style={styles.qrBox}>
              <QRCode value={`keep://profile/${user.username}`} size={200} backgroundColor={colors.white} color={colors.background} />
            </View>
            <Text style={styles.qrHint}>{t('profile.qrHint')}</Text>
            <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setQrVisible(false)}>
              <Text style={styles.qrCloseBtnText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint && <Text style={styles.sectionHint}>{hint}</Text>}
      {children}
    </View>
  );
}

function ChipInput({
  items, onRemove, value, onChangeValue, onAdd, placeholder,
}: {
  items: string[]; onRemove: (item: string) => void; value: string; onChangeValue: (v: string) => void; onAdd: () => void; placeholder: string;
}) {
  return (
    <>
      <View style={styles.chipsWrap}>
        {items.map((item) => (
          <TouchableOpacity key={item} style={styles.removableChip} onPress={() => onRemove(item)}>
            <Text style={styles.removableChipText}>{item} ✕</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.addLinkRow}>
        <TextInput
          style={styles.addLinkInput}
          value={value}
          onChangeText={onChangeValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={onAdd}
        />
        <TouchableOpacity style={styles.addLinkBtn} onPress={onAdd}>
          <Text style={styles.addLinkBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.xxl },
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: colors.textSecondary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { ...typography.h1, color: colors.textPrimary },
  editLink: { color: colors.primaryLight, fontWeight: '700', fontSize: 14 },
  avatarSection: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.backgroundCard, marginBottom: spacing.lg },
  username: { ...typography.h2, color: colors.textPrimary },
  kindChip: { backgroundColor: colors.smartBadgeBg, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, marginTop: spacing.sm },
  kindChipText: { color: colors.smartBadgeText, fontSize: 12, fontWeight: '700' },
  email: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  bio: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.xl },
  bioInput: {
    width: '100%', color: colors.textPrimary, fontSize: 14, textAlign: 'center', marginTop: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm,
  },
  editRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, width: '100%' },
  smallInput: {
    flex: 1, color: colors.textPrimary, fontSize: 13, marginTop: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm,
  },
  locationText: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
  websiteText: { fontSize: 13, color: colors.primaryLight, marginTop: spacing.sm },
  completionCard: { marginHorizontal: spacing.xl, marginTop: spacing.lg },
  completionText: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.backgroundCard, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  statsContainer: { flexDirection: 'row', paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.backgroundCard, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: 'center' },
  statNumber: { ...typography.h2, color: colors.primaryLight },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },

  section: { paddingHorizontal: spacing.xl, marginBottom: spacing.xl },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  sectionHint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  mutedHint: { fontSize: 13, color: colors.textMuted },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  removableChip: { backgroundColor: colors.backgroundCard, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  removableChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  dnaChip: { backgroundColor: colors.smartBadgeBg, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  dnaChipText: { color: colors.smartBadgeText, fontSize: 12, fontWeight: '700' },
  diversityText: { color: colors.textSecondary, fontSize: 13 },

  addLinkRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  addLinkInput: {
    flex: 1, color: colors.textPrimary, fontSize: 13, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  addLinkBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addLinkBtnText: { color: colors.white, fontSize: 20, fontWeight: '700', lineHeight: 22 },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  linkPlatform: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', width: 64, textTransform: 'capitalize' },
  linkUrl: { flex: 1, color: colors.textSecondary, fontSize: 12 },
  linkVisibility: { color: colors.primaryLight, fontSize: 11, fontWeight: '700' },
  linkRemove: { color: colors.danger, fontSize: 14, fontWeight: '700' },

  platformPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  platformChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  platformChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  platformChipText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  platformChipTextActive: { color: colors.white },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  switchLabelBlock: { flex: 1, marginRight: spacing.md },
  switchLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  switchHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  actionsContainer: { paddingHorizontal: spacing.xl, gap: spacing.md, marginTop: spacing.md },
  actionButton: {
    backgroundColor: colors.backgroundCard, paddingVertical: spacing.lg, borderRadius: radius.md,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, minHeight: 48, justifyContent: 'center',
  },
  actionButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  logoutButton: { backgroundColor: colors.danger, borderColor: colors.danger },
  logoutButtonText: { color: colors.white, fontSize: 15, fontWeight: '600' },

  demoBadge: {
    marginHorizontal: spacing.xl, marginTop: spacing.xl, backgroundColor: colors.demoBadgeBg,
    borderWidth: 1, borderColor: colors.demoBadgeBorder, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center',
  },
  demoText: { color: colors.demoBadgeText, fontSize: 11, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  qrCard: { backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  qrTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg },
  qrBox: { backgroundColor: colors.white, padding: spacing.lg, borderRadius: radius.lg },
  qrHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.lg },
  qrCloseBtn: { marginTop: spacing.xl, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  qrCloseBtnText: { color: colors.primaryLight, fontWeight: '700' },
});
