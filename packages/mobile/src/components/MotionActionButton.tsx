import React, { useRef, useState } from 'react';
import { Animated, Easing, StyleProp, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../theme/colors';

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
  const glowAnim = useRef(new Animated.Value(0)).current;
  const idleOutlineAnim = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);
  const [pressed, setPressed] = useState(false);

  const variantColors: Record<string, { bg: string; border: string; text: string; glow?: string }> = {
    primary: { bg: colors.primary, border: colors.primary, text: colors.white },
    success: { bg: colors.success, border: colors.success, text: colors.white },
    danger: { bg: colors.danger || '#FF5C72', border: colors.danger || '#FF5C72', text: colors.white },
    secondary: { bg: colors.backgroundElevated, border: colors.border, text: colors.textPrimary },
    ghost: { bg: 'transparent', border: colors.border, text: colors.textPrimary },
    outline: { bg: 'transparent', border: colors.primaryLight, text: colors.white, glow: colors.primaryLight },
    outline: { bg: 'transparent', border: colors.primaryLight, text: colors.textPrimary },
  };

  const sizeConfig: Record<string, { height: number; paddingHorizontal: number; fontSize: number }> = {
    small: { height: 44, paddingHorizontal: 12, fontSize: 11 },
    medium: { height: 48, paddingHorizontal: 16, fontSize: 12 },
    large: { height: 56, paddingHorizontal: 20, fontSize: 14 },
  };

  const config = variantColors[variant];
  const dims = sizeConfig[size];

  useEffect(() => {
    if (variant !== 'outline' || disabled) { idleOutlineAnim.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(idleOutlineAnim, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(idleOutlineAnim, { toValue: 0, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [disabled, idleOutlineAnim, variant]);

  const handlePressIn = () => {
    if (disabled) return;
    setPressed(true);
    setPressed(true);
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
    setPressed(false);
    setPressed(false);
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

  const idleOutlineOpacity = idleOutlineAnim.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.16] });
  const idleOutlineScale = idleOutlineAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });

  return (
    <TouchableOpacity
      onPress={() => !disabled && onPress()}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[containerStyle, style]}
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
          borderRadius: variant === 'outline' ? 18 : 12,
          backgroundColor: config.bg,
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }}
      />

      <Animated.View
        style={{
          height: variant === 'outline' ? 52 : dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          borderRadius: variant === 'outline' ? 18 : 12,
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
              color: variant === 'outline' && pressed ? colors.textPrimary : config.text,
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
