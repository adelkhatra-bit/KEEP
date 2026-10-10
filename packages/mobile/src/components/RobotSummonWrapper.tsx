import React from 'react';
import { View } from 'react-native';
import { currentScreenName } from '../services/problemReportService';
import { TapSummonDetector } from '../services/robotHelp';
import { useUserStore } from '../store/useUserStore';
import { useGameSessionStore } from '../store/useGameSessionStore';
import { useRobotMessageStore } from '../store/useRobotMessageStore';

/**
 * Appel du robot (Adel, 06/10/2026, IDEA-154) : 5 touchers rapprochés (≤ 2,5 s, dans un rayon de 60 px) n'importe où dans l'application font venir le robot
 * (« Qu'est-ce que je peux faire pour toi, {pseudo} ? » + 3 propositions). Monté dans index.js autour de l'application (les modules sont chargés à la demande : un enregistrement par AppRegistry arriverait trop tard). Le toucher n'est JAMAIS intercepté (la capture renvoie toujours `false`) :
 * aucun bouton, défilement ou geste ne change. Jamais pendant un Solo / Battle, un lecteur plein écran, ni si le robot parle déjà ; sur le web, un toucher
 * sur un bouton ou un champ ne compte pas.
 */
const detector = new TapSummonDetector();
const INTERACTIVE = 'button,[role="button"],a,input,textarea,select,[contenteditable="true"]';

function onTapCapture(event: any): void {
  try {
    const user = useUserStore.getState();
    if (!user.user?.id || user.isDemoMode || user.isLocalGuest) return;
    if (useGameSessionStore.getState().isGameInProgress) return;
    const robot = useRobotMessageStore.getState();
    if (robot.message || robot.quiet > 0) return;
    const target = event?.nativeEvent?.target;
    if (target && typeof target.closest === 'function' && target.closest(INTERACTIVE)) { detector.reset(); return; }
    const x = Number(event?.nativeEvent?.pageX ?? 0);
    const y = Number(event?.nativeEvent?.pageY ?? 0);
    if (detector.tap(x, y, Date.now())) {
      const { summonRobot } = require('../services/robotCoachService');
      void summonRobot(user.user.username ?? '', currentScreenName());
    }
  } catch { /* l'appel du robot ne doit jamais gêner l'application */ }
}

export function RobotSummonWrapper({ children }: { children?: React.ReactNode }) {
  return <View style={{ flex: 1 }} onStartShouldSetResponderCapture={(event) => { onTapCapture(event); return false; }}>{children}</View>;
}
