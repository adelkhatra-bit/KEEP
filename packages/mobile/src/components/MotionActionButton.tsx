import React, { useRef } from 'react';
import { Animated, Easing, TouchableOpacity, ViewStyle, TextStyle, AccessibilityRole } from 'react-native';
import { colors } from '../theme/colors';

interface MotionActionButtonProps {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  variant?: 'primary' | 'success' | 'danger' | 'secondary' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  noDefaultStyling?: boolean;
  containerStyle?: ViewStyle;
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
}: MotionActionButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const variantColors: Record<string, { bg: string; border: string; text: string }> = {
    primary: { bg: colors.primary, border: colors.primary, text: colors.white },
    success: { bg: colors.success, border: colors.success, text: colors.white },
    danger: { bg: colors.danger || '#FF5C72', border: colors.danger || '#FF5C72', text: colors.white },
    secondary: { bg: colors.backgroundElevated, border: colors.border, text: colors.textPrimary },
    ghost: { bg: 'transparent', border: colors.border, text: colors.textPrimary },
  };

  const sizeConfig: Record<string, { height: number; paddingHorizontal: number; fontSize: number }> = {
    small: { height: 36, paddingHorizontal: 12, fontSize: 11 },
    medium: { height: 48, paddingHorizontal: 16, fontSize: 12 },
    large: { height: 56, paddingHorizontal: 20, fontSize: 14 },
  };

  const config = variantColors[variant];
  const dims = sizeConfig[size];

  const handlePressIn = () => {
    if (disabled) return;
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.96,
        duration: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.02,
        duration: 60,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(glowAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.3],
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  return (
    <TouchableOpacity
      onPress={() => !disabled && onPress()}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: -4,
          borderRadius: 12,
          backgroundColor: config.bg,
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }}
      />

      <Animated.View
        style={{
          height: dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          borderRadius: 12,
          backgroundColor: config.bg,
          borderWidth: variant === 'ghost' ? 1.5 : 0,
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
              color: config.text,
              fontSize: dims.fontSize,
              fontWeight: '900',
              letterSpacing: 0.5,
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
