import { Alert as RNAlert, Platform } from 'react-native';
import { useAlertStore } from '../store/useAlertStore';

type AlertButtonStyle = 'default' | 'cancel' | 'destructive';
type AlertButton = { text?: string; onPress?: () => void; style?: AlertButtonStyle };

/**
 * BUG REEL trouve en test reel (31/08/2026, retour Adel : "je swipe/tape sur
 * Ecouter pendant la session, le son ne demarre pas") : react-native-web
 * definit `Alert.alert` comme un NO-OP complet --
 * node_modules/react-native-web/dist/exports/Alert/index.js n'est que
 * `class Alert { static alert() {} }`. Chaque confirmation (ex: "le micro
 * est actif, arreter et ecouter ?" dans TrackListenControls.tsx) qui passe
 * par Alert.alert() ne montre donc RIEN sur le web -- aucune boite, aucune
 * erreur, et les callbacks des boutons (onPress) ne sont jamais appeles.
 * Impact reel : 21 fichiers / ~144 appels Alert.alert() dans l'app mobile
 * sont silencieusement inertes sur le web, seule plateforme deployee/
 * testable pour l'instant (pas de build TestFlight/APK confirme).
 *
 * Ce module remplace `Alert` importe depuis 'react-native' par un shim au
 * MEME contrat d'API (mêmes signatures d'appel) : sur natif (iOS/Android),
 * c'est le vrai Alert RN inchange. Sur web, ca utilise window.alert/confirm
 * du navigateur -- moins joli qu'un Modal sur mesure, mais garanti visible
 * et fonctionnel partout, sans reecrire les 144 sites d'appel un par un
 * (seul l'import change, jamais l'appel Alert.alert(...) lui-meme).
 */
function webAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (typeof window === 'undefined') return;
  const list = buttons && buttons.length ? buttons : [{ text: 'OK' } as AlertButton];
  // Adel (01/09/2026) : window.alert/confirm etaient fonctionnels mais
  // affichaient la boite systeme generique du navigateur, pas la charte Loki
  // -- AlertHost.tsx (monte une fois dans App.tsx) rend cette file d'attente
  // avec le vrai design de l'app, meme contrat d'appel pour les 144 sites
  // Alert.alert() existants.
  useAlertStore.getState().show(title, message, list);
}

export const Alert = Platform.OS === 'web' ? { alert: webAlert } : RNAlert;
