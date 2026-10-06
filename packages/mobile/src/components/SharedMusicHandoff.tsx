import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useShareIntentContext } from 'expo-share-intent';
import { useSessionStore } from '../store/useSessionStore';
import { buildSharedMusicSource, setSharedMusicSource } from '../services/sharedMusicSourceService';
import { resolveKeylessSocialMusic } from '../services/keylessSocialRecognition';
import { ingestExternalRecognition } from '../services/externalRecognitionIngest';
import { claimPendingReferral, sharedProfileUsernameFromUrl, stageReferralFromUrl } from '../services/referralService';
import { navigateToSharedProfile } from '../navigation/navigationRef';
import { supabase } from '../services/supabaseClient';
import { endWebShareVisit, isWebShareVisit, webShareVisitUsername } from '../services/webShareVisitor';
import { useUserStore } from '../store/useUserStore';

/**
 * TikTok / Instagram / Snapchat / YouTube -> Partager -> Loki.
 *
 * Aucun écran intermédiaire : Loki reçoit le lien, ouvre Écouter, démarre la
 * session si besoin et mémorise la provenance. En parallèle, un resolver sans
 * clé tente les métadonnées publiques + catalogues publics. Le micro et les
 * moteurs AudD/ACRCloud restent actifs : les voies se complètent au lieu de se
 * remplacer.
 */
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
    if (!hasShareIntent) return;
    const source = buildSharedMusicSource({
      webUrl: shareIntent?.webUrl,
      text: shareIntent?.text,
      title: shareIntent?.meta?.title,
    });
    if (!source) {
      resetShareIntent();
      return;
    }

    const fingerprint = `${source.url}|${source.rawText ?? ''}|${source.title ?? ''}`;
    if (handledRef.current === fingerprint) return;
    handledRef.current = fingerprint;

    const session = useSessionStore.getState();
    if (!session.isActive) session.startSession();

    // Le stockage de provenance est sérialisé : même si startSession nettoie
    // l'ancienne source au même instant, ce partage-ci gagne toujours la course.
    void setSharedMusicSource(source).finally(() => resetShareIntent());

    // Fallback sans clé : un résultat n'est injecté que si le serveur a obtenu
    // une confiance suffisante. En cas de blocage de la plateforme, aucun faux
    // morceau n'est créé et la reconnaissance micro continue normalement.
    void resolveKeylessSocialMusic(source).then((recognition) => {
      if (!recognition) return;
      return ingestExternalRecognition(recognition);
    }).catch(() => {});

    // La navigation possède déjà le deep-link Main/Listen. On le réutilise au
    // lieu de toucher à Navigation.tsx ou à la barre validée des 5 onglets.
    void Linking.openURL('keep://Main/Listen').catch(() => {});
  }, [hasShareIntent, resetShareIntent, shareIntent]);

  return null;
}
