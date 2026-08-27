import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { KeepVisibility } from '../types';
import { useSessionStore } from '../store/useSessionStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useUserStore } from '../store/useUserStore';
import { musicEngine } from '../services/musicEngine';
import SessionPulse from '../components/SessionPulse';
import SwipeDeck from '../components/SwipeDeck';
import { loadSessionScreenCopy, loadCurrentPlanCode } from '../services/planService';
import { getDownloadCreditStatus } from '../services/creditService';

const C = {
  bg: '#090610', card: '#151020', line: '#312348', purple: '#8B5CF6', purpleLight: '#B79CFF',
  green: '#68F2B1', yellow: '#E5F266', pink: '#FF5F83', muted: '#8F879D', text: '#F8F6FC',
};

function formatElapsed(startedAt: string | null) {
  if (!startedAt) return '00:00';
  const total = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function HomeScreenCompact({ navigation }: any) {
  const { t } = useTranslation();
  const {
    isActive, tracks, showEndPrompt, startedAt, error, recognizing, micLevel,
    startSession, requestEndSession, dismissEndPrompt, keepTrack, passTrack, setTrackVisibility,
  } = useSessionStore();
  const { playlists, refresh } = usePlaylistStore();
  const user = useUserStore((s) => s.user);
  const [elapsed, setElapsed] = useState(formatElapsed(startedAt));
  const micPulse = useRef(new Animated.Value(0)).current;
  const signalScan = useRef(new Animated.Value(0)).current;
  const [screenCopy, setScreenCopy] = useState<{ emptyTitle: string | null; emptySubtitle: string | null }>({ emptyTitle: null, emptySubtitle: null });
  const [planCode, setPlanCode] = useState('FREE');
  const [creditRemaining, setCreditRemaining] = useState<number | null>(null);
  const [creditUnlimited, setCreditUnlimited] = useState(false);
  const [keepChoiceOpen, setKeepChoiceOpen] = useState(false);
  const [keepPlaylistId, setKeepPlaylistId] = useState<string | undefined>(undefined);
  const [keepBusy, setKeepBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);

  const refreshCreditBadge = async () => {
    try {
      const status = await getDownloadCreditStatus();
      setCreditRemaining(status.remaining);
      setCreditUnlimited(status.unlimited);
      if (status.planCode && status.planCode !== 'GUEST' && status.planCode !== 'DEMO') {
        setPlanCode(status.planCode);
      }
    } catch {
      setCreditRemaining(null);
      setCreditUnlimited(false);
    }
  };

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { loadSessionScreenCopy().then(setScreenCopy).catch(() => {}); }, []);
  useEffect(() => {
    let live = true;
    if (user && !musicEngine.isDemoMode) loadCurrentPlanCode(user.id).then((code) => live && setPlanCode(code || 'FREE')).catch(() => live && setPlanCode('FREE'));
    return () => { live = false; };
  }, [user?.id]);
  useEffect(() => {
    void refreshCreditBadge();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshCreditBadge(); });
    return () => unsubscribe?.();
  }, [navigation, user?.id]);
  useEffect(() => {
    if (!isActive) return;
    setElapsed(formatElapsed(startedAt));
    const timer = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [isActive, startedAt]);

  const isLiveMic = !musicEngine.isDemoMode;
  useEffect(() => {
    if (!isLiveMic) return undefined;
    const raw = Math.max(0, Math.min(1, micLevel));
    const SILENCE_FLOOR = 0.008;
    const target = raw < SILENCE_FLOOR ? 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(Date.now() / 900)) : Math.pow(raw, 0.32);
    Animated.timing(micPulse, { toValue: target, duration: 70, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [micPulse, isLiveMic, micLevel]);

  useEffect(() => {
    if (isLiveMic) return undefined;
    micPulse.stopAnimation();
    if (!recognizing) {
      micPulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, { toValue: 1, duration: 620, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 0, duration: 620, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [micPulse, recognizing, isLiveMic]);

  useEffect(() => {
    signalScan.stopAnimation();
    if (!isActive) {
      signalScan.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(signalScan, {
        toValue: 1,
        duration: recognizing ? 760 : 1250,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, recognizing, signalScan]);

  const current = tracks[0];
  const detected = tracks.length;
  const kept = tracks.filter((tr) => tr.status === 'kept' || tr.status === 'already_saved').length;
  const pending = current?.status === 'pending';
  const alreadySaved = current?.status === 'already_saved';
  const currentVisibility: KeepVisibility = current?.visibility ?? 'PRIVATE';
  const destination = current?.existingMatch?.playlistName || current?.recommendations?.[0]?.playlistName || playlists[0]?.name || 'Mes découvertes';

  const finishSession = () => {
    setKeepChoiceOpen(false);
    requestEndSession();
  };

  const doKeep = async (entryId: string, playlistId: string | undefined, visibility: KeepVisibility) => {
    if (keepBusy) return;
    setKeepBusy(true);
    setKeepChoiceOpen(false);
    await keepTrack(entryId, playlistId, visibility);
    await refreshCreditBadge();
    setKeepBusy(false);
  };

  const openKeepChooser = () => {
    if (!current || alreadySaved || !pending || keepBusy) return;
    setKeepPlaylistId(current.recommendations?.[0]?.playlistId || playlists[0]?.id);
    setKeepChoiceOpen(true);
  };

  const toggleCurrentVisibility = async () => {
    if (!current || current.status !== 'kept' || privacyBusy) return;
    setPrivacyBusy(true);
    await setTrackVisibility(current.id, currentVisibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC');
    setPrivacyBusy(false);
  };

  const share = async () => {
    if (!current) return;
    await Share.share({ message: `${current.track.title} — ${current.track.artist} · découvert avec KEEP 🎵` });
  };

  if (!isActive) {
    return (
      <SafeAreaView style={s.container}>
        <TopBar navigation={navigation} planCode={planCode} creditRemaining={creditRemaining} creditUnlimited={creditUnlimited} />
        <View style={s.idle}>
          <SessionPulse active={false} />
          <Text style={s.idleTitle}>{screenCopy.emptyTitle ?? t('session.emptyTitle')}</Text>
          <Text style={s.idleSubtitle}>{screenCopy.emptySubtitle ?? t('session.emptySubtitle')}</Text>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={s.start} onPress={startSession} accessibilityLabel="Démarrer une écoute"><Text style={s.startText}>♪  ÉCOUTER</Text></TouchableOpacity>
          {musicEngine.isDemoMode ? <Text style={s.demo}>MODE DÉMO</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  const liveGlowOpacity = micPulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.85] });
  const liveGlowScale = micPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] });
  const topOpacity = signalScan.interpolate({ inputRange: [0, 0.16, 0.29, 1], outputRange: [0.15, 1, 0.15, 0.15] });
  const rightOpacity = signalScan.interpolate({ inputRange: [0, 0.22, 0.38, 0.52, 1], outputRange: [0.15, 0.15, 1, 0.15, 0.15] });
  const bottomOpacity = signalScan.interpolate({ inputRange: [0, 0.48, 0.64, 0.77, 1], outputRange: [0.15, 0.15, 1, 0.15, 0.15] });
  const leftOpacity = signalScan.interpolate({ inputRange: [0, 0.72, 0.88, 1], outputRange: [0.15, 0.15, 1, 0.15] });

  return (
    <SafeAreaView style={s.container}>
      <TopBar navigation={navigation} planCode={planCode} creditRemaining={creditRemaining} creditUnlimited={creditUnlimited} />

      <ScrollView style={s.main} contentContainerStyle={s.mainContent} showsVerticalScrollIndicator={false}>
        <View style={s.liveRow}><View style={s.liveDot} /><Text style={s.liveText}>{recognizing ? 'MICRO · ANALYSE' : 'MICRO · ACTIF'}</Text></View>

        <Animated.View style={[s.signalFrame, { transform: [{ scale: liveGlowScale }] }]}>
          <Animated.View pointerEvents="none" style={[s.signalGlow, { opacity: liveGlowOpacity }]} />
          <Animated.View pointerEvents="none" style={[s.signalTop, { opacity: topOpacity }]} />
          <Animated.View pointerEvents="none" style={[s.signalRight, { opacity: rightOpacity }]} />
          <Animated.View pointerEvents="none" style={[s.signalBottom, { opacity: bottomOpacity }]} />
          <Animated.View pointerEvents="none" style={[s.signalLeft, { opacity: leftOpacity }]} />
          <View style={s.stats}>
            <MiniStat value={elapsed} label="Durée" />
            <MiniStat value={String(detected)} label="Détectés" />
            <MiniStat value={String(kept)} label="Gardés" />
          </View>
        </Animated.View>

        {error ? <View style={s.errorBanner}><Text style={s.errorBannerText}>{error}</Text></View> : null}

        <Text style={s.sectionTitle}>MUSIQUE DÉTECTÉE</Text>

        {current ? (
          <SwipeDeck
            resetKey={current.id}
            enabled={Boolean(pending && !keepBusy)}
            onSwipeLeft={() => { if (current && pending) passTrack(current.id); }}
            onSwipeRight={openKeepChooser}
            leftLabel="PASSER"
            rightLabel="GARDER"
            hint="Swipe facultatif : ← passer · garder → · les boutons restent disponibles"
          >
            <View style={s.trackCard}>
              <View style={s.trackHead}>
                {current.track.artworkUrl ? <Image source={{ uri: current.track.artworkUrl }} style={s.cover} /> : <View style={[s.cover, s.coverFallback]}><Text style={s.coverK}>K</Text></View>}
                <View style={s.trackText}>
                  <Text style={s.trackTitle} numberOfLines={1}>{current.track.title}</Text>
                  <Text style={s.trackArtist} numberOfLines={1}>{current.track.artist}</Text>
                  <Text style={s.destination} numberOfLines={1}>→ {destination}</Text>
                </View>
              </View>
              {alreadySaved ? (
                <View style={s.saved}><Text style={s.savedText}>✓ Déjà dans ta playlist</Text></View>
              ) : current.status === 'kept' ? (
                <View style={s.keptState}>
                  <Text style={s.keptStateText}>✓ Gardé</Text>
                  <TouchableOpacity
                    style={[s.privacyPill, currentVisibility === 'PUBLIC' ? s.privacyPublic : s.privacyPrivate]}
                    onPress={() => { void toggleCurrentVisibility(); }}
                    disabled={privacyBusy}
                  >
                    <Text style={currentVisibility === 'PUBLIC' ? s.privacyPublicText : s.privacyPrivateText}>
                      {privacyBusy ? '…' : currentVisibility === 'PUBLIC' ? 'Public sur mon profil' : 'Privé'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : current.status === 'passed' ? (
                <View style={s.passedState}><Text style={s.passedStateText}>✕ Passé</Text></View>
              ) : (
                <View style={s.actions}>
                  <TouchableOpacity style={[s.action, s.pass, !pending && s.disabled]} onPress={() => current && passTrack(current.id)} disabled={!pending || keepBusy}><Text style={s.passText}>✕  {t('listen.pass')}</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.action, s.keep, (!pending || keepBusy) && s.disabled]} onPress={openKeepChooser} disabled={!pending || keepBusy}><Text style={s.keepText}>{keepBusy ? '…' : `♡  ${t('listen.keep')}`}</Text></TouchableOpacity>
                </View>
              )}
            </View>
          </SwipeDeck>
        ) : (
          <View style={s.waiting}><Text style={s.waitingText}>♫  {t('session.waitingForMusic')}</Text></View>
        )}
      </ScrollView>

      <View style={s.footerActions}>
        <TouchableOpacity style={s.secondary} onPress={share} disabled={!current}><Text style={s.secondaryText}>↗ Partager</Text></TouchableOpacity>
        <TouchableOpacity style={s.secondary} onPress={finishSession}><Text style={s.secondaryText}>{t('session.endNow')}</Text></TouchableOpacity>
      </View>

      <Modal visible={keepChoiceOpen} transparent animationType="fade" onRequestClose={() => setKeepChoiceOpen(false)}>
        <View style={s.modalOverlay}><View style={s.keepChoiceCard}>
          <Text style={s.modalTitle}>Garder ce morceau</Text>
          <Text style={s.modalBody}>Choisis ce que les autres verront. Tu pourras modifier ce choix plus tard dans Mes Sessions.</Text>
          {playlists.length > 1 ? (
            <View style={s.playlistChoices}>
              <Text style={s.choiceLabel}>DESTINATION</Text>
              <View style={s.playlistChoiceWrap}>
                {playlists.slice(0, 5).map((playlist) => {
                  const selected = keepPlaylistId === playlist.id;
                  return <TouchableOpacity key={playlist.id} style={[s.playlistChoice, selected && s.playlistChoiceOn]} onPress={() => setKeepPlaylistId(playlist.id)}><Text style={[s.playlistChoiceText, selected && s.playlistChoiceTextOn]} numberOfLines={1}>{playlist.name}</Text></TouchableOpacity>;
                })}
              </View>
            </View>
          ) : null}
          <TouchableOpacity style={[s.visibilityChoice, s.visibilityChoicePublic]} onPress={() => current && void doKeep(current.id, keepPlaylistId, 'PUBLIC')} disabled={keepBusy}>
            <Text style={s.visibilityChoiceTitlePublic}>PUBLIC SUR MON PROFIL</Text>
            <Text style={s.visibilityChoiceText}>Le morceau apparaîtra dans ton univers KEEP partagé.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.visibilityChoice, s.visibilityChoicePrivate]} onPress={() => current && void doKeep(current.id, keepPlaylistId, 'PRIVATE')} disabled={keepBusy}>
            <Text style={s.visibilityChoiceTitlePrivate}>GARDER EN PRIVÉ</Text>
            <Text style={s.visibilityChoiceText}>Le morceau reste dans ta bibliothèque et n’apparaît pas sur ton profil public.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelChoice} onPress={() => setKeepChoiceOpen(false)}><Text style={s.cancelChoiceText}>Annuler</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showEndPrompt} transparent animationType="fade">
        <View style={s.modalOverlay}><View style={s.modalCard}>
          <Text style={s.modalTitle}>{t('session.endPromptTitle')}</Text>
          <Text style={s.modalBody}>{t('session.endPromptBody')}</Text>
          <View style={s.modalActions}>
            <TouchableOpacity style={s.modalBtn} onPress={dismissEndPrompt}><Text style={s.modalBtnText}>{t('session.continueListening')}</Text></TouchableOpacity>
            <TouchableOpacity style={[s.modalBtn, s.modalEnd]} onPress={finishSession}><Text style={s.modalEndText}>{t('session.endNow')}</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

function TopBar({ navigation, planCode, creditRemaining, creditUnlimited }: any) {
  const isPaidPlan = planCode && planCode !== 'FREE';
  const creditsExhausted = !creditUnlimited && creditRemaining === 0;
  const paidLabel = planCode === 'PREMIUM' ? '♛ Premium' : planCode === 'CREATOR_PRO' ? 'Creator Pro' : planCode === 'VENUE_PRO' ? 'Venue Pro' : planCode;
  const freeLabel = creditRemaining == null ? 'FREE' : `FREE · ${creditRemaining}`;
  return <View style={s.topBar}>
    <TouchableOpacity style={s.round} onPress={() => navigation.navigate('SessionHistory')}><Text style={s.roundText}>☰</Text></TouchableOpacity>
    <Text style={s.brand}>KEEP</Text>
    <TouchableOpacity
      style={[s.premium, isPaidPlan ? s.planPaid : creditsExhausted ? s.planExhausted : s.planFree]}
      onPress={() => navigation.navigate('Offers', { focusPlan: isPaidPlan ? planCode : 'PREMIUM', sourceFeature: 'LISTEN_PLAN_BADGE' })}
      accessibilityLabel="Voir mon offre KEEP"
    >
      <Text style={[s.premiumText, !isPaidPlan && (creditsExhausted ? s.planExhaustedText : s.planFreeText)]}>{isPaidPlan ? paidLabel : freeLabel}</Text>
    </TouchableOpacity>
  </View>;
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return <View style={s.miniStat}><Text style={s.miniValue}>{value}</Text><Text style={s.miniLabel}>{label}</Text></View>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  round: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#120D1B' },
  roundText: { color: C.text, fontSize: 17 },
  brand: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: 5 },
  premium: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  planFree: { borderColor: '#2C8A60', backgroundColor: 'rgba(104,242,177,0.12)' },
  planFreeText: { color: C.green },
  planExhausted: { borderColor: '#B94B62', backgroundColor: 'rgba(255,95,131,0.12)' },
  planExhaustedText: { color: C.pink },
  planPaid: { borderColor: '#382559', backgroundColor: '#171023' },
  premiumText: { color: C.purpleLight, fontSize: 10, fontWeight: '800' },
  idle: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  idleTitle: { color: C.text, fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.6, textAlign: 'center', maxWidth: 340, marginTop: 6 },
  idleSubtitle: { color: '#C9C1D2', fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0.1, textAlign: 'center', maxWidth: 330, marginTop: 6, marginBottom: 14 },
  start: { minWidth: 220, minHeight: 52, borderRadius: 26, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: .6 },
  demo: { marginTop: 10, color: C.purpleLight, fontSize: 10, fontWeight: '800' },
  error: { color: C.pink, fontSize: 12, textAlign: 'center', marginBottom: 10 },
  main: { flex: 1 },
  mainContent: { paddingHorizontal: 14, paddingBottom: 8 },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2, marginBottom: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 6 },
  liveText: { color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  signalFrame: { position: 'relative', borderRadius: 13, padding: 3, backgroundColor: 'rgba(21,16,32,0.75)', overflow: 'hidden' },
  signalGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 13, borderWidth: 1.5, borderColor: C.green },
  signalTop: { position: 'absolute', left: 16, right: 16, top: 0, height: 2, borderRadius: 2, backgroundColor: C.purpleLight },
  signalRight: { position: 'absolute', right: 0, top: 10, bottom: 10, width: 2, borderRadius: 2, backgroundColor: C.green },
  signalBottom: { position: 'absolute', left: 16, right: 16, bottom: 0, height: 2, borderRadius: 2, backgroundColor: C.purpleLight },
  signalLeft: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 2, borderRadius: 2, backgroundColor: C.green },
  stats: { flexDirection: 'row', gap: 7 },
  miniStat: { flex: 1, height: 48, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(49,35,72,0.78)', backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  miniValue: { color: C.text, fontSize: 14, fontWeight: '800' },
  miniLabel: { color: C.muted, fontSize: 9, marginTop: 1 },
  errorBanner: { marginTop: 7, minHeight: 34, borderRadius: 8, borderWidth: 1, borderColor: C.pink, justifyContent: 'center', paddingHorizontal: 10 },
  errorBannerText: { color: C.pink, fontSize: 11, textAlign: 'center' },
  sectionTitle: { color: C.text, fontSize: 12, fontWeight: '900', letterSpacing: 1, marginTop: 9, marginBottom: 6 },
  trackCard: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 14, padding: 10 },
  trackHead: { flexDirection: 'row', alignItems: 'center' },
  cover: { width: 58, height: 58, borderRadius: 10, marginRight: 10 },
  coverFallback: { backgroundColor: '#25183A', alignItems: 'center', justifyContent: 'center' },
  coverK: { color: C.purpleLight, fontSize: 24, fontWeight: '900' },
  trackText: { flex: 1 },
  trackTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  trackArtist: { color: C.muted, fontSize: 12, marginTop: 2 },
  destination: { color: C.purpleLight, fontSize: 10, marginTop: 5 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 9 },
  action: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pass: { borderWidth: 1, borderColor: C.pink, backgroundColor: 'rgba(255,95,131,0.08)' },
  keep: { backgroundColor: C.yellow },
  passText: { color: C.pink, fontSize: 13, fontWeight: '900' },
  keepText: { color: '#19150A', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  saved: { minHeight: 42, marginTop: 9, borderRadius: 10, backgroundColor: 'rgba(104,242,177,0.10)', alignItems: 'center', justifyContent: 'center' },
  savedText: { color: C.green, fontWeight: '800', fontSize: 12 },
  keptState: { minHeight: 46, marginTop: 9, borderRadius: 10, backgroundColor: 'rgba(104,242,177,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, gap: 8 },
  keptStateText: { color: C.green, fontSize: 12, fontWeight: '900' },
  privacyPill: { minHeight: 28, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  privacyPublic: { borderColor: C.green, backgroundColor: 'rgba(104,242,177,0.12)' },
  privacyPrivate: { borderColor: C.line, backgroundColor: '#120D1B' },
  privacyPublicText: { color: C.green, fontSize: 10, fontWeight: '800' },
  privacyPrivateText: { color: C.muted, fontSize: 10, fontWeight: '800' },
  passedState: { minHeight: 42, marginTop: 9, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,95,131,0.38)', backgroundColor: 'rgba(255,95,131,0.06)', alignItems: 'center', justifyContent: 'center' },
  passedStateText: { color: C.pink, fontSize: 12, fontWeight: '900' },
  waiting: { minHeight: 88, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  waitingText: { color: C.muted, fontSize: 12, textAlign: 'center' },
  footerActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: C.line },
  secondary: { flex: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: C.line, backgroundColor: '#120D1B', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: C.text, fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, padding: 20 },
  keepChoiceCard: { width: '100%', maxWidth: 380, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, padding: 18 },
  modalTitle: { color: C.text, fontSize: 19, fontWeight: '900' },
  modalBody: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 8 },
  playlistChoices: { marginTop: 15 },
  choiceLabel: { color: C.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 7 },
  playlistChoiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  playlistChoice: { minHeight: 32, maxWidth: '100%', paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: '#120D1B', alignItems: 'center', justifyContent: 'center' },
  playlistChoiceOn: { borderColor: C.purpleLight, backgroundColor: 'rgba(139,92,246,0.18)' },
  playlistChoiceText: { color: C.muted, fontSize: 10, fontWeight: '700', maxWidth: 140 },
  playlistChoiceTextOn: { color: C.purpleLight },
  visibilityChoice: { minHeight: 58, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, marginTop: 10, justifyContent: 'center', borderWidth: 1 },
  visibilityChoicePublic: { borderColor: C.green, backgroundColor: 'rgba(104,242,177,0.08)' },
  visibilityChoicePrivate: { borderColor: C.line, backgroundColor: '#120D1B' },
  visibilityChoiceTitlePublic: { color: C.green, fontSize: 11, fontWeight: '900' },
  visibilityChoiceTitlePrivate: { color: C.text, fontSize: 11, fontWeight: '900' },
  visibilityChoiceText: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  cancelChoice: { minHeight: 38, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  cancelChoiceText: { color: C.muted, fontSize: 11, fontWeight: '800' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  modalBtn: { flex: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { color: C.text, fontSize: 12, fontWeight: '800' },
  modalEnd: { backgroundColor: C.pink, borderColor: C.pink },
  modalEndText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
