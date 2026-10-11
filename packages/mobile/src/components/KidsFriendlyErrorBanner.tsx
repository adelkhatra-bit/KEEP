import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface KidsFriendlyErrorBannerProps {
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  visible?: boolean;
}

export default function KidsFriendlyErrorBanner({
  message = "Oups ! Quelque chose n'a pas marché. 😅",
  onRetry,
  onDismiss,
  visible = true,
}: KidsFriendlyErrorBannerProps) {
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>😅</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.buttonRow}>
        {onRetry && (
          <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={onRetry}>
            <Text style={styles.buttonText}>Réessayer 🔄</Text>
          </TouchableOpacity>
        )}
        {onDismiss && (
          <TouchableOpacity style={[styles.button, styles.dismissButton]} onPress={onDismiss}>
            <Text style={styles.dismissButtonText}>Fermer ✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  emoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    width: '100%',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
  },
  dismissButton: {
    backgroundColor: '#E0E0E0',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});
