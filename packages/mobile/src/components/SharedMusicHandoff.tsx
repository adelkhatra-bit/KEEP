import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useShareIntentContext } from 'expo-share-intent';
import { buildSharedMusicSource } from '../services/sharedMusicSourceService';
import { resolveSharedMusicLink, useSharedMusicImportStore } from '../services/sharedMusicImportService';
import KeepModal from './KeepModal';
import { claimPendingReferral, sharedProfileUsernameFromUrl, stageReferralFromUrl } from '../services/referralService';
import { navigateToSharedProfile } from '../navigation/navigationRef';
import { supabase } from '../services/supabaseClient';
import { endWebShareVisit, isWebShareVisit, webShareVisitUsername } from '../services/webShareVisitor';
import { useUserStore } from '../store/useUserStore';

// Le partage système importe des métadonnées, jamais une décision GARDER.
export function clearConsumedShareParams() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('u') && !url.searchParams.has('share')) return;
    url.searchParams.delete('u');
    url.searchParams.delete('share');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // adresse illisible : on laisse le navigateur tel quel
  }
}

export default function SharedMusicHandoff() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const handledRef = useRef('');
  const importBusyRef = useRef(false);
  const alive = useRef(true);
  const [pendingUrl, setPendingUrl] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const message = useSharedMusicImportStore((state) => state.message);
  const messageOwnerId = useSharedMusicImportStore((state) => state.ownerId);
  const userId = useUserStore((state) => state.user?.id);
  const demo = useUserStore((state) => state.isDemoMode);
  const guest = useUserStore((state) => state.isLocalGuest);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => useSharedMusicImportStore.getState().clearMessage(), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  const importLink = async (url: string) => {
    if (importBusyRef.current) return;
    importBusyRef.current = true;
    setPendingUrl(url); setImportBusy(true); setImportError('');
    try {
      await resolveSharedMusicLink(url);
      if (alive.current) setPendingUrl('');
    } catch (e) {
      if (alive.current) setImportError((e as Error).message);
    } finally {
      importBusyRef.current = false;
      if (alive.current) setImportBusy(false);
    }
  };

  // Profile/referral deep links must keep their attribution even when iOS/Android
  // hands the URL directly to the already-running app. Navigation consumes the
  // profile path; this listener only persists/claims the referral context.
  useEffect(() => {
    let alive = true;
    const stage = async (url?: string | null) => {
      if (!alive || !url) return;
      const code = await stageReferralFromUrl(url).catch(() => '');
      if (code) await claimPendingReferral().catch(() => false);
      // Adel (08/09/2026) : "il peut Swiper les musiques" -- un lien de
      // partage ouvert dans un navigateur (fallback web de share-profile.html,
      // ou tout lien `?u=...&share=...` reçu directement) doit rouvrir le
      // vrai profil swipeable, pas retomber sur l'écran d'accueil générique.
      const sharedUsername = sharedProfileUsernameFromUrl(url);
      // Visiteur web d'un lien partagé qui rafraîchit la page : l'adresse n'a plus ?u=, on le ramène sur le profil partagé.
      if (!sharedUsername && isWebShareVisit() && useUserStore.getState().isLocalGuest) {
        navigateToSharedProfile(webShareVisitUsername());
        return;
      }
      if (sharedUsername) {
        navigateToSharedProfile(sharedUsername);
        // Adel (29/09/2026) : « à chaque fois ça remet sur le profil, c'est
        // difficile d'aller se connecter ». Le lien ne sert qu'UNE fois :
        // on retire ?u= / &share= de l'adresse (le parrainage est déjà
        // mémorisé plus haut), sinon chaque rechargement ou retour après
        // connexion renvoyait de force sur ce profil.
        clearConsumedShareParams();
      }
    };
    void Linking.getInitialURL().then(stage).catch(() => {});
    const linkSub = Linking.addEventListener('url', ({ url }) => { void stage(url); });
    const authSub = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (event === 'SIGNED_IN') endWebShareVisit();
        void claimPendingReferral().catch(() => false);
      }
    });
    return () => {
      alive = false;
      linkSub.remove();
      authSub?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasShareIntent) { handledRef.current = ''; return; }
    const source = buildSharedMusicSource({
      webUrl: shareIntent?.webUrl,
      text: shareIntent?.text,
      title: shareIntent?.meta?.title,
    });
    if (!source) {
      resetShareIntent();
      return;
    }
    if (importBusyRef.current) return;

    const fingerprint = `${source.url}|${source.rawText ?? ''}|${source.title ?? ''}`;
    if (handledRef.current === fingerprint) return;
    handledRef.current = fingerprint;

    void importLink(source.url);
    resetShareIntent();
  }, [hasShareIntent, importBusy, resetShareIntent, shareIntent]);

  return <>
    {message && messageOwnerId === userId && !demo && !guest ? <View pointerEvents="none" style={s.toast} testID="shared-music-import-toast" accessibilityLiveRegion="polite"><Text style={s.text}>{message}</Text></View> : null}
    <KeepModal visible={Boolean(pendingUrl)} transparent animationType="fade" onRequestClose={() => { if (!importBusy) setPendingUrl(''); }}>
      <View style={s.overlay}><View style={s.modal} testID="shared-music-handoff">
        <Text style={s.title}>Musique partagée</Text>
        {importBusy ? <ActivityIndicator color="#FFFFFF" accessibilityLabel="Ajout de la musique" /> : null}
        {importError ? <Text style={s.text} accessibilityRole="alert" testID="shared-music-handoff-error">{importError}</Text> : null}
        {importError ? <TouchableOpacity style={s.button} disabled={importBusy} testID="shared-music-handoff-retry" onPress={() => { void importLink(pendingUrl); }}><Text style={s.text}>Réessayer</Text></TouchableOpacity> : null}
        <TouchableOpacity style={s.button} disabled={importBusy} onPress={() => setPendingUrl('')}><Text style={s.text}>Fermer</Text></TouchableOpacity>
      </View></View>
    </KeepModal>
  </>;
}

const s = StyleSheet.create({
  toast: { position: 'absolute', top: 96, right: 12, left: 12, backgroundColor: '#29213D', padding: 14, borderRadius: 14, zIndex: 80, elevation: 80, alignItems: 'center' },
  text: { color: '#FFFFFF', fontSize: 14, lineHeight: 21 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  button: { minHeight: 48, minWidth: 48, marginTop: 12, padding: 12, backgroundColor: '#29213D', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', padding: 16, alignItems: 'center', justifyContent: 'center' },
  modal: { width: '100%', maxWidth: 560, backgroundColor: '#171222', padding: 20, borderRadius: 18 },
});
