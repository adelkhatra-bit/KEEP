import React from 'react';
import { DataMode } from '../lib/useLiveOrDemo';

/**
 * Bannière d'état honnête pour chaque page Super Admin -- dit toujours la
 * vérité sur l'origine des données affichées (voir lib/useLiveOrDemo.ts).
 * Ne jamais afficher "connecté" si la requête réelle a échoué.
 */
export default function DataModeBanner({
  mode,
  loading,
  reason,
  demoNote,
}: {
  mode: DataMode;
  loading: boolean;
  reason?: string;
  demoNote: string;
}) {
  if (loading) {
    return <div className="demo-banner">⏳ Connexion au backend KEEP…</div>;
  }
  if (mode === 'live') {
    return <div className="live-banner">🟢 CONNECTÉ — données réelles lues depuis le backend KEEP.</div>;
  }
  return (
    <div className="demo-banner">
      🎭 MODE DÉMO — {demoNote}
      {reason && <><br />Backend réel non disponible : {reason}</>}
    </div>
  );
}
