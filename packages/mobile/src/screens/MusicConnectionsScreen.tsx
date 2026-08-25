import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getSupabaseAccessToken } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

type ProviderKey = 'apple_music' | 'spotify' | 'deezer' | 'youtube_music' | 'soundcloud' | 'tidal';

type ProviderStatus = {
  configured: boolean;
  connected: boolean;
  connection?: { provider_user_id?: string; connected_at?: string } | null;
};

const PROVIDERS: { key: ProviderKey; name: string; glyph: string; description: string }[] = [
  { key: 'apple_music', name: 'Apple Music', glyph: '♪', description: 'Bibliothèque et playlists Apple Music' },
  { key: 'spotify', name: 'Spotify', glyph: '●', description: 'Playlists privées, collaboratives et morceaux sauvegardés' },
  { key: 'deezer', name: 'Deezer', glyph: '≋', description: 'Playlists, favoris et bibliothèque Deezer' },
  { key: 'youtube_music', name: 'YouTube Music', glyph: '▶', description: 'Préparé pour l’intégration officielle Google/YouTube' },
  { key: 'soundcloud', name: 'SoundCloud', glyph: '☁', description: 'Préparé pour les likes et playlists SoundCloud' },
  { key: 'tidal', name: 'TIDAL', glyph: '◆', description: 'Préparé pour la bibliothèque TIDAL' },
];

export default function MusicConnectionsScreen({ navigation }: any) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const [statuses, setStatuses] = useState<Partial<Record<ProviderKey, ProviderStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [webAuth, setWebAuth] = useState<{ provider: 'spotify' | 'deezer'; url: string; token: string } | null>(null);

  const canReachBackend = useMemo(() => Boolean(apiUrl && !apiUrl.startsWith('your_')), [apiUrl]);

  const refresh = useCallback(async () => {
    if (!canReachBackend) {
      setLoading(false);
      return;
    }
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error('Connecte-toi d’abord à ton compte KEEP.');
      const res = await fetch(`${apiUrl}/api/music/connections/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      setStatuses(json.providers || {});
    } catch (e: any) {
      Alert.alert('Services musicaux', e?.message || 'Impossible de charger les connexions.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, canReachBackend]);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = async (provider: ProviderKey) => {
    if (provider === 'apple_music') {
      navigation.navigate('AppleMusicConnect');
      return;
    }
    if (provider !== 'spotify' && provider !== 'deezer') {
      Alert.alert('Bientôt disponible', 'Le connecteur est réservé dans l’architecture KEEP, mais l’API officielle de cette plateforme n’est pas encore activée.');
      return;
    }
    if (!canReachBackend) {
      Alert.alert('Backend KEEP non configuré', 'EXPO_PUBLIC_API_URL doit pointer vers le backend KEEP déployé.');
      return;
    }
    const token = await getSupabaseAccessToken();
    if (!token) {
      Alert.alert('Connexion KEEP requise', 'Connecte-toi d’abord à KEEP.');
      return;
    }
    setWebAuth({ provider, url: `${apiUrl}/api/music/connections/start/${provider}`, token });
  };

  const disconnect = async (provider: 'spotify' | 'deezer') => {
    if (!apiUrl) return;
    const token = await getSupabaseAccessToken();
    if (!token) return;
    const res = await fetch(`${apiUrl}/api/music/connections/${provider}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) await refresh();
  };

  if (webAuth) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.webHeader}>
          <TouchableOpacity onPress={() => setWebAuth(null)}><Text style={styles.back}>‹ Annuler</Text></TouchableOpacity>
          <Text style={styles.webTitle}>Connexion {webAuth.provider === 'spotify' ? 'Spotify' : 'Deezer'}</Text>
          <View style={{ width: 60 }} />
        </View>
        <WebView
          source={{ uri: webAuth.url, headers: { Authorization: `Bearer ${webAuth.token}` } }}
          onShouldStartLoadWithRequest={(request) => {
            if (!request.url.startsWith('keep://music-connections')) return true;
            setWebAuth(null);
            if (request.url.includes('connected=1')) {
              refresh();
              Alert.alert('Connecté', `${webAuth.provider === 'spotify' ? 'Spotify' : 'Deezer'} est maintenant relié à KEEP.`);
            } else {
              Alert.alert('Connexion annulée', 'Aucun changement n’a été enregistré.');
            }
            return false;
          }}
          startInLoadingState
          style={{ backgroundColor: colors.background }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}><Text style={styles.back}>‹ Retour</Text></TouchableOpacity>
        <Text style={styles.title}>Services musicaux</Text>
        <Text style={styles.subtitle}>Connecte tes comptes une fois. KEEP peut ensuite reconnaître, comparer et classer sans créer de doublons.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {PROVIDERS.map((provider) => {
          const status = statuses[provider.key];
          const connected = Boolean(status?.connected);
          const configured = provider.key === 'apple_music' ? true : Boolean(status?.configured);
          return (
            <View key={provider.key} style={styles.card}>
              <View style={styles.logo}><Text style={styles.logoText}>{provider.glyph}</Text></View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{provider.name}</Text>
                  {connected && <Text style={styles.connectedBadge}>CONNECTÉ</Text>}
                </View>
                <Text style={styles.description}>{provider.description}</Text>
                {!loading && !configured && provider.key !== 'youtube_music' && provider.key !== 'soundcloud' && provider.key !== 'tidal' && (
                  <Text style={styles.configNeeded}>Clés API serveur à renseigner</Text>
                )}
              </View>
              {connected && (provider.key === 'spotify' || provider.key === 'deezer') ? (
                <TouchableOpacity style={styles.manageButton} onPress={() => disconnect(provider.key)}>
                  <Text style={styles.manageButtonText}>Retirer</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.connectButton} onPress={() => connect(provider.key)}>
                  <Text style={styles.connectButtonText}>{provider.key === 'youtube_music' || provider.key === 'soundcloud' || provider.key === 'tidal' ? 'Préparer' : 'Connecter'}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Anti-doublon KEEP</Text>
          <Text style={styles.ruleText}>Avant de proposer « Garder », KEEP vérifie la bibliothèque connectée. Si le morceau existe déjà, l’action disparaît et l’écran indique directement dans quelle playlist il est déjà rangé.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  back: { color: colors.primaryLight, fontWeight: '700', fontSize: 14 },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  logo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.textPrimary, fontSize: 22, fontWeight: '800' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  connectedBadge: { color: colors.keep, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  description: { color: colors.textSecondary, fontSize: 11, lineHeight: 15, marginTop: 3 },
  configNeeded: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  connectButton: { paddingHorizontal: spacing.md, minHeight: 38, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  connectButtonText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  manageButton: { paddingHorizontal: spacing.md, minHeight: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  manageButtonText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  ruleCard: { backgroundColor: colors.backgroundElevated, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.sm },
  ruleTitle: { color: colors.keep, fontSize: 13, fontWeight: '800' },
  ruleText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  webHeader: { height: 56, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  webTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
});
