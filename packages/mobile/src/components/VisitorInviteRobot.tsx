import { useEffect } from 'react';
import { composeVisitorInvite } from '../services/visitorInvite';
import { robotSay } from '../services/robotCoachService';

/**
 * Visiteur sans compte arrivé par un lien partagé (Adel, 06/10/2026) : plus de grand encadré qui pousse le profil vers le bas.
 * Le petit robot envoie UN message rapide (« @adel4A t’invite 🎵 ») ; les boutons du profil restent à leur place, et chaque
 * fonction bloquée demande un compte au moment où on la touche.
 */
const greeted = new Set<string>();
export default function VisitorInviteRobot({ inviter }: { inviter: string }) {
  useEffect(() => {
    const name = String(inviter || '').trim();
    if (!name || greeted.has(name)) return undefined;
    const timer = setTimeout(() => { greeted.add(name); void robotSay('ROBOT_TIP', { text: composeVisitorInvite(name), force: true }); }, 1200);
    return () => clearTimeout(timer);
  }, [inviter]);
  return null;
}
