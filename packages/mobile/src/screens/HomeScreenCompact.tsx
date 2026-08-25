import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, SafeAreaView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../store/useSessionStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { musicEngine } from '../services/musicEngine';
import SessionPulse from '../components/SessionPulse';

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
  const { isActive, tracks, showEndPrompt, startedAt, error, startSession, requestEndSession, dismissEndPrompt, keepTrack, passTrack } = useSessionStore();
  const { playlists, refresh } = usePlaylistStore();
  const [elapsed, setElapsed] = useState(formatElapsed(startedAt));

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!isActive) return;
    setElapsed(formatElapsed(startedAt));
    const timer = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [isActive, startedAt]);

  const current = tracks[0];
  const detected = tracks.length;
  const kept = tracks.filter((tr) => tr.status === 'kept' || tr.status === 'already_saved').length;
  const pending = current?.status === 'pending';
  const alreadySaved = current?.status === 'already_saved';
  const destination = current?.existingMatch?.playlistName || current?.recommendations?.[0]?.playlistName || playlists[0]?.name || 'Mes découvertes';

  const finishSession = () => {
    const sessionId = requestEndSession();
    if (sessionId) navigation.navigate('SessionRecap', { sessionId });
    else Alert.alert(t('session.endNow'), t('session.emptySessionEnded'));
  };

  const keep = () => {
    if (!current || alreadySaved) return;
    if (playlists.length <= 1) return keepTrack(current.id);
    Alert.alert(t('session.chooseDestination'), undefined, playlists.map((p) => ({ text: p.name, onPress: () => keepTrack(current.id, p.id) })));
  };

  const share = async () => {
    if (!current) return;
    await Share.share({ message: `${current.track.title} — ${current.track.artist} · découvert avec KEEP 🎵` });
  };

  if (!isActive) {
    return (
      <SafeAreaView style={s.container}>
        <TopBar navigation={navigation} />
        <View style={s.idle}>
          <SessionPulse active={false} />
          <Text style={s.idleTitle}>{t('session.emptyTitle')}</Text>
          <Text style={s.idleSubtitle}>{t('session.emptySubtitle')}</Text>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={s.start} onPress={startSession}><Text style={s.startText}>♪  {t('session.start')}</Text></TouchableOpacity>
          {musicEngine.isDemoMode ? <Text style={s.demo}>MODE DÉMO</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <TopBar navigation={navigation} />

      <View style={s.main}>
        <View style={s.radarWrap}>
          <View style={s.radarOuter}><View style={s.radarInner}><Text style={s.note}>♫</Text><Text style={s.radarTitle}>EN ÉCOUTE</Text></View></View>
          <View style={s.liveRow}><View style={s.liveDot} /><Text style={s.liveText}>Session active</Text></View>
        </View>

        <View style={s.stats}>
          <MiniStat value={elapsed} label="Durée" />
          <MiniStat value={String(detected)} label="Détectés" />
          <MiniStat value={String(kept)} label="Gardés" />
        </View>

        {error ? <View style={s.errorBanner}><Text style={s.errorBannerText}>{error}</Text></View> : null}

        <Text style={s.sectionTitle}>MUSIQUE DÉTECTÉE</Text>

        {current ? (
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
            ) : (
              <View style={s.actions}>
                <TouchableOpacity style={[s.action, s.pass, !pending && s.disabled]} onPress={() => current && passTrack(current.id)} disabled={!pending}><Text style={s.passText}>✕  {t('listen.pass')}</Text></TouchableOpacity>
                <TouchableOpacity style={[s.action, s.keep, !pending && s.disabled]} onPress={keep} disabled={!pending}><Text style={s.keepText}>♡  {t('listen.keep')}</Text></TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={s.waiting}><Text style={s.waitingText}>♫  {t('session.waitingForMusic')}</Text></View>
        )}

        <View style={s.footerActions}>
          <TouchableOpacity style={s.secondary} onPress={share} disabled={!current}><Text style={s.secondaryText}>↗ Partager</Text></TouchableOpacity>
          <TouchableOpacity style={s.secondary} onPress={finishSession}><Text style={s.secondaryText}>{t('session.endNow')}</Text></TouchableOpacity>
        </View>
      </View>

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

function TopBar({ navigation }: any) {
  return <View style={s.topBar}>
    <TouchableOpacity style={s.round} onPress={() => navigation.navigate('SessionHistory')}><Text style={s.roundText}>☰</Text></TouchableOpacity>
    <Text style={s.brand}>KEEP</Text>
    <View style={s.premium}><Text style={s.premiumText}>♛ Premium</Text></View>
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
  premium: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#382559', backgroundColor: '#171023' },
  premiumText: { color: C.purpleLight, fontSize: 10, fontWeight: '800' },
  idle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 20 },
  idleTitle: { color: C.text, fontSize: 25, fontWeight: '800', textAlign: 'center', marginTop: 18 },
  idleSubtitle: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 7, marginBottom: 20 },
  start: { minWidth: 220, minHeight: 52, borderRadius: 26, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  demo: { marginTop: 10, color: C.purpleLight, fontSize: 10, fontWeight: '800' },
  error: { color: C.pink, fontSize: 12, textAlign: 'center', marginBottom: 10 },
  main: { flex: 1, paddingHorizontal: 14, paddingBottom: 8 },
  radarWrap: { alignItems: 'center', marginTop: 2 },
  radarOuter: { width: 138, height: 138, borderRadius: 69, borderWidth: 1, borderColor: '#6339A6', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.10)' },
  radarInner: { width: 104, height: 104, borderRadius: 52, borderWidth: 2, borderColor: '#A884FA', backgroundColor: '#6D35CF', alignItems: 'center', justifyContent: 'center' },
  note: { color: '#fff', fontSize: 26 },
  radarTitle: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginTop: 2 },
  liveRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green, marginRight: 6 },
  liveText: { color: C.green, fontSize: 12, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 7, marginTop: 9 },
  miniStat: { flex: 1, height: 46, borderRadius: 11, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
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
  waiting: { minHeight: 88, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  waitingText: { color: C.muted, fontSize: 12, textAlign: 'center' },
  footerActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  secondary: { flex: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: C.line, backgroundColor: '#120D1B', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: C.text, fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, padding: 20 },
  modalTitle: { color: C.text, fontSize: 19, fontWeight: '900' },
  modalBody: { color: C.muted, fontSize: 13, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  modalBtn: { flex: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { color: C.text, fontSize: 12, fontWeight: '800' },
  modalEnd: { backgroundColor: C.pink, borderColor: C.pink },
  modalEndText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
