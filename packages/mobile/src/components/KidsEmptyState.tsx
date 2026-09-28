import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface KidsEmptyStateProps {
  emoji?: string;
  title?: string;
  description?: string;
}

export default function KidsEmptyState({
  emoji = '📭',
  title = 'Rien à afficher',
  description = 'Reviens plus tard ou fais quelque chose de nouveau !',
}: KidsEmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
