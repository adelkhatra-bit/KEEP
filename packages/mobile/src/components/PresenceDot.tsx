import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

// Adel (03/09/2026) : "un voyant ou quelque chose qui clignote pour dire
// qu'il est connecté, et quand il est déconnecté un truc rouge" -- vert
// clignotant en ligne, rouge fixe hors ligne, comme les grandes apps de
// messagerie. Extrait en composant partagé (03/09/2026 : "pourquoi tu ne
// fais pas le même Design" -- utilisé d'abord sur Profil, puis sur les
// listes de joueurs Battle) pour ne jamais avoir deux logiques différentes
// du même signal vert/rouge dans l'app.
export default function PresenceDot({ online }: { online: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!online) { opacity.setValue(1); return undefined; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [online, opacity]);
  return <Animated.View style={[styles.dot, { backgroundColor: online ? '#38D990' : '#FF5F6D', opacity }]} />;
}

const styles = StyleSheet.create({ dot: { width: 10, height: 10, borderRadius: 5 } });
