import React, { useEffect, useRef } from 'react';
import GlobalChatDock from './GlobalChatDock';
import WebPairingLifecycle from './WebPairingLifecycle';
import { useGlobalChatStore } from '../store/useGlobalChatStore';
import { useUserStore } from '../store/useUserStore';

let hostCounter = 0;

/**
 * Adel (02/10/2026) : « le robot doit rester visible dans les aperçus
 * (Loki Pulse, bulles, écoute) pour répondre sans sortir ». Un aperçu est
 * une fenêtre séparée qui passe au-dessus de tout : on y place ce composant,
 * qui affiche LE MÊME robot / mini-tchat à l'intérieur de la fenêtre tant
 * qu'elle est la plus haute. Le robot de l'écran principal (RootChatDock) se
 * retire pendant ce temps : un seul robot monté, aucun doublon de
 * notification ou de voix.
 */
export default function ChatDockHost({ active = true }: { active?: boolean }) {
  const idRef = useRef(`chat-host-${++hostCounter}`);
  const isTop = useGlobalChatStore((state) => state.chatHosts[state.chatHosts.length - 1] === idRef.current);
  const user = useUserStore((state) => state.user);

  useEffect(() => {
    if (!active) return undefined;
    const id = idRef.current;
    useGlobalChatStore.getState().pushChatHost(id);
    return () => useGlobalChatStore.getState().popChatHost(id);
  }, [active]);

  if (!active || !isTop || !user) return null;
  return <GlobalChatDock />;
}

/** Robot de l'écran principal : retiré quand un aperçu l'héberge. */
export function RootChatDock() {
  const hosted = useGlobalChatStore((state) => state.chatHosts.length > 0);
  return <>
    <WebPairingLifecycle />
    {hosted ? null : <GlobalChatDock />}
  </>;
}
