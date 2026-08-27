import { useEffect, useRef } from 'react';
import { useShareIntentContext } from 'expo-share-intent';
import { useSessionStore } from '../store/useSessionStore';
import { buildSharedMusicSource, setSharedMusicSource } from '../services/sharedMusicSourceService';

/**
 * TikTok / Instagram / Snapchat / YouTube -> Partager -> KEEP.
 *
 * Aucun écran intermédiaire : KEEP reçoit le lien, démarre l'écoute si besoin,
 * mémorise la provenance et laisse le moteur micro reconnaître le morceau.
 * L'utilisateur ne colle rien et ne recopie aucun lien.
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

    const fingerprint = `${source.url}|${source.sharedAt.slice(0, 16)}`;
    if (handledRef.current === fingerprint) return;
    handledRef.current = fingerprint;

    const session = useSessionStore.getState();
    if (!session.isActive) session.startSession();
    // startSession nettoie toute ancienne provenance ; on pose donc la nouvelle
    // source juste après. Le prochain KEEP de cette session portera cette source.
    void setSharedMusicSource(source).finally(() => resetShareIntent());
  }, [hasShareIntent, resetShareIntent, shareIntent]);

  return null;
}
