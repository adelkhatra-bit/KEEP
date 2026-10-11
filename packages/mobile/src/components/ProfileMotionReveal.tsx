import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, Platform, StyleProp, ViewStyle } from 'react-native';

type Props = {
  children: ReactNode;
  motionKey?: string;
  delay?: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function ProfileMotionReveal({ children, motionKey = 'default', delay = 0, compact = false, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      delay,
      damping: compact ? 19 : 17,
      stiffness: compact ? 190 : 155,
      mass: 0.72,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    return () => progress.stopAnimation();
  }, [compact, delay, motionKey, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [compact ? 8 : 14, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [compact ? 0.985 : 0.97, 1],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
