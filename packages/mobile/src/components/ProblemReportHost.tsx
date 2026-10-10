import React, { useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { startShakeDetection, subscribeProblemReportOpen, currentScreenName, openProblemReport, announceReportUpdates } from '../services/problemReportService';
import { navigationRef } from '../navigation/navigationRef';
import { pushCrumb } from '../services/reportLoop';
import { robotSay, summonRobotMenu } from '../services/robotCoachService';
import KeepModal from './KeepModal';
import TasteOnboardingGate from './TasteOnboardingGate';
import { describeReportLocation, setReportOpen, topReportLayer } from '../services/reportSurface';
import { ProblemReportPanel, useReportLayerState } from './ProblemReportPanel';

/** Hôte global : monté une seule fois dans App.tsx (utilisateur connecté). Ouvre sa propre fenêtre seulement si aucune n'est ouverte. */
export default function ProblemReportHost() {
  const user = useUserStore((state: any) => state.user);
  const { open, top } = useReportLayerState();

  useEffect(() => subscribeProblemReportOpen(() => setReportOpen(true)), []);
  // Secousse : dans une fenêtre ouverte (story, swipe…) → signalement SUR PLACE ; sinon → menu du robot (directions + « Un souci »).
  useEffect(() => startShakeDetection(() => {
    pushCrumb('action', 'secousse');
    if (topReportLayer() !== null) { openProblemReport(); return; }
    void summonRobotMenu(String(useUserStore.getState().user?.username ?? ''), currentScreenName()).then((spoke) => { if (!spoke) openProblemReport(); });
  }), []);
  // Fil des dernières actions : chaque changement d'écran est mémorisé (en mémoire) pour localiser le problème lors d'une secousse.
  useEffect(() => {
    pushCrumb('screen', currentScreenName());
    const unsubscribe = (navigationRef as any).addListener?.('state', () => pushCrumb('screen', currentScreenName()));
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, []);
  // Le robot annonce les réparations (une fois) puis, rarement et discrètement, rappelle le geste « secoue ton téléphone ».
  useEffect(() => {
    if (!user?.id) return undefined;
    const first = setTimeout(() => { void announceReportUpdates(); }, 9000);
    const tip = setTimeout(() => { void robotSay('REPORT_TIP'); }, 90000);
    return () => { clearTimeout(first); clearTimeout(tip); };
  }, [user?.id]);

  // Hôte global des fenêtres « support / première utilisation » (monté une fois pour l'utilisateur connecté, hors coque protégée App.tsx).
  return (
    <>
    <TasteOnboardingGate />
    <KeepModal visible={open && top === null} transparent animationType="fade" onRequestClose={() => setReportOpen(false)} reportLayer={false}>
      <ProblemReportPanel screen={describeReportLocation(currentScreenName())} onClose={() => setReportOpen(false)} />
    </KeepModal>
    </>
  );
}
