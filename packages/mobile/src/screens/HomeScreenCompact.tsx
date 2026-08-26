import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Modal, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../store/useSessionStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useUserStore } from '../store/useUserStore';
import { musicEngine } from '../services/musicEngine';
import SessionPulse from '../components/SessionPulse';
import { loadSessionScreenCopy, loadCurrentPlanCode } from '../services/planService';

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
  const { isActive, tracks, showEndPrompt, startedAt, error, recognizing, micLevel, startSession, requestEndSession, dismissEndPrompt, keepTrack, passTrack } = useSessionStore();
  const { playlists, refresh } = usePlaylistStore();
  const user = useUserStore((s) => s.user);
  const [elapsed, setElapsed] = useState(formatElapsed(startedAt));
  const micPulse = useRef(new Animated.Value(0)).current;
  const [screenCopy, setScreenCopy] = useState<{ emptyTitle: string | null; emptySubtitle: string | null }>({ emptyTitle: null, emptySubtitle: null });
  // BUG RÉEL trouvé le 26/08/2026 (Adel, test réel : "comment ça se fait
  // quand je suis en premium ? tout à l'heure j'étais en free") : ce badge
  // affichait "♛ Premium" en dur, sans jamais lire le vrai plan -- alors que
  // packages/mobile/src/screens/ProfilePublicScreen.tsx charge déjà le VRAI
  // plan via loadCurrentPlanCode (table subscriptions/plans réelle). Même
  // pattern réutilisé ici, jamais une deuxième logique de plan.
  const [planCode, setPlanCode] = useState('FREE');

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { loadSessionScreenCopy().then(setScreenCopy).catch(() => {}); }, []);
  useEffect(() => {
    let live = true;
    if (user && !musicEngine.isDemoMode) loadCurrentPlanCode(user.id).then((code) => live && setPlanCode(code || 'FREE')).catch(() => live && setPlanCode('FREE'));
    return () => { live = false; };
  }, [user?.id]);
  useEffect(() => {
    if (!isActive) return;
    setElapsed(formatElapsed(startedAt));
    const timer = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [isActive, startedAt]);

  // BUG RÉEL trouvé le 26/08/2026 (Adel, test réel : "l'animation qui suit le
  // micro" toujours pas branchée) : ce composant (HomeScreenCompact, celui
  // réellement affiché sur cette branche -- l'ancien HomeScreen.tsx n'est plus
  // utilisé) avait sa propre boucle décorative à durée fixe (620ms), jamais
  // reliée à `micLevel` (le niveau micro réel déjà calculé en continu par
  // useSessionStore/micCapture.ts, voir le fix précédent). Remplacé par une
  // réaction RÉELLE au niveau micro -- jamais une activité inventée.
  // Réglage du 26/08/2026 (Adel, test réel : "ça détecte pas assez sensible,
  // ça bouge pas assez") -- réappliqué après un merge avec des commits Codex
  // qui avaient réintroduit sans le vouloir les anciennes valeurs (0.02/sqrt) :
  // seuil de silence abaissé (0.008) et amplification en ^0.32 pour que les
  // niveaux réels faibles (0.03-0.08) produisent un mouvement visible.
  const isLiveMic = !musicEngine.isDemoMode;
  useEffect(() => {
    if (!isLiveMic) return undefined; // Mode Démo -- pas de vrai niveau micro, voir boucle décorative ci-dessous.
    const raw = Math.max(0, Math.min(1, micLevel));
    const SILENCE_FLOOR = 0.008;
    const target = raw < SILENCE_FLOOR ? 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(Date.now() / 900)) : Math.pow(raw, 0.32);
    Animated.timing(micPulse, { toValue: target, duration: 70, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [micPulse, isLiveMic, micLevel]);

  useEffect(() => {
    if (isLiveMic) return undefined; // Niveau réel géré ci-dessus -- jamais les deux logiques en même temps.
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

  const current = tracks[0];
  const detected = tracks.length;
  const kept = tracks.filter((tr) => tr.status === 'kept' || tr.status === 'already_saved').length;
  const pending = current?.status === 'pending';
  const alreadySaved = current?.status === 'already_saved';
  const destination = current?.existingMatch?.playlistName || current?.recommendations?.[0]?.playlistName || playlists[0]?.name || 'Mes découvertes';

  const finishSession = () => {
    // L'arrêt doit être immédiat et ne jamais faire disparaître la barre des
    // cinq onglets. requestEndSession() coupe les timers + Audio.Recording,
    // archive la session si elle contient des morceaux puis remet isActive à
    // false. Le récap reste consultable depuis l'historique, mais n'est plus
    // imposé comme écran intermédiaire.
    requestEndSession();
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
        <TopBar navigation={navigation} planCode={planCode} />
        <View style={s.idle}>
          <SessionPulse active={false} />
          <Text style={s.idleTitle}>{screenCopy.emptyTitle ?? t('session.emptyTitle')}</Text>
          <Text style={s.idleSubtitle}>{screenCopy.emptySubtitle ?? t('session.emptySubtitle')}</Text>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={s.start} onPress={startSession}><Text style={s.startText}>♪  {t('session.start')}</Text></TouchableOpacity>
          {musicEngine.isDemoMode ? <Text style={s.demo}>MODE DÉMO</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  // 1.20 (pas 1.32, pas l'original 1.14) -- réappliqué après le merge avec
  // Codex : assez réactif pour un vrai son, sans chevaucher "Micro actif"
  // sous le cercle (voir marginTop:6 de liveRow ci-dessous).
  const pulseScale = micPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
  const pulseOpacity = micPulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 0.05] });

  return (
    <SafeAreaView style={s.container}>
      <TopBar navigation={navigation} planCode={planCode} />

      {/* BUG RÉEL trouvé le 26/08/2026 (Adel, test réel : "quand je suis sur
          l'écoute, on ne voit pas les boutons du bas") : tout le contenu
          (radar, stats, morceau détecté) vivait dans un seul <View flex:1>
          sans ScrollView -- sur un écran réel plus petit que le simulateur,
          "Partager"/"Terminer la session" se retrouvaient poussés hors de
          l'écran, sans aucun moyen de les atteindre. Fix : le contenu
          variable scrolle, les actions restent fixées en bas, TOUJOURS
          visibles -- "Terminer la session" est une action critique, jamais
          quelque chose à devoir chercher en scrollant. */}
      <ScrollView style={s.main} contentContainerStyle={s.mainContent} showsVerticalScrollIndicator={false}>
        <View style={s.radarWrap}>
          <View style={s.radarOuter}>
            <Animated.View pointerEvents="none" style={[s.micPulse, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
            <View style={s.radarInner}><Text style={s.note}>♫</Text><Text style={s.radarTitle}>EN ÉCOUTE</Text></View>
          </View>
          <View style={s.liveRow}><View style={s.liveDot} /><Text style={s.liveText}>{recognizing ? 'Micro actif · analyse en cours' : 'Session active'}</Text></View>
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
      </ScrollView>

      <View style={s.footerActions}>
        <TouchableOpacity style={s.secondary} onPress={share} disabled={!current}><Text style={s.secondaryText}>↗ Partager</Text></TouchableOpacity>
        <TouchableOpacity style={s.secondary} onPress={finishSession}><Text style={s.secondaryText}>{t('session.endNow')}</Text></TouchableOpacity>
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

function TopBar({ navigation, planCode }: any) {
  const isPaidPlan = planCode && planCode !== 'FREE';
  return <View style={s.topBar}>
    <TouchableOpacity style={s.round} onPress={() => navigation.navigate('SessionHistory')}><Text style={s.roundText}>☰</Text></TouchableOpacity>
    <Text style={s.brand}>KEEP</Text>
    <View style={s.premium}><Text style={s.premiumText}>{isPaidPlan ? '♛ Premium' : 'Free'}</Text></View>
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
  // BUG RÉEL trouvé le 26/08/2026 (Adel, test réel : "cette phrase remonte un
  // peu plus haut") -- justifyContent:'center' centrait tout le bloc au
  // milieu de l'espace disponible, ce qui pousse visuellement le titre/sous-
  // titre trop bas sur un écran haut. flex-start + paddingTop remonte le
  // contenu sans le coller au TopBar.
  idle: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20 },
  idleTitle: { color: C.text, fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.6, textAlign: 'center', maxWidth: 340, marginTop: 18 },
  idleSubtitle: { color: '#C9C1D2', fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0.1, textAlign: 'center', maxWidth: 330, marginTop: 10, marginBottom: 22 },
  start: { minWidth: 220, minHeight: 52, borderRadius: 26, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  demo: { marginTop: 10, color: C.purpleLight, fontSize: 10, fontWeight: '800' },
  error: { color: C.pink, fontSize: 12, textAlign: 'center', marginBottom: 10 },
  main: { flex: 1 },
  mainContent: { paddingHorizontal: 14, paddingBottom: 8 },
  radarWrap: { alignItems: 'center', marginTop: 2 },
  radarOuter: { width: 138, height: 138, borderRadius: 69, borderWidth: 1, borderColor: '#6339A6', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.10)' },
  micPulse: { ...StyleSheet.absoluteFillObject, borderRadius: 69, borderWidth: 2, borderColor: C.purpleLight },
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
  footerActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: C.line },
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