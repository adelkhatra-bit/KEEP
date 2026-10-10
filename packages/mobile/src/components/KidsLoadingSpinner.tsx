import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import { colors } from '../theme/colors';

interface KidsLoadingSpinnerProps {
  message?: string;
  emoji?: string;
  size?: number;
}

export default function KidsLoadingSpinner({
  message = 'Chargement...',
  emoji = '⏳',
  size = 60,
}: KidsLoadingSpinnerProps) {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <Animated.Text style={[styles.emoji, { fontSize: size, transform: [{ rotate: spin }] }]}>
        {emoji}
      </Animated.Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  emoji: {
    marginBottom: 16,
  },
  message: {
    fontSize: 14,
    color: colors.primaryLight,
    fontWeight: '500',
  },
});
