import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useUserStore } from '../store/useUserStore';
import { readClipboardText } from '../services/sharingService';
import {
  loadMyMusicStats, loadSharedMusicLibrary, musicLinkFromText, requireMusicImportAccount,
  resolveSharedMusicLink, useSharedMusicImportStore,
  type MyMusicStats, type SharedLibraryItem, type SharedMusicTrack,
} from '../services/sharedMusicImportService';
import MusicServiceIcon, { MUSIC_SERVICE_BRAND_COLORS } from './MusicServiceIcon';
import type { MusicServiceKey } from '../services/keylessMusicBridge';
import KeepModal from './KeepModal';

const platformLabels: Record<string, string> = {
  spotify: 'Spotify', apple_music: 'Apple Music', appleMusic: 'Apple Music',
  youtube: 'YouTube', youtube_music: 'YouTube Music', youtubeMusic: 'YouTube Music',
  deezer: 'Deezer', soundcloud: 'SoundCloud', tidal: 'Tidal', amazonMusic: 'Amazon Music',
};
const iconKey = (key: string): MusicServiceKey | null => {
  const normalized = ({ appleMusic: 'apple_music', youtubeMusic: 'youtube_music', youtube: 'youtube_music' } as Record<string, string>)[key] ?? key;
  return normalized in MUSIC_SERVICE_BRAND_COLORS ? normalized as MusicServiceKey : null;
};

