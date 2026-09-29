import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleProp, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'switch';
  accessibilityState?: { checked?: boolean; disabled?: boolean };
};

export default function BattleGlowButton({
  label,
  onPress,
  disabled = false,
  active = true,
  compact = false,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const [pressedState, setPressedState] = useState(false);

  useEffect(() => {
    if (disabled) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [disabled, pulse]);

  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.62] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.055] });
  const innerScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const accent = active ? colors.keep : '#7C5CFC';
  const glow = active ? '#72F5DE' : '#A97BFF';
  const sweepX = pulse.interpolate({ inputRange: [0, 1], outputRange: [-36, compact ? 92 : 150] });

  return (
    <TouchableOpacity
      activeOpacity={1}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => { setPressedState(true); Animated.timing(press, { toValue: 1, duration: 70, useNativeDriver: Platform.OS !== 'web' }).start(); }}
      onPressOut={() => { setPressedState(false); Animated.spring(press, { toValue: 0, speed: 28, bounciness: 7, useNativeDriver: Platform.OS !== 'web' }).start(); }}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel || label}
      style={[{ position: 'relative' }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: compact ? -3 : -5,
          right: compact ? -3 : -5,
          bottom: compact ? -3 : -5,
          left: compact ? -3 : -5,
          borderRadius: compact ? 18 : 20,
          borderWidth: compact ? 2 : 3,
          borderColor: glow,
          opacity: haloOpacity,
          transform: [{ scale: haloScale }],
        }}
      />
      <Animated.View
        style={{
          minHeight: compact ? 32 : 54,
          paddingHorizontal: compact ? 10 : 16,
          borderRadius: compact ? 16 : 16,
          borderWidth: 2,
          borderColor: accent,
          backgroundColor: pressedState ? 'rgba(124,92,252,0.28)' : active ? 'rgba(45,225,194,0.10)' : 'rgba(124,92,252,0.16)',
          shadowColor: glow,
          shadowOpacity: active ? 0.85 : 0.45,
          shadowRadius: compact ? 8 : 12,
          shadowOffset: { width: 0, height: 3 },
          elevation: active ? 10 : 5,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: innerScale }, { translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) }],
          overflow: 'hidden',
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 1,
            left: compact ? 10 : 14,
            right: compact ? 10 : 14,
            height: 1,
            backgroundColor: '#FFFFFF',
            opacity: active ? 0.55 : 0.30,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 2,
            height: compact ? 3 : 5,
            borderRadius: 999,
            backgroundColor: active ? 'rgba(45,225,194,0.22)' : 'rgba(124,92,252,0.28)',
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -12,
            bottom: -12,
            width: compact ? 18 : 24,
            backgroundColor: '#FFFFFF',
            opacity: active ? 0.16 : 0.10,
            transform: [{ translateX: sweepX }, { rotate: '16deg' }],
          }}
        />
        <Text
          numberOfLines={1}
          style={{
            color: active ? '#FFFFFF' : '#D6C9F2',
            fontSize: compact ? 9 : 12,
            fontWeight: '900',
            letterSpacing: compact ? 0.35 : 0.7,
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}
