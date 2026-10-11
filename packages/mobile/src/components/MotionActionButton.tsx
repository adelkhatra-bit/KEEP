import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleProp, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../theme/colors';
import { minTouchTarget } from '../theme/spacing';

interface MotionActionButtonProps {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: TextStyle;
  variant?: 'primary' | 'success' | 'danger' | 'secondary' | 'ghost' | 'outline';
  size?: 'small' | 'medium' | 'large';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  noDefaultStyling?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function MotionActionButton({
  onPress,
  disabled = false,
  children,
  style,
  textStyle,
  variant = 'primary',
  size = 'medium',
  accessibilityLabel,
  accessibilityHint,
  testID,
  containerStyle,
}: MotionActionButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressGlowAnim = useRef(new Animated.Value(0)).current;
  const idleOutlineAnim = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);

  const variantColors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    primary: { bg: colors.primary, border: colors.primary, text: colors.white, glow: colors.primaryLight },
    success: { bg: colors.success, border: colors.success, text: colors.white, glow: colors.success },
    danger: { bg: colors.danger || '#FF5C72', border: colors.danger || '#FF5C72', text: colors.white, glow: colors.danger || '#FF5C72' },
    secondary: { bg: colors.backgroundElevated, border: colors.border, text: colors.textPrimary, glow: colors.primaryLight },
    ghost: { bg: 'transparent', border: colors.border, text: colors.textPrimary, glow: colors.primaryLight },
    outline: { bg: 'transparent', border: colors.primaryLight, text: colors.white, glow: colors.primaryLight },
  };

  const sizeConfig: Record<string, { height: number; paddingHorizontal: number; fontSize: number }> = {
    small: { height: 44, paddingHorizontal: 12, fontSize: 11 },
    medium: { height: 48, paddingHorizontal: 16, fontSize: 12 },
    large: { height: 56, paddingHorizontal: 20, fontSize: 14 },
  };

  const config = variantColors[variant];
  const dims = sizeConfig[size];

  useEffect(() => {
    if (variant !== 'outline' || disabled) {
      idleOutlineAnim.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(idleOutlineAnim, {
        toValue: 1,
        duration: 1250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(idleOutlineAnim, {
        toValue: 0,
        duration: 1250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [disabled, idleOutlineAnim, variant]);

  const handlePressIn = () => {
    if (disabled) return;
    setPressed(true);
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.96,
        duration: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(pressGlowAnim, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    setPressed(false);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.02,
        duration: 60,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
    Animated.timing(pressGlowAnim, {
      toValue: 0,
      duration: 190,
      easing: Easing.in(Easing.ease),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const pressGlowOpacity = pressGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.28],
  });
  const pressGlowScale = pressGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });
  const idleOutlineOpacity = idleOutlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.035, 0.13],
  });
  const idleOutlineScale = idleOutlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  });

  return (
    <TouchableOpacity
      onPress={() => !disabled && onPress()}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[{ minWidth: minTouchTarget, minHeight: minTouchTarget, justifyContent: 'center' }, containerStyle, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      activeOpacity={1}
    >
      {variant === 'outline' ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            bottom: -3,
            left: -3,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: config.glow,
            backgroundColor: 'transparent',
            opacity: idleOutlineOpacity,
            transform: [{ scale: idleOutlineScale }],
          }}
        />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -4,
          right: -4,
          bottom: -4,
          left: -4,
          borderRadius: 16,
          borderWidth: variant === 'outline' ? 2 : 0,
          borderColor: config.glow,
          backgroundColor: variant === 'outline' ? 'transparent' : config.glow,
          opacity: pressGlowOpacity,
          transform: [{ scale: pressGlowScale }],
        }}
      />
      <Animated.View
        style={{
          height: dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          borderRadius: 14,
          backgroundColor: variant === 'outline' && pressed ? colors.primaryFaint : config.bg,
          borderWidth: variant === 'ghost' ? 1.5 : variant === 'secondary' ? 1 : 2,
          borderColor: config.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: scaleAnim }],
        }}
      >
        <Animated.Text
          style={[
            {
              color: variant === 'outline' && pressed ? colors.primaryLight : config.text,
              fontSize: dims.fontSize,
              fontWeight: '900',
              letterSpacing: 0.5,
              textAlign: 'center',
            },
            textStyle,
          ]}
        >
          {children}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
}
