import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { computeMusicDNA, compareMusicDNA, DnaSourceDecision } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { shareEvent } from '../services/sharingService';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { ProfileKind } from '../types';
import LockedText from '../components/LockedText';

interface DemoProfile {
  id: string;
  username: string;
  kind: ProfileKind;
  bio: string;
  decisions: DnaSourceDecision[];
}

interface DemoEvent {
  id: string;
  name: string;
  venueName: string;
  startsAt: string;
  djArtistNames: string[];
}

/**
 * STATUT HONNÊTE (comme le reste de l'app en Mode Démo) : ces profils et
 * événements sont fictifs — aucun utilisateur/venue KEEP réel n'existe
 * encore (aucun backend Supabase déployé, voir docs/PROJECT_STATUS.md).
 * La compatibilité affichée est en revanche un VRAI calcul
 * (compareMusicDNA) contre l'ADN musical réel de l'utilisateur, dérivé de
 * ses GARDER en session — pas un pourcentage inventé.
 */
const DEMO_PROFILES: DemoProfile[] = [
  {
    id: 'p1', username: 'lea_m', kind: 'USER', bio: 'Chill le soir, afro house le week-end.',
    decisions: [
      { artist: 'Glass Animals', genres: ['indie', 'pop'], decision: 'KEPT', createdAt: '2026-08-01T20:00:00.000Z' },
      { artist: 'Glass Animals', genres: ['indie', 'pop'], decision: 'KEPT', createdAt: '2026-08-02T20:00:00.000Z' },
      { artist: 'The Weeknd', genres: ['pop', 'synthwave'], decision: 'KEPT', createdAt: '2026-08-03T20:00:00.000Z' },
    ],
  },
  {
    id: 'p2', username: 'dj_nova', kind: 'DJ', bio: 'Sets afro house & organic house — dispo bookings privés.',
    decisions: [
      { artist: 'Black Coffee', genres: ['afro house', 'house'], decision: 'KEPT', createdAt: '2026-08-01T22:00:00.000Z' },
      { artist: 'Black Coffee', genres: ['afro house', 'house'], decision: 'KEPT', createdAt: '2026-08-02T22:00:00.000Z' },
    ],
  },
  {
    id: 'p3', username: 'sam_k', kind: 'ARTIST', bio: 'Prod pop/rock, toujours en train de chercher des refs.',
    decisions: [
      { artist: 'Harry Styles', genres: ['pop', 'rock'], decision: 'KEPT', createdAt: '2026-08-01T18:00:00.000Z' },
      { artist: 'Harry Styles', genres: ['pop', 'rock'], decision: 'KEPT', createdAt: '2026-08-02T18:00:00.000Z' },
    ],
  },
];

