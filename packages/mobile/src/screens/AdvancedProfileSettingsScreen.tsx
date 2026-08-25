import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ProfileScreen from './ProfileScreen';
import { colors } from '../theme/colors';

/**
 * Enveloppe fonctionnelle uniquement : conserve intégralement le design et
 * les réglages avancés existants, tout en laissant Playlists accessible sans
 * devoir remonter plusieurs écrans.
 */
export default function AdvancedProfileSettingsScreen({ navigation }: any) {
  const goToPlaylists = () => navigation.navigate('Main', { screen: 'MyMusic' });

  return (
    <View style={styles.container}>
      <View style={styles.quickNav}>
        <TouchableOpacity style={styles.playlistsButton} onPress={goToPlaylists} accessibilityRole="button" accessibilityLabel="Revenir aux Playlists">
          <Text style={styles.playlistsText}>← Playlists</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <ProfileScreen navigation={navigation} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  quickNav: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  playlistsButton: { minHeight: 34, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 8 },
  playlistsText: { color: colors.primaryLight, fontSize: 13, fontWeight: '800' },
  content: { flex: 1 },
});
