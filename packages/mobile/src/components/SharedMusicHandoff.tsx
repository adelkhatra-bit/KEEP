import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useShareIntentContext } from 'expo-share-intent';
import { useSessionStore } from '../store/useSessionStore';
import { buildSharedMusicSource, setSharedMusicSource } from '../services/sharedMusicSourceService';
import { resolveKeylessSocialMusic } from '../services/keylessSocialRecognition';
import { ingestExternalRecognition } from '../services/externalRecognitionIngest';

/**
 * TikTok / Instagram / Snapchat / YouTube -> Partager -> KEEP.
 *
 * Aucun écran intermédiaire : KEEP reçoit le lien, ouvre Écouter, démarre la
 * session si besoin et mémorise la provenance. En parallèle, un resolver sans
 * clé tente les métadonnées publiques + catalogues publics. Le micro et les
 * moteurs AudD/ACRCloud restent actifs : les voies se complètent au lieu de se
 * remplacer.
 */
export default function SharedMusicHandoff() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const handledRef = useRef('');

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
