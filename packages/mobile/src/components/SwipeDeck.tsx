import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';

export type SwipeDirection = 'LEFT' | 'RIGHT' | 'UP';

type Props = {
  children: React.ReactNode;
  enabled?: boolean;
  resetKey?: string | number | null;
  onSwipeLeft?: () => void | Promise<void>;
  onSwipeRight?: () => void | Promise<void>;
  onSwipeUp?: () => void | Promise<void>;
  leftLabel?: string;
  rightLabel?: string;
  upLabel?: string;
  hint?: string;
  /** La carte remplit la hauteur disponible (jamais de débordement sur l'en-tête ni les boutons). */
  fill?: boolean;
};

const SWIPE_THRESHOLD = 72;
const VERTICAL_SWIPE_THRESHOLD = 52;
const VERTICAL_FLING_MIN_DISTANCE = 28;
const VERTICAL_FLING_VELOCITY = -0.45;
const EXIT_DISTANCE = 520;
const EXIT_DISTANCE_Y = 760;

export default function SwipeDeck({
  children,
  enabled = true,
  resetKey,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  leftLabel = 'PASSER',
  rightLabel = 'GARDER',
  upLabel = 'SUIVANT',
  hint = 'Glisse à gauche pour passer · à droite pour garder',
  fill = false,
}: Props) {
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  useEffect(() => {
    animating.current = false;
    x.stopAnimation();
    y.stopAnimation();
    x.setValue(0);
    y.setValue(0);
  }, [resetKey, x, y]);

  // BUG iPhone (Adel, 05/10/2026 : « je ne peux toujours pas swiper ») : le PanResponder était RECRÉÉ à chaque rendu
  // (les callbacks changent à chaque rendu du lecteur, qui se redessine en continu pendant la lecture audio).
  // Un PanResponder remplacé en plein geste perd son état (dx/dy faux) : le swipe n'aboutissait jamais sur iOS.
  // Il est maintenant créé UNE seule fois ; les dernières valeurs passent par une référence.
  const latest = useRef({ enabled, onSwipeLeft, onSwipeRight, onSwipeUp });
  latest.current = { enabled, onSwipeLeft, onSwipeRight, onSwipeUp };

  const settle = () => {
    Animated.parallel([
      Animated.spring(x, { toValue: 0, friction: 7, tension: 80, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(y, { toValue: 0, friction: 7, tension: 80, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  };

  const commitSwipe = (direction: SwipeDirection) => {
    if (animating.current) return;
    animating.current = true;
    const targetX = direction === 'RIGHT' ? EXIT_DISTANCE : direction === 'LEFT' ? -EXIT_DISTANCE : 0;
    const targetY = direction === 'UP' ? -EXIT_DISTANCE_Y : 0;
    Animated.parallel([
      Animated.timing(x, { toValue: targetX, duration: direction === 'UP' ? 160 : 190, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(y, { toValue: targetY, duration: direction === 'UP' ? 160 : 190, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() => {
      const current = latest.current;
      const callback = direction === 'RIGHT' ? current.onSwipeRight : direction === 'LEFT' ? current.onSwipeLeft : current.onSwipeUp;
      Promise.resolve(callback?.())
        .catch(() => {})
        .finally(() => {
          x.setValue(0);
          y.setValue(0);
          animating.current = false;
        });
    });
  };

  const wantsHorizontal = (gesture: any) => Boolean(latest.current.onSwipeLeft || latest.current.onSwipeRight) && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15;
  const wantsUp = (gesture: any) => Boolean(latest.current.onSwipeUp) && gesture.dy < -6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.1;

  const responder = useRef(PanResponder.create({
    // Adel (05/10/2026) : « n'importe où où j'appuie, je dois pouvoir swiper vers le haut comme sur l'ordinateur ».
    // On réclame le geste dès le toucher (les boutons enfants gardent la priorité : le plus profond répond d'abord).
    onStartShouldSetPanResponder: () => latest.current.enabled,
    onShouldBlockNativeResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gesture) => latest.current.enabled && (wantsHorizontal(gesture) || wantsUp(gesture)),
    onMoveShouldSetPanResponder: (_, gesture) => latest.current.enabled && (wantsHorizontal(gesture) || wantsUp(gesture)),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gesture) => {
      if (!latest.current.enabled || animating.current) return;
      if (wantsUp(gesture)) {
        x.setValue(gesture.dx * 0.12);
        y.setValue(Math.min(0, gesture.dy));
        return;
      }
      x.setValue(gesture.dx);
      y.setValue(0);
    },
    onPanResponderRelease: (_, gesture) => {
      const { enabled: on, onSwipeUp: up } = latest.current;
      if (!on || animating.current) return settle();
      const upwardFling = gesture.dy <= -VERTICAL_FLING_MIN_DISTANCE && gesture.vy <= VERTICAL_FLING_VELOCITY;
      if (up && (gesture.dy <= -VERTICAL_SWIPE_THRESHOLD || upwardFling) && Math.abs(gesture.dy) > Math.abs(gesture.dx)) return commitSwipe('UP');
      if (gesture.dx >= SWIPE_THRESHOLD) return commitSwipe('RIGHT');
      if (gesture.dx <= -SWIPE_THRESHOLD) return commitSwipe('LEFT');
      settle();
    },
    onPanResponderTerminate: settle,
  })).current;

  const rotate = x.interpolate({ inputRange: [-220, 0, 220], outputRange: ['-7deg', '0deg', '7deg'], extrapolate: 'clamp' });
  const leftOpacity = x.interpolate({ inputRange: [-130, -28, 0], outputRange: [1, .15, 0], extrapolate: 'clamp' });
  const rightOpacity = x.interpolate({ inputRange: [0, 28, 130], outputRange: [0, .15, 1], extrapolate: 'clamp' });
  const upOpacity = y.interpolate({ inputRange: [-150, -28, 0], outputRange: [1, .18, 0], extrapolate: 'clamp' });
  const upScale = y.interpolate({ inputRange: [-150, 0], outputRange: [1.08, 1], extrapolate: 'clamp' });

  return <View collapsable={false} {...responder.panHandlers} style={[styles.shell, fill && styles.shellFill, Platform.OS === 'web' && styles.shellWeb, Platform.OS === 'web' && onSwipeUp ? styles.shellWebVertical : null]}>
    <Animated.View style={[styles.badge, styles.leftBadge, { opacity: leftOpacity }]} pointerEvents="none"><Text style={styles.leftText}>{leftLabel}</Text></Animated.View>
    <Animated.View style={[styles.badge, styles.rightBadge, { opacity: rightOpacity }]} pointerEvents="none"><Text style={styles.rightText}>{rightLabel}</Text></Animated.View>
    {onSwipeUp ? <Animated.View style={[styles.badge, styles.upBadge, { opacity: upOpacity, transform: [{ scale: upScale }] }]} pointerEvents="none"><Text style={styles.upText}>↑ {upLabel}</Text></Animated.View> : null}
    <Animated.View style={[fill ? styles.panFill : null, { transform: [{ translateX: x }, { translateY: y }, { rotate }] }]}>{children}</Animated.View>
    {enabled && hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  shell:{width:'100%',position:'relative'},
  shellFill:{flex:1,minHeight:0},
  panFill:{flex:1,minHeight:0},
  shellWeb:{touchAction:'none',userSelect:'none'} as any,
  shellWebVertical:{touchAction:'none'} as any,
  badge:{position:'absolute',top:18,zIndex:10,borderWidth:2,borderRadius:10,paddingHorizontal:10,paddingVertical:6},
  leftBadge:{right:18,borderColor:'#FF5F83',transform:[{rotate:'7deg'}]},
  rightBadge:{left:18,borderColor:'#68F2B1',transform:[{rotate:'-7deg'}]},
  upBadge:{left:'50%',marginLeft:-48,bottom:42,top:'auto',minWidth:96,alignItems:'center',borderColor:'#FFFFFF',backgroundColor:'rgba(0,0,0,.34)'},
  leftText:{color:'#FF5F83',fontSize:12,fontWeight:'900',letterSpacing:1},
  rightText:{color:'#68F2B1',fontSize:12,fontWeight:'900',letterSpacing:1},
  upText:{color:'#FFFFFF',fontSize:11,fontWeight:'900',letterSpacing:1},
  hint:{marginTop:14,marginBottom:14,paddingHorizontal:6,color:'#FFFFFF',fontSize:13,lineHeight:19,fontWeight:'700',textAlign:'center'},
});
