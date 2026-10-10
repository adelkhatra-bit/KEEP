import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';

/**
 * Contour lumineux qui pulse (Adel, 05/10/2026) : met en avant les « Découvert par @… » (premiers découvreurs).
 * L'intensité monte et redescend en douceur (≈ 1,6 s) ; superposé au bouton sans toucher à sa mise en page ni à ses appuis ; immobile si « réduire les animations ».
 */
export default function GlowRing({ radius = 14, color = '#2DE1C2', testID }: { radius?: number; color?: string; testID?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((value) => { if (live) setReduceMotion(Boolean(value)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (reduceMotion) { pulse.setValue(0.8); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0.15, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 2, borderColor: color, opacity: pulse, shadowColor: color, shadowOpacity: 0.95, shadowRadius: 9, shadowOffset: { width: 0, height: 0 } }]}
    />
  );
}
