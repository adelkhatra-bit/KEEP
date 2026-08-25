import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../store/useSessionStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { musicEngine } from '../services/musicEngine';
import SessionPulse from '../components/SessionPulse';

const NEON = {
  bg: '#090610',
  card: '#151020',
  card2: '#1B1329',
  purple: '#8B5CF6',
  purpleLight: '#B79CFF',
  purpleDeep: '#5B21B6',
  line: '#312348',
  green: '#68F2B1',
  yellow: '#E5F266',
  pink: '#FF5F83',
  muted: '#8F879D',
  text: '#F8F6FC',
};

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return '00:00:00';
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export default function HomeScreen({ navigation }: any) {
  const { t } = useTranslation();
  const {
    isActive, tracks, showEndPrompt, startedAt, error,
    startSession, requestEndSession, dismissEndPrompt, keepTrack, passTrack,
  } = useSessionStore();
  const { playlists, refresh } = usePlaylistStore();
  const [elapsed, setElapsed] = useState(formatElapsed(startedAt));

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!isActive) return;
    setElapsed(formatElapsed(startedAt));
    const timer = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [isActive, startedAt]);

  const detectedCount = tracks.length;
  const keptCount = tracks.filter((tr) => tr.status === 'kept' || tr.status === 'already_saved').length;
  const current = tracks[0];
  const isCurrentPending = current?.status === 'pending';
  const isAlreadySaved = current?.status === 'already_saved';
  const destination = current?.existingMatch?.playlistName || current?.recommendations?.[0]?.playlistName || playlists[0]?.name || 'Mes découvertes';

  const finishSession = () => {
    const sessionId = requestEndSession();
    if (sessionId) navigation.navigate('SessionRecap', { sessionId });
    else Alert.alert(t('session.endNow'), t('session.emptySessionEnded'));
  };

  const handleKeepPress = () => {
    if (!current || isAlreadySaved) return;
    if (playlists.length <= 1) {
      keepTrack(current.id);
      return;
    }
    Alert.alert(
      t('session.chooseDestination'),
      undefined,
      playlists.map((p) => ({ text: p.name, onPress: () => keepTrack(current.id, p.id) }))
    );
  };

  const shareCurrent = async () => {
    if (!current) return;
    await Share.share({ message: `${current.track.title} — ${current.track.artist} · découvert avec KEEP 🎵` });
  };

  if (!isActive) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.roundIcon} onPress={() => navigation.navigate('SessionHistory')} accessibilityLabel="Historique">
            <Text style={styles.roundIconText}>☰</Text>
          </TouchableOpacity>
          <Text style={styles.brand}>KEEP</Text>
          <View style={styles.premiumPill}><Text style={styles.premiumText}>♛ Premium</Text></View>
        </View>
        <View style={styles.idleBody}>
          <SessionPulse active={false} />
          <Text style={styles.idleTitle}>{t('session.emptyTitle')}</Text>
          <Text style={styles.idleSubtitle}>{t('session.emptySubtitle')}</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity style={styles.startButton} onPress={startSession}>
            <Text style={styles.startButtonGlyph}>♪</Text>
            <Text style={styles.startButtonText}>{t('session.start')}</Text>
          </TouchableOpacity>
          {musicEngine.isDemoMode && (
            <View style={styles.demoBadge}><Text style={styles.demoText}>{t('demo.badge')}</Text></View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.roundIcon} onPress={() => navigation.navigate('SessionHistory')} accessibilityLabel="Historique">
            <Text style={styles.roundIconText}>☰</Text>
          </TouchableOpacity>
          <Text style={styles.brand}>KEEP</Text>
          <View style={styles.premiumPill}><Text style={styles.premiumText}>♛ Premium</Text></View>
        </View>

        <View style={styles.radarArea}>
          <View style={styles.radarOuter}>
            <View style={styles.radarMid}>
              <View style={styles.radarInner}>
                <Text style={styles.radarNote}>♫</Text>
                <Text style={styles.radarTitle}>EN ÉCOUTE</Text>
              </View>
            </View>
          </View>
          <View style={styles.liveStatusRow}><View style={styles.liveDot} /><Text style={styles.liveStatus}>Session active</Text></View>
          <Text style={styles.analyzing}>Analyse en cours...</Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard icon="◷" value={elapsed} label="Durée" />
          <StatCard icon="≋" value={String(detectedCount)} label="Détectés" />
          <StatCard icon="♡" value={String(keptCount)} label="Gardés" />
        </View>

        {error && <View style={styles.liveErrorBanner}><Text style={styles.liveErrorText}>{error}</Text></View>}

        <View style={styles.sectionHeader}><View style={styles.sectionDot} /><Text style={styles.sectionTitle}>MUSIQUE DÉTECTÉE</Text></View>

        {current ? (
          <View style={styles.trackPanel}>
            <View style={styles.trackTop}>
              {current.track.artworkUrl ? (
                <Image source={{ uri: current.track.artworkUrl }} style={styles.artwork} />
              ) : (
                <View style={[styles.artwork, styles.artworkFallback]}><Text style={styles.artworkGlyph}>K</Text></View>
              )}
              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle} numberOfLines={1}>{current.track.title}</Text>
                <Text style={styles.trackArtist} numberOfLines={1}>{current.track.artist}</Text>
                {!!current.track.album && <Text style={styles.trackAlbum} numberOfLines={1}>{current.track.album}</Text>}
                <View style={styles.confidencePill}><Text style={styles.confidenceText}>✓ FIABILITÉ ÉLEVÉE</Text></View>
              </View>
            </View>

            {isAlreadySaved ? (
              <View style={styles.savedBanner}>
                <Text style={styles.savedBannerTitle}>✓ Déjà dans votre playlist</Text>
                <Text style={styles.savedBannerText}>« {destination} » · aucune action nécessaire</Text>
              </View>
            ) : (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.passButton, !isCurrentPending && styles.disabled]}
                  onPress={() => current && passTrack(current.id)}
                  disabled={!isCurrentPending}
                >
                  <Text style={styles.actionIcon}>✕</Text><Text style={styles.passText}>{t('listen.pass')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.keepButton, !isCurrentPending && styles.disabled]}
                  onPress={handleKeepPress}
                  disabled={!isCurrentPending}
                >
                  <Text style={styles.keepIcon}>♡</Text><Text style={styles.keepText}>{t('listen.keep')}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.destinationRow}>
              <Text style={styles.destinationLabel}>Ajouter à</Text>
              <TouchableOpacity style={styles.destinationPill} onPress={handleKeepPress} disabled={isAlreadySaved}>
                <Text style={styles.destinationText} numberOfLines={1}>{destination}⌄</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleKeepPress} disabled={isAlreadySaved}><Text style={styles.changeText}>{isAlreadySaved ? 'Déjà classé' : 'Changer'}</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.waitingCard}><Text style={styles.waitingNote}>♫</Text><Text style={styles.waitingText}>{t('session.waitingForMusic')}</Text></View>
        )}

        <View style={styles.sharePanel}>
          <View style={styles.shareHeader}><Text style={styles.shareTitle}>↗ PARTAGE RAPIDE</Text><Text style={styles.shareHint}>Le morceau du moment</Text></View>
          <View style={styles.shareRow}>
            {['WhatsApp', 'Instagram', 'TikTok', 'Snapchat', 'Plus'].map((name) => (
              <TouchableOpacity key={name} style={styles.shareItem} onPress={shareCurrent} disabled={!current}>
                <View style={styles.shareCircle}><Text style={styles.shareGlyph}>{name === 'WhatsApp' ? 'W' : name === 'Instagram' ? '◎' : name === 'TikTok' ? '♪' : name === 'Snapchat' ? 'S' : '•••'}</Text></View>
                <Text style={styles.shareName}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.endButton} onPress={finishSession}>
          <Text style={styles.endButtonText}>{t('session.endNow')}</Text>
        </TouchableOpacity>

        {musicEngine.isDemoMode && <View style={styles.demoBadge}><Text style={styles.demoText}>{t('demo.badge')}</Text></View>}
      </ScrollView>

      <Modal visible={showEndPrompt} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('session.endPromptTitle')}</Text>
            <Text style={styles.modalBody}>{t('session.endPromptBody')}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalContinueBtn} onPress={dismissEndPrompt}><Text style={styles.modalContinueText}>{t('session.continueListening')}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalEndBtn} onPress={finishSession}><Text style={styles.modalEndText}>{t('session.endNow')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEON.bg },
  scroll: { paddingBottom: 28 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  roundIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#120D1B', borderWidth: 1, borderColor: NEON.line },
  roundIconText: { color: NEON.text, fontSize: 18 },
  brand: { color: NEON.text, fontSize: 25, fontWeight: '900', letterSpacing: 5 },
  premiumPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, backgroundColor: '#171023', borderWidth: 1, borderColor: '#382559' },
  premiumText: { color: NEON.purpleLight, fontSize: 11, fontWeight: '800' },
  idleBody: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  idleTitle: { ...typography.h2, color: NEON.text, marginTop: spacing.xl, textAlign: 'center' },
  idleSubtitle: { fontSize: 14, color: NEON.muted, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  errorText: { fontSize: 13, color: NEON.pink, marginBottom: spacing.md, textAlign: 'center' },
  startButton: { minWidth: 230, minHeight: 58, borderRadius: 29, backgroundColor: NEON.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: NEON.purple, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  startButtonGlyph: { color: '#fff', fontSize: 22 },
  startButtonText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },
  radarArea: { alignItems: 'center', paddingTop: 8 },
  radarOuter: { width: 204, height: 204, borderRadius: 102, borderWidth: 1, borderColor: '#472675', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(90,33,182,0.08)' },
  radarMid: { width: 166, height: 166, borderRadius: 83, borderWidth: 1, borderColor: '#6339A6', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.12)' },
  radarInner: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6D35CF', borderWidth: 2, borderColor: '#A884FA', shadowColor: NEON.purple, shadowOpacity: 0.65, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  radarNote: { color: '#fff', fontSize: 31, marginBottom: 4 },
  radarTitle: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  liveStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 13 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: NEON.green },
  liveStatus: { color: NEON.green, fontSize: 13, fontWeight: '800' },
  analyzing: { color: NEON.muted, fontSize: 12, marginTop: 3 },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, marginTop: 17 },
  statCard: { flex: 1, minHeight: 75, backgroundColor: NEON.card, borderRadius: 14, borderWidth: 1, borderColor: NEON.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  statIcon: { color: NEON.purpleLight, fontSize: 16, marginBottom: 1 },
  statValue: { color: NEON.text, fontSize: 15, fontWeight: '900' },
  statLabel: { color: NEON.muted, fontSize: 10, marginTop: 2 },
  liveErrorBanner: { marginHorizontal: 18, marginTop: 12, backgroundColor: 'rgba(255,95,131,0.12)', borderWidth: 1, borderColor: NEON.pink, borderRadius: 12, padding: 10 },
  liveErrorText: { color: NEON.pink, fontSize: 12, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 20, marginBottom: 9 },
  sectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: NEON.purple },
  sectionTitle: { color: NEON.text, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  trackPanel: { marginHorizontal: 18, padding: 13, borderRadius: 18, backgroundColor: NEON.card, borderWidth: 1, borderColor: NEON.line },
  trackTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  artwork: { width: 75, height: 75, borderRadius: 12, backgroundColor: NEON.card2 },
  artworkFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#432A68' },
  artworkGlyph: { color: NEON.purpleLight, fontSize: 30, fontWeight: '900' },
  trackInfo: { flex: 1, minWidth: 0 },
  trackTitle: { color: NEON.text, fontSize: 20, fontWeight: '900' },
  trackArtist: { color: NEON.purpleLight, fontSize: 14, fontWeight: '700', marginTop: 2 },
  trackAlbum: { color: NEON.muted, fontSize: 11, marginTop: 2 },
  confidencePill: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(104,242,177,0.10)' },
  confidenceText: { color: NEON.green, fontSize: 8, fontWeight: '900', letterSpacing: 0.3 },
  actionsRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
  actionButton: { flex: 1, minHeight: 52, borderRadius: 15, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  passButton: { backgroundColor: NEON.pink },
  keepButton: { backgroundColor: NEON.yellow },
  disabled: { opacity: 0.35 },
  actionIcon: { color: '#fff', fontSize: 18, fontWeight: '900' },
  passText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.4 },
  keepIcon: { color: '#151515', fontSize: 20, fontWeight: '900' },
  keepText: { color: '#151515', fontSize: 14, fontWeight: '900', letterSpacing: 0.4 },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  destinationLabel: { color: NEON.muted, fontSize: 11 },
  destinationPill: { flex: 1, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: NEON.card2, borderWidth: 1, borderColor: NEON.line },
  destinationText: { color: NEON.text, fontSize: 11, fontWeight: '700' },
  changeText: { color: NEON.purpleLight, fontSize: 11, fontWeight: '800' },
  savedBanner: { marginTop: 13, padding: 12, borderRadius: 13, backgroundColor: 'rgba(104,242,177,0.08)', borderWidth: 1, borderColor: NEON.green },
  savedBannerTitle: { color: NEON.green, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  savedBannerText: { color: NEON.muted, fontSize: 11, marginTop: 3, textAlign: 'center' },
  waitingCard: { marginHorizontal: 18, minHeight: 100, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: NEON.card, borderWidth: 1, borderColor: NEON.line },
  waitingNote: { color: NEON.purpleLight, fontSize: 24 },
  waitingText: { color: NEON.muted, fontSize: 12, marginTop: 5 },
  sharePanel: { marginHorizontal: 18, marginTop: 14, padding: 13, borderRadius: 18, backgroundColor: NEON.card, borderWidth: 1, borderColor: NEON.line },
  shareHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shareTitle: { color: NEON.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  shareHint: { color: NEON.muted, fontSize: 9 },
  shareRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 11 },
  shareItem: { width: '19%', alignItems: 'center' },
  shareCircle: { width: 35, height: 35, borderRadius: 18, backgroundColor: NEON.card2, borderWidth: 1, borderColor: '#3B2955', alignItems: 'center', justifyContent: 'center' },
  shareGlyph: { color: NEON.text, fontSize: 13, fontWeight: '900' },
  shareName: { color: NEON.muted, fontSize: 8, marginTop: 4 },
  endButton: { marginHorizontal: 18, marginTop: 14, borderWidth: 1, borderColor: NEON.line, borderRadius: 15, paddingVertical: 12, alignItems: 'center' },
  endButtonText: { color: NEON.muted, fontWeight: '700', fontSize: 12 },
  demoBadge: { marginHorizontal: 18, marginTop: 10, backgroundColor: colors.demoBadgeBg, borderWidth: 1, borderColor: colors.demoBadgeBorder, borderRadius: radius.md, paddingVertical: 7, alignItems: 'center' },
  demoText: { color: colors.demoBadgeText, fontSize: 10, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: NEON.card2, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: NEON.line },
  modalTitle: { ...typography.h3, color: NEON.text, marginBottom: spacing.sm, textAlign: 'center' },
  modalBody: { fontSize: 14, color: NEON.muted, textAlign: 'center', marginBottom: spacing.xl },
  modalActions: { gap: spacing.md },
  modalContinueBtn: { backgroundColor: NEON.purple, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  modalContinueText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalEndBtn: { borderWidth: 1, borderColor: NEON.line, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  modalEndText: { color: NEON.muted, fontWeight: '600', fontSize: 14 },
});