export function SharedMusicPlatformLinks({ links }: { links: Record<string, string> }) {
  const [error, setError] = useState('');
  const safeLinks = Object.entries(links).filter(([, url]) => typeof url === 'string' && /^https:\/\//i.test(url));
  if (!safeLinks.length) return null;
  return <View>
    <Text style={s.label}>Ouvrir dans</Text>
    <View style={s.platforms}>{safeLinks.map(([key, url]) => {
      const icon = iconKey(key);
      const label = platformLabels[key] ?? key;
      return <TouchableOpacity key={key} style={s.platform} accessibilityRole="link" accessibilityLabel={`Ouvrir dans ${label}`} testID={`shared-music-open-${key}`}
        onPress={() => { setError(''); void Linking.openURL(url).catch(() => setError(`Impossible d’ouvrir ${label}. Réessaie.`)); }}>
        {icon ? <MusicServiceIcon service={icon} size={24} /> : <Text style={s.text}>♫</Text>}
        <Text style={s.platformLabel}>{label}</Text>
      </TouchableOpacity>;
    })}</View>
    {error ? <Text accessibilityRole="alert" style={s.text}>{error}</Text> : null}
  </View>;
}

export function MyMusicStatsContent({ stats }: { stats: MyMusicStats }) {
  return <View testID="my-music-stats">
    <Text style={s.label}>Top 5 genres</Text>
    {stats.topGenres.slice(0, 5).map((entry) => <Text style={s.text} key={entry.name}>{entry.name} · {entry.count}</Text>)}
    {!stats.topGenres.length ? <Text style={s.text}>Pas encore de genres</Text> : null}
    <Text style={s.label}>Top 5 artistes</Text>
    {stats.topArtists.slice(0, 5).map((entry) => <Text style={s.text} key={entry.name}>{entry.name} · {entry.count}</Text>)}
    {!stats.topArtists.length ? <Text style={s.text}>Pas encore d’artistes</Text> : null}
    <Text style={s.text}>♥ Coups de cœur · {stats.hearts}</Text>
    <Text style={s.text}>Pas aimé · {stats.dislikes}</Text>
    <Text style={s.text}>GARDER · {stats.keeps}</Text>
    <Text style={s.label}>Importés par plateforme</Text>
    {Object.entries(stats.importedByPlatform).map(([key, count]) => <Text style={s.text} key={key}>{platformLabels[key] ?? key} · {count}</Text>)}
  </View>;
}

export default function SharedMusicLibraryPanel() {
  const userId = useUserStore((state) => state.user?.id);
  const demo = useUserStore((state) => state.isDemoMode);
  const guest = useUserStore((state) => state.isLocalGuest);
  const focused = useIsFocused();
  const revision = useSharedMusicImportStore((state) => state.revision);
  const [items, setItems] = useState<SharedLibraryItem[]>([]);
  const [libraryError, setLibraryError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SharedMusicTrack | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [stats, setStats] = useState<MyMusicStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [statsBusy, setStatsBusy] = useState(false);
  const busyRef = useRef(false);
  const requestRef = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestRef.current += 1; };
  }, []);
  useEffect(() => {
    requestRef.current += 1;
    setPreview(null); setUrl(''); setError(''); setItems([]); setStats(null); setStatsError('');
    setImportOpen(false); setStyleOpen(false);
  }, [userId, demo, guest]);

  const loadLibrary = useCallback(async () => {
    if (!userId || demo || guest) return;
    const request = requestRef.current;
    setLibraryError('');
    try {
      const rows = await loadSharedMusicLibrary();
      if (mounted.current && request === requestRef.current) setItems(rows);
    } catch (e) {
      if (mounted.current && request === requestRef.current) setLibraryError((e as Error).message);
    }
  }, [userId, demo, guest]);
  useEffect(() => { if (focused) void loadLibrary(); }, [focused, revision, loadLibrary]);

  const runImport = async (confirm: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    setImportOpen(true);
    const request = requestRef.current;
    try {
      requireMusicImportAccount();
      const link = confirm ? url : musicLinkFromText(await readClipboardText());
      if (!mounted.current || request !== requestRef.current) return;
      if (!confirm) { setUrl(link); setPreview(null); }
      const result = await resolveSharedMusicLink(link, !confirm);
      if (!mounted.current || request !== requestRef.current) return;
      if (confirm) { setImportOpen(false); setPreview(null); }
      else setPreview(result.track);
    } catch (e) {
      if (mounted.current && request === requestRef.current) setError((e as Error).message);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const loadStats = useCallback(async () => {
    const request = requestRef.current;
    setStatsBusy(true); setStatsError('');
    try {
      const result = await loadMyMusicStats();
      if (mounted.current && request === requestRef.current) setStats(result);
    } catch (e) {
      if (mounted.current && request === requestRef.current) setStatsError((e as Error).message);
    } finally { if (mounted.current) setStatsBusy(false); }
  }, []);
  useEffect(() => { if (styleOpen) void loadStats(); }, [styleOpen, revision, loadStats]);

  return <View style={s.panel} testID="shared-music-library">
    <View style={s.actions}>
      <TouchableOpacity style={s.button} accessibilityRole="button" testID="shared-music-add-link" disabled={busy} onPress={() => { void runImport(false); }}>
        <Text style={s.buttonText}>＋ Ajouter un lien</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.button} accessibilityRole="button" testID="my-music-style-open" onPress={() => setStyleOpen(true)}>
        <Text style={s.buttonText}>Mon style</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.info} accessibilityRole="button" accessibilityLabel="Aide pour ajouter une musique" testID="shared-music-help" onPress={() => setHelpOpen(true)}>
        <Text style={s.buttonText}>ⓘ</Text>
      </TouchableOpacity>
    </View>
    {libraryError ? <View><Text style={s.text} accessibilityRole="alert">{libraryError}</Text><TouchableOpacity style={s.button} onPress={() => { void loadLibrary(); }}><Text style={s.buttonText}>Réessayer</Text></TouchableOpacity></View> : null}
    {items.length ? <Text style={s.label}>Titres importés · {items.length}</Text> : null}
    {items.map((item) => <View key={item.id} style={s.track} testID="shared-music-library-item">
      <View style={s.trackHeader}>
        {item.artwork_url ? <Image source={{ uri: item.artwork_url }} style={s.artwork} /> : null}
        <View style={s.trackText}><Text style={s.text}>{item.title}</Text><Text style={s.label}>{item.artist}</Text></View>
      </View>
      <SharedMusicPlatformLinks links={item.metadata?.platformLinks ?? {}} />
    </View>)}
    <KeepModal visible={importOpen} transparent animationType="fade" onRequestClose={() => { if (!busy) setImportOpen(false); }}>
      <View style={s.overlay}><View style={s.modal} testID="shared-music-preview">
        <ScrollView>
          <Text style={s.title}>Ajouter une musique</Text>
          {busy ? <ActivityIndicator color="#FFFFFF" accessibilityLabel="Résolution du lien musical" /> : null}
          {preview ? <View>
            {preview.artworkUrl ? <Image source={{ uri: preview.artworkUrl }} style={s.previewArtwork} /> : null}
            <Text style={s.text}>{preview.title}</Text><Text style={s.label}>{preview.artist}</Text>
            <SharedMusicPlatformLinks links={preview.platformLinks} />
          </View> : null}
          {error ? <Text style={s.text} accessibilityRole="alert" testID="shared-music-error">{error}</Text> : null}
          {error ? <TouchableOpacity style={s.button} disabled={busy} testID="shared-music-retry" onPress={() => { void runImport(Boolean(preview)); }}><Text style={s.buttonText}>Réessayer</Text></TouchableOpacity> : null}
          {preview && !error ? <TouchableOpacity style={s.button} disabled={busy} testID="shared-music-confirm" onPress={() => { void runImport(true); }}><Text style={s.buttonText}>AJOUTER</Text></TouchableOpacity> : null}
          <TouchableOpacity style={s.button} disabled={busy} onPress={() => setImportOpen(false)}><Text style={s.buttonText}>Fermer</Text></TouchableOpacity>
        </ScrollView>
      </View></View>
    </KeepModal>
    <KeepModal visible={styleOpen} transparent animationType="fade" onRequestClose={() => setStyleOpen(false)}>
      <View style={s.overlay}><View style={s.modal} testID="my-music-style">
        <ScrollView>
          <Text style={s.title}>Mon style</Text>
          {statsBusy ? <ActivityIndicator color="#FFFFFF" /> : null}
          {statsError ? <View><Text style={s.text} accessibilityRole="alert">{statsError}</Text><TouchableOpacity style={s.button} testID="my-music-stats-retry" onPress={() => { void loadStats(); }}><Text style={s.buttonText}>Réessayer</Text></TouchableOpacity></View> : null}
          {stats && !statsError ? <MyMusicStatsContent stats={stats} /> : null}
          <TouchableOpacity style={s.button} onPress={() => setStyleOpen(false)}><Text style={s.buttonText}>Fermer</Text></TouchableOpacity>
        </ScrollView>
      </View></View>
    </KeepModal>
    <KeepModal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
      <View style={s.overlay}><View style={s.modal}>
        <Text style={s.title}>Ajouter une musique</Text>
        <Text style={s.text}>Copie le lien d’une musique, puis touche ＋ Ajouter un lien. Vérifie l’aperçu et touche AJOUTER. Tu peux aussi utiliser Partager → Loki Music depuis ta plateforme.</Text>
        <TouchableOpacity style={s.button} onPress={() => setHelpOpen(false)}><Text style={s.buttonText}>Fermer</Text></TouchableOpacity>
      </View></View>
    </KeepModal>
  </View>;
}

const s = StyleSheet.create({
  panel: { marginHorizontal: 18, marginTop: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  button: { minHeight: 48, minWidth: 48, padding: 12, backgroundColor: '#29213D', borderColor: '#B79CFF', borderWidth: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginVertical: 4 },
  info: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  text: { color: '#FFFFFF', fontSize: 14, lineHeight: 21 },
  label: { color: '#F1ECFF', fontSize: 12, lineHeight: 18, marginVertical: 6 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  track: { backgroundColor: '#1A1628', borderRadius: 12, padding: 12, marginVertical: 6 },
  trackHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackText: { flex: 1, minWidth: 0 },
  artwork: { width: 48, height: 48, borderRadius: 8 },
  previewArtwork: { width: 96, height: 96, borderRadius: 12, alignSelf: 'center', marginBottom: 12 },
  platforms: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  platform: { minWidth: 48, minHeight: 48, padding: 8, alignItems: 'center', justifyContent: 'center' },
  platformLabel: { color: '#FFFFFF', fontSize: 11, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '85%', backgroundColor: '#171222', padding: 20, borderRadius: 18, borderColor: '#B79CFF', borderWidth: 1 },
});
