import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, TextInput, Switch, Modal, Image, Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { computeMusicDNA, compareMusicDNA, DnaSourceDecision } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { musicEngine } from '../services/musicEngine';
import { supabase } from '../services/supabaseClient';
import { createAuthService } from '../services/authService';
import { shareProfile, shareCompareInvite } from '../services/sharingService';
import { ProfileKind, SocialLink, GenderOption } from '../types';
import { AppAlert as Alert } from '../utils/AppAlert';
import BirthDatePicker from '../components/BirthDatePicker';
import PublicProfilePreview from '../components/PublicProfilePreview';
import { usePlaylistStore } from '../store/usePlaylistStore';
import VerifiedBadge from '../components/VerifiedBadge';
import { LANGUAGES, setAppLanguage } from '../i18n';
import { useMusicServiceStore, MusicServiceId } from '../store/useMusicServiceStore';
import { useRecentlyPlayedStore } from '../store/useRecentlyPlayedStore';
import { fetchMySubscription } from '../services/billingApi';

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

const ACTIVE_LANGUAGES = LANGUAGES.filter((l) => l.status === 'ACTIVE');

export default function ProfileScreen({ navigation }: any) {
  const { t, i18n } = useTranslation();
  const {
    user, isDemoMode, isAnonymous, logout, profileCompletion, updateUser,
    addFavoriteGenre, removeFavoriteGenre, addFavoriteArtist, removeFavoriteArtist,
    addSocialLink, removeSocialLink, toggleSocialLinkVisibility, setPrivateInfo,
  } = useUserStore();
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const playlists = usePlaylistStore((s) => s.playlists);
  const { connectedServices, connectDemo, connectReal, disconnect: disconnectService } = useMusicServiceStore();
  const { items: recentlyPlayed, syncing: syncingRecentlyPlayed, sync: syncRecentlyPlayed, keepTrack: keepRecentlyPlayedTrack } =
    useRecentlyPlayedStore();
  const [keepingKey, setKeepingKey] = useState<string | null>(null);

  /**
   * Plan RÉELLEMENT actif (cf. demande explicite du 24/08/2026 -- "je ne
   * vois pas clairement mon plan actif... ce sont encore des badges
   * décoratifs"). `user.plan` reste un champ local jamais synchronisé avec
   * un vrai abonnement -- source de vérité réelle = `/api/billing/me/
   * subscription` (packages/backend/src/routes/billing.ts, lit `subscriptions`
   * réel). Défaut FREE si hors-ligne/pas encore de ligne -- jamais une
   * erreur bloquante pour un simple badge.
   */
  const [realPlan, setRealPlan] = useState<{ code: string; name: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMySubscription().then((sub) => {
      if (!cancelled && sub?.plans) setRealPlan(sub.plans);
    });
    return () => { cancelled = true; };
  }, []);

  // Se resynchronise dès que Spotify (re)devient connecté (connexion faite
  // pendant que Profil est déjà ouvert, ou premier montage avec Spotify déjà
  // connecté) -- jamais de saisie manuelle, uniquement l'API réelle (cf.
  // demande explicite du 23/08/2026).
  useEffect(() => {
    if (connectedServices.includes('spotify')) syncRecentlyPlayed();
  }, [connectedServices.includes('spotify')]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ username: '', bio: '', city: '', countryCode: '', website: '' });
  const [detectingLocation, setDetectingLocation] = useState(false);

  /**
   * Cf. demande explicite du 24/08/2026 -- "intègre un module pour avoir un
   * système quand je localise automatiquement, ça me change l'adresse sur
   * le profil et j'ai plus qu'à sélectionner ce que je veux". Remplit
   * ville/pays automatiquement, MAIS reste dans `draft` -- l'utilisateur
   * voit le résultat et peut encore le corriger/écraser avant Enregistrer,
   * jamais imposé silencieusement. Nominatim (OpenStreetMap) : service de
   * géocodage inverse gratuit, sans clé API -- cohérent avec la contrainte
   * "le moins de dépenses possible" du même message.
   */
  const detectLocation = async () => {
    setDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.locationOptIn'), t('discover.noLocation'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=10`,
        { headers: { 'Accept-Language': 'fr' } }
      );
      const json = await res.json();
      const addr = json?.address ?? {};
      const city: string | undefined = addr.city || addr.town || addr.village || addr.municipality;
      const countryCode: string | undefined = addr.country_code?.toUpperCase();
      if (!city && !countryCode) {
        Alert.alert(t('profile.useMyLocation'), t('discover.noLocation'));
        return;
      }
      setDraft((d) => ({ ...d, city: city ?? d.city, countryCode: countryCode ?? d.countryCode }));
    } catch {
      Alert.alert(t('profile.useMyLocation'), t('discover.noLocation'));
    } finally {
      setDetectingLocation(false);
    }
  };
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [genreInput, setGenreInput] = useState('');
  const [artistInput, setArtistInput] = useState('');
  const [newLinkPlatform, setNewLinkPlatform] = useState<SocialLink['platform']>('instagram');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [qrVisible, setQrVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

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
    try {
      await shareProfile(user!.username);
    } catch {
      // L'utilisateur a annulé le partage natif — pas une erreur applicative.
    }
  };

  const handleShareCompareInvite = async () => {
    try {
      await shareCompareInvite(user!.username);
    } catch {
      // Annulé -- pas une erreur applicative.
    }
  };

  const startEditing = () => {
    setDraft({ username: user.username, bio: user.bio, city: user.city ?? '', countryCode: user.countryCode ?? '', website: user.website ?? '' });
    setUsernameError(null);
    setEditing(true);
  };

  const saveEditing = () => {
    // Aucune règle de format ni de longueur minimale -- c'est son profil, il
    // met ce qu'il veut (cf. demande explicite du 22/08/2026). Seule
    // contrainte réelle : pas complètement vide, et une limite haute large
    // pour éviter un pseudo qui casse visuellement l'interface.
    const trimmedUsername = draft.username.trim().replace(/\s+/g, ' ');
    if (trimmedUsername.length === 0 || trimmedUsername.length > 50) {
      setUsernameError(t('profile.usernameInvalid'));
      return;
    }
    updateUser({
      username: trimmedUsername,
      bio: draft.bio,
      city: draft.city.trim() || undefined,
      countryCode: draft.countryCode.trim().toUpperCase().slice(0, 2) || undefined,
      website: draft.website.trim() || undefined,
    });
    setUsernameError(null);
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

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('profile.title'), t('profile.photoPermissionDenied'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      updateUser({ avatar: result.assets[0].uri });
    }
  };

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

  const handleLogout = async () => {
    // Un vrai compte a une session Supabase persistée (AsyncStorage) --
    // sans ça, elle se restaurerait toute seule au prochain lancement
    // (voir App.tsx) malgré la déconnexion explicite ici.
    if (!isDemoMode && supabase) {
      await createAuthService(supabase).signOut();
    }
    logout();
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

        {isAnonymous && (
          <View style={styles.createAccountBanner}>
            <Text style={styles.createAccountText}>{t('profile.createAccountPrompt')}</Text>
            <TouchableOpacity style={styles.createAccountBtn} onPress={() => navigation.navigate('CreateAccount')}>
              <Text style={styles.createAccountBtnText}>{t('profile.createAccountCta')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.languageRow}>
          {ACTIVE_LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[styles.languageChip, i18n.language === lang.code && styles.platformChipActive]}
              onPress={() => setAppLanguage(lang.code)}
            >
              <Text style={[styles.platformChipText, i18n.language === lang.code && styles.platformChipTextActive]}>
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickPhoto}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarGlyph}>+</Text>
              </View>
            )}
          </TouchableOpacity>
          {editing ? (
            <View style={styles.usernameEditRow}>
              <TextInput
                style={styles.usernameInput}
                value={draft.username}
                onChangeText={(v) => { setDraft((d) => ({ ...d, username: v })); setUsernameError(null); }}
                placeholder={t('profile.username')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
              />
            </View>
          ) : (
            <View style={styles.usernameRow}>
              <Text style={styles.username}>{user.username}</Text>
              <VerifiedBadge plan={(realPlan?.code as any) ?? 'FREE'} />
            </View>
          )}
          {!!usernameError && <Text style={styles.errorText}>{usernameError}</Text>}
          <TouchableOpacity style={styles.kindChip} onPress={cycleKind}>
            <Text style={styles.kindChipText}>{kindLabel(user.kind)}</Text>
          </TouchableOpacity>
          <Text style={styles.email}>{user.email}</Text>

          <TouchableOpacity style={styles.planRow} onPress={() => navigation.navigate('Offers')}>
            <Text style={styles.planRowLabel}>{realPlan?.name ?? 'Free'}</Text>
            <Text style={styles.planRowCta}>{t('profile.viewOffers')} →</Text>
          </TouchableOpacity>

          {isDemoMode && (
            <View style={styles.planPreviewRow}>
              <Text style={styles.planPreviewLabel}>{t('profile.previewPlan')}</Text>
              {(['FREE', 'PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'] as const).map((p) => (
                <TouchableOpacity key={p} style={[styles.planChip, user.plan === p && styles.platformChipActive]} onPress={() => updateUser({ plan: p })}>
                  <VerifiedBadge plan={p} size="sm" />
                  <Text style={[styles.planChipText, user.plan === p && styles.platformChipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

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
            <>
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
              <TouchableOpacity style={styles.locateBtn} onPress={detectLocation} disabled={detectingLocation}>
                <Text style={styles.locateBtnText}>📍 {detectingLocation ? t('profile.locating') : t('profile.useMyLocation')}</Text>
              </TouchableOpacity>
            </>
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
          <Text style={styles.fieldLabel}>{t('profile.birthDate')}</Text>
          <BirthDatePicker
            value={user.privateInfo.birthDate}
            onChange={(isoDate) => setPrivateInfo({ birthDate: isoDate })}
          />

          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>{t('profile.gender')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genderRow}>
            {GENDER_OPTIONS.map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.genderChip, user.privateInfo.gender === g && styles.platformChipActive]}
                onPress={() => setPrivateInfo({ gender: user.privateInfo.gender === g ? undefined : g })}
              >
                <Text style={[styles.platformChipText, user.privateInfo.gender === g && styles.platformChipTextActive]}>
                  {genderLabel(g)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Section>

        <Section title={t('profile.musicServices')} hint={t('profile.musicServicesHint')}>
          <MusicServiceRow
            id="apple_music" label="Apple Music" connectedServices={connectedServices} isDemoMode={isDemoMode}
            onConnect={() => (isDemoMode ? connectDemo('apple_music') : navigation.navigate('AppleMusicConnect'))}
            onDisconnect={() => disconnectService('apple_music')} t={t}
          />
          <MusicServiceRow
            id="spotify" label="Spotify" connectedServices={connectedServices} isDemoMode={isDemoMode}
            onConnect={() => (isDemoMode ? connectDemo('spotify') : navigation.navigate('SpotifyConnect'))}
            onDisconnect={() => disconnectService('spotify')} t={t}
          />
          <MusicServiceRow
            id="youtube" label="YouTube" connectedServices={connectedServices} isDemoMode={isDemoMode}
            onConnect={() => {
              if (isDemoMode) return connectDemo('youtube');
              // Recherche seule (clé API) -- pas d'OAuth utilisateur construit, voir YouTubeProvider.ts.
              if (!process.env.EXPO_PUBLIC_YOUTUBE_API_KEY) {
                Alert.alert('YouTube', 'EXPO_PUBLIC_YOUTUBE_API_KEY manquant -- crée une clé API gratuite sur console.cloud.google.com (YouTube Data API v3).');
                return;
              }
              connectReal('youtube');
            }}
            onDisconnect={() => disconnectService('youtube')} t={t}
          />
          <MusicServiceRow
            id="youtube_music" label="YouTube Music" connectedServices={connectedServices} isDemoMode={isDemoMode}
            onConnect={() => (isDemoMode ? connectDemo('youtube_music') : Alert.alert('YouTube Music', 'Aucune API officielle YouTube Music n’existe pour ce type d’intégration -- KEEP n’utilise jamais de solution non officielle.'))}
            onDisconnect={() => disconnectService('youtube_music')} t={t}
          />
        </Section>

        <Section title={t('profile.recentlyPlayed')}>
          {!connectedServices.includes('spotify') ? (
            <Text style={styles.emptyHint}>{t('profile.recentlyPlayedEmpty')}</Text>
          ) : syncingRecentlyPlayed && recentlyPlayed.length === 0 ? (
            <Text style={styles.emptyHint}>…</Text>
          ) : recentlyPlayed.length === 0 ? (
            <Text style={styles.emptyHint}>{t('profile.recentlyPlayedNone')}</Text>
          ) : (
            <View style={styles.waitingList}>
              {recentlyPlayed.map((entry) => {
                const spotifyId = entry.track.providerIds.spotify;
                const listenUrl = spotifyId ? `https://open.spotify.com/track/${spotifyId}` : undefined;
                return (
                  <View key={entry.key} style={styles.rpRow}>
                    {entry.track.artworkUrl ? (
                      <Image source={{ uri: entry.track.artworkUrl }} style={styles.waitingArtwork} />
                    ) : (
                      <View style={[styles.waitingArtwork, styles.waitingArtworkPlaceholder]}>
                        <Text style={styles.waitingArtworkGlyph}>♪</Text>
                      </View>
                    )}
                    <View style={styles.waitingInfo}>
                      <Text style={styles.waitingTitle} numberOfLines={1}>{entry.track.title}</Text>
                      <Text style={styles.waitingArtist} numberOfLines={1}>{entry.track.artist}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.rpActionBtn}
                      disabled={!listenUrl}
                      onPress={() => listenUrl && Linking.openURL(listenUrl).catch(() => {})}
                    >
                      <Text style={styles.rpActionBtnText}>{t('profile.recentlyPlayedListen')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rpActionBtn, styles.rpKeepBtn, entry.kept && styles.rpKeepBtnDone]}
                      disabled={entry.kept || keepingKey === entry.key}
                      onPress={async () => {
                        setKeepingKey(entry.key);
                        try {
                          await keepRecentlyPlayedTrack(entry.key);
                        } catch (e: any) {
                          console.warn('[KEEP][recently-played-keep]', e?.message);
                          Alert.alert('KEEP', t('session.recognitionUnavailable'));
                        } finally {
                          setKeepingKey(null);
                        }
                      }}
                    >
                      <Text style={styles.rpKeepBtnText}>
                        {entry.kept ? t('profile.recentlyPlayedKept') : keepingKey === entry.key ? '…' : t('listen.keep')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </Section>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Text style={styles.actionButtonText}>🔗 {t('profile.shareProfile')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => setQrVisible(true)}>
            <Text style={styles.actionButtonText}>▦ {t('profile.qrTitle')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => setPreviewVisible(true)}>
            <Text style={styles.actionButtonText}>👁️ {t('profile.previewAsVisitor')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleCompare}>
            <Text style={styles.actionButtonText}>🎧 {t('profile.compareKeep')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShareCompareInvite}>
            <Text style={styles.actionButtonText}>🔗 {t('profile.shareCompareInvite')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.logoutButton]} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>🚪 {isAnonymous ? t('profile.exitGuestSession') : t('profile.logout')}</Text>
          </TouchableOpacity>
        </View>

        {isDemoMode && musicEngine.isDemoMode && (
          <Text style={styles.demoFootnote}>{t('demo.badge')}</Text>
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

      <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.previewCard}>
            <Text style={styles.qrTitle}>{t('profile.previewAsVisitor')}</Text>
            <Text style={styles.previewHint}>{t('profile.previewHint')}</Text>
            <View style={styles.previewFrame}>
              <PublicProfilePreview user={user} sessions={sessions} playlists={playlists} />
            </View>
            <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setPreviewVisible(false)}>
              <Text style={styles.qrCloseBtnText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MusicServiceRow({
  id, label, connectedServices, isDemoMode, onConnect, onDisconnect, t,
}: {
  id: MusicServiceId; label: string; connectedServices: MusicServiceId[]; isDemoMode: boolean;
  onConnect: () => void; onDisconnect: () => void; t: (k: string, o?: any) => string;
}) {
  const connected = connectedServices.includes(id);
  return (
    <View style={styles.serviceRow}>
      <Text style={styles.serviceLabel}>{label}</Text>
      {connected ? (
        <TouchableOpacity onPress={onDisconnect}>
          <Text style={styles.serviceConnected}>✓ {t('profile.connected')}{isDemoMode ? ' (démo)' : ''}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.serviceConnectBtn} onPress={onConnect}>
          <Text style={styles.serviceConnectBtnText}>{t('profile.connect')}</Text>
        </TouchableOpacity>
      )}
    </View>
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
  createAccountBanner: {
    marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.backgroundCard,
    borderWidth: 1, borderColor: colors.primary, gap: spacing.sm,
  },
  createAccountText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  planRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    marginTop: spacing.xs,
  },
  planRowLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  planRowCta: { color: colors.primaryLight, fontSize: 12, fontWeight: '700' },
  createAccountBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.sm, alignItems: 'center' },
  createAccountBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  avatarSection: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.backgroundCard, marginBottom: spacing.lg },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { color: colors.textMuted, fontSize: 32, fontWeight: '300' },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  username: { ...typography.h2, color: colors.textPrimary },
  usernameEditRow: { width: '100%', maxWidth: 240 },
  usernameInput: {
    color: colors.textPrimary, fontSize: 20, fontWeight: '700', textAlign: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.xs,
  },
  errorText: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },
  planPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  planPreviewLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  planChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  planChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
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
  locateBtn: {
    marginTop: spacing.sm, alignSelf: 'flex-start', backgroundColor: colors.smartBadgeBg,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  locateBtnText: { color: colors.smartBadgeText, fontSize: 12, fontWeight: '700' },
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

  languageRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  serviceLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  serviceConnected: { color: colors.keep, fontSize: 12, fontWeight: '700' },
  serviceConnectBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  serviceConnectBtnText: { color: colors.primaryLight, fontSize: 12, fontWeight: '700' },
  languageChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: spacing.xs },
  genderRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.xl },
  genderChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
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

  actionsContainer: {
    paddingHorizontal: spacing.xl, marginTop: spacing.md,
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  // Fond teinté (pas juste une bordure sur fond neutre identique aux cartes
  // d'info) + largeur au contenu (pas pleine largeur) -- cf. demande
  // explicite du 24/08/2026 : "il faut vraiment que ça soit montré qu'on
  // peut cliquer dessus" + "les formats des boutons sont sûrement trop gros".
  actionButton: {
    backgroundColor: colors.smartBadgeBg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', minHeight: 40,
  },
  actionButtonText: { color: colors.smartBadgeText, fontSize: 13, fontWeight: '700' },
  logoutButton: { backgroundColor: colors.danger },
  logoutButtonText: { color: colors.white, fontSize: 13, fontWeight: '700' },

  demoFootnote: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.xl },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  qrCard: { backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  qrTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg },
  qrBox: { backgroundColor: colors.white, padding: spacing.lg, borderRadius: radius.lg },
  qrHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.lg },
  qrCloseBtn: { marginTop: spacing.xl, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  qrCloseBtnText: { color: colors.primaryLight, fontWeight: '700' },
  previewCard: {
    backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, padding: spacing.lg,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, maxWidth: 380, width: '100%', alignSelf: 'center',
  },
  previewHint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.md },
  previewFrame: { width: '100%', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.background },

  emptyHint: { color: colors.textMuted, fontSize: 13 },
  waitingList: { gap: spacing.xs },
  // 44 -> 48 (audit Design System du 24/08/2026) -- même taille que TrackRow.
  waitingArtwork: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.backgroundElevated },
  waitingArtworkPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  waitingArtworkGlyph: { color: colors.textMuted, fontSize: 16 },
  waitingInfo: { flex: 1, minWidth: 0 },
  waitingTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  waitingArtist: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  rpRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.backgroundCard, borderRadius: radius.md, padding: spacing.sm,
  },
  rpActionBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  rpActionBtnText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  rpKeepBtn: { borderColor: colors.keep },
  rpKeepBtnDone: { borderColor: colors.border, opacity: 0.6 },
  rpKeepBtnText: { color: colors.keep, fontSize: 11, fontWeight: '700' },
});