const DEMO_EVENTS: DemoEvent[] = [
  { id: 'e1', name: 'Piscine Sunset Session', venueName: 'Club Lumen', startsAt: '2026-08-23T18:00:00.000Z', djArtistNames: ['dj_nova'] },
  { id: 'e2', name: 'Afro House Night', venueName: 'Le Sous-Sol', startsAt: '2026-08-29T22:00:00.000Z', djArtistNames: ['dj_nova', 'sam_k'] },
];

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const user = useUserStore((s) => s.user);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const [interestedEventIds, setInterestedEventIds] = useState<Set<string>>(new Set());
  const [openedProfile, setOpenedProfile] = useState<DemoProfile | null>(null);
  // OFF par défaut -- ces profils/événements sont fictifs (aucun backend
  // Supabase KEEP déployé). Avant ce correctif ils s'affichaient toujours,
  // mêlés aux vraies sections comme s'ils étaient réels (cf. demande
  // explicite du 23/08/2026 : "aucun faux profil... clairement séparées").
  const [showDemoExamples, setShowDemoExamples] = useState(false);
  // Plan FREE = visibilité limitée sur le profil des autres, incitation à
  // l'abonnement (cf. demande explicite du 22/08/2026). Aucune limite pour
  // un compte payant, quel que soit le palier.
  const isFreeViewer = (user?.plan ?? 'FREE') === 'FREE';

  const myDna = useMemo(() => {
    const decisions: DnaSourceDecision[] = sessions.flatMap((s) =>
      s.tracks
        .filter((tr) => tr.status === 'kept')
        .map((tr) => ({ artist: tr.track.artist, genres: tr.track.genres ?? [], decision: 'KEPT' as const, createdAt: tr.detectedAt }))
    );
    return computeMusicDNA(decisions);
  }, [sessions]);

  const trends = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      for (const tr of s.tracks) {
        if (tr.status !== 'kept') continue;
        counts.set(tr.track.artist, (counts.get(tr.track.artist) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([artist, count]) => ({ artist, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [sessions]);

  const compatibilityFor = (profile: DemoProfile): number | null => {
    if (myDna.totalDecisions === 0) return null;
    const theirDna = computeMusicDNA(profile.decisions);
    return Math.round(compareMusicDNA(myDna, theirDna) * 100);
  };

  const openProfile = (profile: DemoProfile) => setOpenedProfile(profile);
  const closeProfile = () => setOpenedProfile(null);
  const goUpgrade = () => {
    closeProfile();
    navigation.navigate('Profile');
  };

  const toggleInterested = (eventId: string) => {
    setInterestedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const locationEnabled = !!user?.locationOptIn;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('nav.discover')}</Text>

        <Section title={t('discover.yourTrends')}>
          {trends.length === 0 ? (
            <Text style={styles.mutedHint}>{t('discover.emptyTrends')}</Text>
          ) : (
            <View style={styles.chipsWrap}>
              {trends.map((tr) => (
                <View key={tr.artist} style={styles.trendChip}>
                  <Text style={styles.trendChipText}>{tr.artist} · {tr.count}</Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section title={t('discover.compatibleProfiles')}>
          {!showDemoExamples ? (
            <Text style={styles.mutedHint}>{t('discover.notConnectedYet')}</Text>
          ) : (
            DEMO_PROFILES.filter((p) => p.kind === 'USER').map((profile) => (
              <ProfileCard key={profile.id} profile={profile} compat={compatibilityFor(profile)} onPress={() => openProfile(profile)} t={t} />
            ))
          )}
        </Section>

        <Section title={t('discover.djsArtists')}>
          {!showDemoExamples ? (
            <Text style={styles.mutedHint}>{t('discover.notConnectedYet')}</Text>
          ) : (
            DEMO_PROFILES.filter((p) => p.kind !== 'USER').map((profile) => (
              <ProfileCard key={profile.id} profile={profile} compat={compatibilityFor(profile)} onPress={() => openProfile(profile)} t={t} />
            ))
          )}
        </Section>

        <Section title={t('discover.events')}>
          {!locationEnabled && <Text style={styles.mutedHint}>{t('discover.noLocation')}</Text>}
          {!showDemoExamples ? (
            <Text style={styles.mutedHint}>{t('discover.notConnectedYet')}</Text>
          ) : DEMO_EVENTS.map((event) => {
            const interested = interestedEventIds.has(event.id);
            const date = new Date(event.startsAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            return (
              <View key={event.id} style={styles.eventCard}>
                <Text style={styles.eventName}>{event.name}</Text>
                <Text style={styles.eventMeta}>{event.venueName} · {date}</Text>
                <Text style={styles.eventMeta}>{event.djArtistNames.map((n) => `@${n}`).join(', ')}</Text>
                <View style={styles.eventActionsRow}>
                  <TouchableOpacity
                    style={[styles.interestedBtn, interested && styles.interestedBtnActive]}
                    onPress={() => toggleInterested(event.id)}
                  >
                    <Text style={[styles.interestedBtnText, interested && styles.interestedBtnTextActive]}>
                      {interested ? t('discover.interestedMarked') : t('discover.interested')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.eventShareBtn}
                    hitSlop={8}
                    onPress={() => shareEvent(event.id, event.name).catch(() => {})}
                  >
                    <Text style={styles.eventShareBtnText}>🔗</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </Section>

        <TouchableOpacity onPress={() => setShowDemoExamples((v) => !v)} style={styles.demoToggle}>
          <Text style={styles.footerNote}>
            {showDemoExamples ? t('discover.hideDemoExamples') : t('discover.showDemoExamples')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!openedProfile} transparent animationType="fade" onRequestClose={closeProfile}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {openedProfile && (
              <>
                <Text style={styles.modalUsername}>@{openedProfile.username}</Text>
                <Text style={styles.modalBio}>{openedProfile.bio}</Text>
                {(() => {
                  const compat = compatibilityFor(openedProfile);
                  return compat !== null ? (
                    <Text style={styles.modalCompat}>{t('discover.compatibility', { percent: compat })}</Text>
                  ) : null;
                })()}

                <Text style={styles.modalSectionTitle}>{t('discover.topArtists')}</Text>
                <View style={styles.chipsWrap}>
                  {Array.from(new Set(openedProfile.decisions.map((d) => d.artist))).map((artist) => (
                    <View key={artist} style={styles.lockedChip}>
                      <LockedText text={artist} locked={isFreeViewer} />
                    </View>
                  ))}
                </View>

                {isFreeViewer && (
                  <>
                    <Text style={styles.upgradeHint}>{t('discover.upgradeToSeeArtists')}</Text>
                    <TouchableOpacity style={styles.upgradeBtn} onPress={goUpgrade}>
                      <Text style={styles.upgradeBtnText}>{t('discover.upgradeCta')}</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.modalCloseBtn} onPress={closeProfile}>
                  <Text style={styles.modalCloseBtnText}>{t('common.close')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProfileCard({ profile, compat, onPress, t }: { profile: DemoProfile; compat: number | null; onPress: () => void; t: (k: string, o?: any) => string }) {
  return (
    <TouchableOpacity style={styles.profileCard} onPress={onPress}>
      <View style={styles.profileAvatar} />
      <View style={styles.profileInfo}>
        <Text style={styles.profileUsername}>@{profile.username}</Text>
        <Text style={styles.profileBio} numberOfLines={1}>{profile.bio}</Text>
      </View>
      {compat !== null && (
        <View style={styles.compatBadge}>
          <Text style={styles.compatBadgeText}>{t('discover.compatibility', { percent: compat })}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, flexGrow: 1, paddingBottom: spacing.xxxl },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.xl },
  section: { marginBottom: spacing.xxl },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  mutedHint: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  trendChip: { backgroundColor: colors.smartBadgeBg, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  trendChipText: { color: colors.smartBadgeText, fontSize: 12, fontWeight: '700' },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.backgroundCard, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  profileAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.backgroundElevated },
  profileInfo: { flex: 1, minWidth: 0 },
  profileUsername: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  profileBio: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  compatBadge: { backgroundColor: colors.demoBadgeBg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  compatBadgeText: { color: colors.keep, fontSize: 11, fontWeight: '700' },

  eventCard: { backgroundColor: colors.backgroundCard, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  eventName: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  eventMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  eventActionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  eventShareBtn: { padding: spacing.xs },
  eventShareBtnText: { fontSize: 16 },
  interestedBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  interestedBtnActive: { backgroundColor: colors.keep, borderColor: colors.keep },
  interestedBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  interestedBtnTextActive: { color: colors.black },

  demoToggle: { marginTop: spacing.md, paddingVertical: spacing.sm },
  footerNote: { color: colors.primaryLight, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.xl },
  modalCard: {
    backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.border, maxWidth: 380, width: '100%', alignSelf: 'center',
  },
  modalUsername: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  modalBio: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
  modalCompat: { color: colors.keep, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm },
  modalSectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  lockedChip: { backgroundColor: colors.backgroundCard, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  upgradeHint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.lg },
  upgradeBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  upgradeBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  modalCloseBtn: { paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  modalCloseBtnText: { color: colors.primaryLight, fontWeight: '700' },
});
