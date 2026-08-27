import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

export type SwipeDirection = 'LEFT' | 'RIGHT';

type Props = {
  children: React.ReactNode;
  enabled?: boolean;
  resetKey?: string | number | null;
  onSwipeLeft?: () => void | Promise<void>;
  onSwipeRight?: () => void | Promise<void>;
  leftLabel?: string;
  rightLabel?: string;
  hint?: string;
};

const SWIPE_THRESHOLD = 72;
const EXIT_DISTANCE = 520;

export default function SwipeDeck({
  children,
  enabled = true,
  resetKey,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = 'PASSER',
  rightLabel = 'KEEP',
  hint = 'Glisse à gauche pour passer · à droite pour garder',
}: Props) {
  const x = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  useEffect(() => {
    animating.current = false;
    x.stopAnimation();
    x.setValue(0);
  }, [resetKey, x]);

  const settle = () => {
    Animated.spring(x, { toValue: 0, friction: 7, tension: 80, useNativeDriver: true }).start();
  };

  const commitSwipe = (direction: SwipeDirection) => {
    if (animating.current) return;
    animating.current = true;
    const target = direction === 'RIGHT' ? EXIT_DISTANCE : -EXIT_DISTANCE;
    Animated.timing(x, { toValue: target, duration: 190, useNativeDriver: true }).start(() => {
      const callback = direction === 'RIGHT' ? onSwipeRight : onSwipeLeft;
      Promise.resolve(callback?.())
        .catch(() => {})
        .finally(() => {
          x.setValue(0);
          animating.current = false;
        });
    });
  };

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => enabled && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => {
      if (!enabled || animating.current) return;
      x.setValue(gesture.dx);
    },
    onPanResponderRelease: (_, gesture) => {
      if (!enabled || animating.current) return settle();
      if (gesture.dx >= SWIPE_THRESHOLD) return commitSwipe('RIGHT');
      if (gesture.dx <= -SWIPE_THRESHOLD) return commitSwipe('LEFT');
      settle();
    },
    onPanResponderTerminate: settle,
  }), [enabled, onSwipeLeft, onSwipeRight, x]);

  const rotate = x.interpolate({ inputRange: [-220, 0, 220], outputRange: ['-7deg', '0deg', '7deg'], extrapolate: 'clamp' });
  const leftOpacity = x.interpolate({ inputRange: [-130, -28, 0], outputRange: [1, .15, 0], extrapolate: 'clamp' });
  const rightOpacity = x.interpolate({ inputRange: [0, 28, 130], outputRange: [0, .15, 1], extrapolate: 'clamp' });

  return <View style={styles.shell}>
    <Animated.View style={[styles.badge, styles.leftBadge, { opacity: leftOpacity }]} pointerEvents="none"><Text style={styles.leftText}>{leftLabel}</Text></Animated.View>
    <Animated.View style={[styles.badge, styles.rightBadge, { opacity: rightOpacity }]} pointerEvents="none"><Text style={styles.rightText}>{rightLabel}</Text></Animated.View>
    <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: x }, { rotate }] }}>{children}</Animated.View>
    {enabled && hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  shell:{width:'100%',position:'relative'},
  badge:{position:'absolute',top:18,zIndex:10,borderWidth:2,borderRadius:10,paddingHorizontal:10,paddingVertical:6},
  leftBadge:{right:18,borderColor:'#FF5F83',transform:[{rotate:'7deg'}]},
  rightBadge:{left:18,borderColor:'#68F2B1',transform:[{rotate:'-7deg'}]},
  leftText:{color:'#FF5F83',fontSize:12,fontWeight:'900',letterSpacing:1},
  rightText:{color:'#68F2B1',fontSize:12,fontWeight:'900',letterSpacing:1},
  hint:{marginTop:7,color:'#756B84',fontSize:9,fontWeight:'700',textAlign:'center'},
});
