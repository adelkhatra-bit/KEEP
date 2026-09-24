import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

type Tone = 'primary' | 'battle' | 'success' | 'secondary';

type Props = {
  icon?: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: Tone;
  disabled?: boolean;
  compact?: boolean;
  trailingText?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * CTA premium partagé par les profils Loki Music.
 *
 * - halo respirant discret au repos ;
 * - compression + rebond au toucher ;
 * - dégradé de marque ;
 * - respecte "Réduire les animations".
 *
 * Aucun état métier ici : le composant ne fait que moderniser l'interaction
 * visuelle et délègue toujours l'action réelle au parent.
 */
export default function MotionActionButton({
  icon,
  title,
  subtitle,
  onPress,
  accessibilityLabel,
  tone = 'primary',
  disabled = false,
  compact = false,
  trailingText,
  style,
}: Props) {
  const press = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => { if (live) setReduceMotion(Boolean(enabled)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    glow.stopAnimation();
    if (reduceMotion || disabled || tone === 'secondary') {
      glow.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1350, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, glow, reduceMotion, tone]);

  const gradient = useMemo<[string, string]>(() => {
    if (tone === 'success') return [colors.keep, colors.primary];
    if (tone === 'battle') return [colors.primaryLight, colors.primaryDark];
    if (tone === 'secondary') return [colors.backgroundCard, colors.backgroundElevated];
    return [colors.primaryLight, colors.primary];
  }, [tone]);

  const pressTo = (toValue: number) => {
    if (reduceMotion) {
      press.setValue(toValue);
      return;
    }
    Animated.spring(press, {
      toValue,
      damping: 16,
      stiffness: 260,
      mass: 0.45,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        disabled && styles.disabled,
        style,
        { transform: [{ scale: press }] },
      ]}
    >
      {tone !== 'secondary' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              borderColor: tone === 'success' ? colors.keep : colors.primaryLight,
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.52] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.035] }) }],
            },
          ]}
        />
      ) : null}
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => pressTo(0.965)}
        onPressOut={() => pressTo(1)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.pressable}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradient,
            compact && styles.gradientCompact,
            tone === 'secondary' && styles.secondary,
          ]}
        >
          {icon ? <View style={styles.iconOrb}><Text style={styles.icon}>{icon}</Text></View> : null}
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
          </View>
          {trailingText ? <Text style={styles.trailing}>{trailingText}</Text> : <Text style={styles.arrow}>›</Text>}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 56,
    borderRadius: 18,
    position: 'relative',
  },
  wrapCompact: {
    minHeight: 48,
    borderRadius: 16,
  },
  disabled: {
    opacity: 0.55,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 2,
  },
  pressable: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  gradient: {
    minHeight: 56,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  gradientCompact: {
    minHeight: 48,
    borderRadius: 16,
    paddingVertical: 8,
  },
  secondary: {
    borderColor: colors.border,
  },
  iconOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  icon: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.25,
  },
  subtitle: {
    color: colors.textPrimary,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
    opacity: 0.9,
  },
  trailing: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '900',
  },
  arrow: {
    color: colors.textPrimary,
    fontSize: 25,
    lineHeight: 26,
    fontWeight: '700',
  },
});
