import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from '../utils/keepAlert';
import {
  clearArtistTrack,
  getArtistTrackAccess,
  getArtistTrackMasterSignedUrl,
  loadMyArtistTracks,
  loadMyArtistTrackPurchases,
  loadMyArtistTrackSales,
  markArtistTrackPaid,
  MyArtistTrack,
  ArtistTrackTransaction,
  PricingMode,
  saveArtistTrack,
  uploadArtistTrackCover,
  uploadArtistTrackMaster,
  uploadArtistTrackPreview,
} from '../services/artistTrackSaleService';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

// Adel (14/09/2026) : "comment va se passer pour qu'un utilisateur puisse
// faire payer ses musiques, ses albums" -- modèle Bandcamp ("regarde la
// concurrence") : extrait librement écoutable, prix fixe ou "nomme ton
// prix" avec minimum. Distinct de la vente de playlists (curation de
// morceaux externes, packages/mobile/src/services/playlistSaleService.ts) :
// ici c'est SA PROPRE création, donc aucun risque de requalification en
// revendeur de musique -- d'où le rappel explicite des droits ci-dessous.

export default function ArtistTrackSaleScreen({ navigation }: any) {
  const user = useUserStore((state) => state.user);
  const [planCode, setPlanCode] = useState('FREE');
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myTracks, setMyTracks] = useState<MyArtistTrack[]>([]);
  const [mySales, setMySales] = useState<ArtistTrackTransaction[]>([]);
  const [myPurchases, setMyPurchases] = useState<ArtistTrackTransaction[]>([]);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [albumName, setAlbumName] = useState('');
  const [pricingMode, setPricingMode] = useState<PricingMode>('FIXED');
  const [priceText, setPriceText] = useState('');
  const [minPriceText, setMinPriceText] = useState('');
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverPreviewUri, setCoverPreviewUri] = useState<string | null>(null);
  const [masterPath, setMasterPath] = useState<string | null>(null);
  const [masterName, setMasterName] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const [access, tracks, sales, purchases] = await Promise.all([
        getArtistTrackAccess(),
        loadMyArtistTracks(),
        loadMyArtistTrackSales(),
        loadMyArtistTrackPurchases(),
      ]);
      setPlanCode(access.planCode);
      setUnlocked(access.unlocked);
      setMyTracks(tracks);
      setMySales(sales);
      setMyPurchases(purchases);
    } catch {
      setUnlocked(false);
      setMyTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Adel (16-17/09/2026) : "l'utilisateur se fait payer directement" -- une
  // fois payé sur SON lien perso (hors KEEP), l'artiste confirme ici -- ça
  // débloque le fichier complet pour cet acheteur précis.
  const handleMarkPaid = (transaction: ArtistTrackTransaction) => {
    Alert.alert(
      'Confirmer la réception du paiement',
      `Confirme uniquement si tu as bien reçu ${(transaction.amountCents / 100).toFixed(2)} ${transaction.currencyCode} de @${transaction.counterpartUsername} sur ton lien de paiement personnel. Ça débloquera "${transaction.trackTitle}" pour lui.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'J’ai bien été payé', onPress: async () => {
            try { await markArtistTrackPaid(transaction.id); await refresh(); }
            catch (e: any) { Alert.alert('Erreur', e?.message || 'Impossible de confirmer ce paiement.'); }
          },
        },
      ],
    );
  };

  const downloadPurchasedTrack = async (purchase: ArtistTrackTransaction) => {
    if (downloadBusyId) return;
    if (!purchase.masterStoragePath) { Alert.alert('Pas encore de fichier complet', 'L’artiste n’a pas encore déposé le fichier complet -- il verra ta commande dès qu’il le fera.'); return; }
    setDownloadBusyId(purchase.id);
    try {
      const url = await getArtistTrackMasterSignedUrl(purchase.masterStoragePath);
      if (!url) { Alert.alert('Erreur', 'Impossible de générer le lien de téléchargement pour le moment.'); return; }
      await Linking.openURL(url);
    } finally {
      setDownloadBusyId(null);
    }
  };

  useEffect(() => { void refresh(); }, [refresh]);

  const pickPreview = async () => {
    if (!user) return;
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setBusy(true);
    try {
      const path = await uploadArtistTrackPreview(user.id, result.assets[0].uri);
      setPreviewPath(path);
      setPreviewName(result.assets[0].name || 'extrait.mp3');
    } catch {
      Alert.alert('Envoi impossible', 'L’extrait n’a pas pu être envoyé. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const pickCover = async () => {
    if (!user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Autorisation requise', 'Autorise l’accès aux photos pour choisir une pochette.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setBusy(true);
    try {
      const uri = result.assets[0].uri;
      const path = await uploadArtistTrackCover(user.id, uri);
      setCoverPath(path);
      setCoverPreviewUri(uri);
    } catch {
      Alert.alert('Envoi impossible', 'La pochette n’a pas pu être envoyée. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const pickMaster = async () => {
    if (!user) return;
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setBusy(true);
    try {
      const path = await uploadArtistTrackMaster(user.id, result.assets[0].uri);
      setMasterPath(path);
      setMasterName(result.assets[0].name || 'version-complete.mp3');
    } catch {
      Alert.alert('Envoi impossible', 'Le fichier complet n’a pas pu être envoyé. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setTitle(''); setAlbumName(''); setPricingMode('FIXED'); setPriceText(''); setMinPriceText('');
    setPreviewPath(null); setPreviewName(''); setCoverPath(null); setCoverPreviewUri(null);
    setMasterPath(null); setMasterName(''); setRightsConfirmed(false);
  };

  const submit = async () => {
    if (busy) return;
    const cleanTitle = title.trim();
    const priceEuros = Number(priceText.replace(',', '.'));
    if (!cleanTitle) { Alert.alert('Titre requis', 'Donne un titre à ton morceau.'); return; }
    if (!previewPath) { Alert.alert('Extrait requis', 'Ajoute un extrait audio écoutable avant de publier.'); return; }
    if (!Number.isFinite(priceEuros) || priceEuros <= 0) { Alert.alert('Prix invalide', 'Indique un prix supérieur à 0.'); return; }
    let minPriceCents: number | null = null;
    if (pricingMode === 'PAY_WHAT_YOU_WANT') {
      const minEuros = Number(minPriceText.replace(',', '.'));
      if (!Number.isFinite(minEuros) || minEuros <= 0 || minEuros > priceEuros) {
        Alert.alert('Minimum invalide', 'Le minimum "nomme ton prix" doit être positif et ne peut pas dépasser le prix suggéré.');
        return;
      }
      minPriceCents = Math.round(minEuros * 100);
    }
    if (!rightsConfirmed) { Alert.alert('Confirmation requise', 'Tu dois confirmer détenir les droits sur ce contenu avant de le publier.'); return; }

    setBusy(true);
    try {
      await saveArtistTrack({
        title: cleanTitle,
        albumName: albumName.trim() || null,
        pricingMode,
        priceCents: Math.round(priceEuros * 100),
        minPriceCents,
        previewStoragePath: previewPath,
        coverStoragePath: coverPath,
        masterStoragePath: masterPath,
        rightsConfirmed: true,
      });
      resetForm();
      await refresh();
      Alert.alert('Publié', 'Ton titre est visible sur ton profil public avec son extrait.');
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.includes('ARTIST_TRACK_SALE_REQUIRES_CREATOR_PRO')) Alert.alert('Formule requise', 'Vendre ta musique demande la formule Creator Pro ou Venue Pro.');
      else Alert.alert('Publication impossible', 'Vérifie les champs et réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const removeTrack = (track: MyArtistTrack) => {
    Alert.alert('Retirer de la vente', `"${track.title}" ne sera plus visible sur ton profil. Confirmer ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: async () => { await clearArtistTrack(track.id).catch(() => {}); await refresh(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} hitSlop={8}>
          <Text style={styles.back}>‹ Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Vendre ma musique</Text>
        <Text style={styles.subtitle}>Extrait écoutable par tous, titre complet vendu directement par toi à l’acheteur.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={colors.primaryLight} /> : !unlocked ? (
          <View style={styles.lockedCard}>
            <Text style={styles.lockedTitle}>Formule requise</Text>
            <Text style={styles.lockedText}>Vendre ta propre musique demande la formule Creator Pro ou Venue Pro (formule actuelle : {planCode}).</Text>
          </View>
        ) : (
          <>
            <View style={styles.rightsCard}>
              <Text style={styles.rightsTitle}>⚠️ Réservé à TA propre création</Text>
              <Text style={styles.rightsText}>Cette vente concerne uniquement une musique dont tu détiens réellement les droits (composition et/ou interprétation) -- jamais un morceau découvert ailleurs (Spotify, Deezer...). Pour partager ta sélection de morceaux favoris, utilise plutôt "Vendre mes playlists".</Text>
            </View>

            <Text style={styles.sectionLabel}>Titre</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Nom du morceau" placeholderTextColor={colors.textMuted} />

            <Text style={styles.sectionLabel}>Album (facultatif)</Text>
            <TextInput style={styles.input} value={albumName} onChangeText={setAlbumName} placeholder="Nom de l’album" placeholderTextColor={colors.textMuted} />

            <Text style={styles.sectionLabel}>Prix</Text>
            <View style={styles.pricingModeRow}>
              <TouchableOpacity style={[styles.pricingChip, pricingMode === 'FIXED' && styles.pricingChipOn]} onPress={() => setPricingMode('FIXED')}>
                <Text style={[styles.pricingChipText, pricingMode === 'FIXED' && styles.pricingChipTextOn]}>Prix fixe</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pricingChip, pricingMode === 'PAY_WHAT_YOU_WANT' && styles.pricingChipOn]} onPress={() => setPricingMode('PAY_WHAT_YOU_WANT')}>
                <Text style={[styles.pricingChipText, pricingMode === 'PAY_WHAT_YOU_WANT' && styles.pricingChipTextOn]}>Nomme ton prix</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} value={priceText} onChangeText={setPriceText} placeholder={pricingMode === 'FIXED' ? 'Prix en € (ex: 2.99)' : 'Prix suggéré en €'} placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
            {pricingMode === 'PAY_WHAT_YOU_WANT' ? (
              <TextInput style={styles.input} value={minPriceText} onChangeText={setMinPriceText} placeholder="Minimum en € (ex: 0.99)" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
            ) : null}

            <Text style={styles.sectionLabel}>Extrait audio (obligatoire, écoutable par tous)</Text>
            <TouchableOpacity style={styles.pickButton} onPress={pickPreview} disabled={busy}>
              <Text style={styles.pickButtonText}>{previewName || '🎤 Choisir un extrait audio'}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Pochette (facultatif)</Text>
            <TouchableOpacity style={styles.pickButton} onPress={pickCover} disabled={busy}>
              {coverPreviewUri ? <Image source={{ uri: coverPreviewUri }} style={styles.coverThumb} /> : null}
              <Text style={styles.pickButtonText}>{coverPreviewUri ? 'Changer la pochette' : '🖼 Choisir une pochette'}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Version complète (facultatif pour l’instant)</Text>
            <TouchableOpacity style={styles.pickButton} onPress={pickMaster} disabled={busy}>
              <Text style={styles.pickButtonText}>{masterName || '📀 Déposer le fichier complet'}</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>Le fichier complet est mis en sécurité -- il ne sera livré à un acheteur qu'après TA confirmation manuelle d'avoir bien été payé sur ton lien de paiement personnel. Personne ne peut y accéder avant, pas même Loki.</Text>

            <TouchableOpacity style={styles.rightsCheckRow} onPress={() => setRightsConfirmed((v) => !v)}>
              <View style={[styles.checkbox, rightsConfirmed && styles.checkboxOn]}>{rightsConfirmed ? <Text style={styles.checkboxMark}>✓</Text> : null}</View>
              <Text style={styles.rightsCheckText}>Je confirme détenir les droits sur ce contenu et être autorisé à le vendre.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.submitButton, busy && styles.submitButtonBusy]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#0E0A14" /> : <Text style={styles.submitButtonText}>Publier ce titre</Text>}
            </TouchableOpacity>

            {myTracks.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Mes titres en vente</Text>
                {myTracks.filter((t) => t.isActive).map((track) => (
                  <View key={track.id} style={styles.myTrackRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.myTrackTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.myTrackPrice}>
                        {track.pricingMode === 'PAY_WHAT_YOU_WANT' && track.minPriceCents != null
                          ? `Nomme ton prix · dès ${(track.minPriceCents / 100).toFixed(2)}€`
                          : `${(track.priceCents / 100).toFixed(2)}€`}
                        {track.hasMaster ? ' · fichier complet déposé' : ' · extrait seulement'}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.removeButton} onPress={() => removeTrack(track)}>
                      <Text style={styles.removeButtonText}>Retirer</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : null}

            {mySales.filter((s) => s.status === 'PENDING').length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Ventes en attente ({mySales.filter((s) => s.status === 'PENDING').length})</Text>
                {mySales.filter((s) => s.status === 'PENDING').map((sale) => (
                  <View key={sale.id} style={styles.myTrackRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.myTrackTitle} numberOfLines={1}>@{sale.counterpartUsername} · {sale.trackTitle}</Text>
                      <Text style={styles.myTrackPrice}>{(sale.amountCents / 100).toFixed(2)}€ -- pas encore confirmé</Text>
                    </View>
                    <TouchableOpacity style={styles.submitButton} onPress={() => handleMarkPaid(sale)}>
                      <Text style={[styles.submitButtonText, { fontSize: 12 }]}>✓ Payé</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : null}

            {myPurchases.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Mes achats ({myPurchases.length})</Text>
                {myPurchases.map((purchase) => (
                  <View key={purchase.id} style={styles.myTrackRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.myTrackTitle} numberOfLines={1}>@{purchase.counterpartUsername} · {purchase.trackTitle}</Text>
                      <Text style={styles.myTrackPrice}>{purchase.status === 'COMPLETED' ? '✓ Débloqué' : '⏳ En attente de confirmation'}</Text>
                    </View>
                    {purchase.status === 'COMPLETED' ? (
                      <TouchableOpacity style={styles.removeButton} disabled={downloadBusyId === purchase.id} onPress={() => void downloadPurchasedTrack(purchase)}>
                        <Text style={[styles.removeButtonText, { color: '#7CF2B9' }]}>{downloadBusyId === purchase.id ? '…' : '⬇ Fichier'}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  backButton: { alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#5B3F8C', borderWidth: 1, borderColor: '#A884FA', alignItems: 'center', justifyContent: 'center' },
  back: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { color: '#E9E3F0', fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 60, gap: 4 },
  lockedCard: { marginTop: 20, padding: 16, borderRadius: radius.lg, backgroundColor: '#151020', borderWidth: 1, borderColor: '#3F3154' },
  lockedTitle: { color: '#FFD166', fontSize: 15, fontWeight: '900' },
  lockedText: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  rightsCard: { marginTop: 8, marginBottom: 10, padding: 12, borderRadius: radius.lg, backgroundColor: '#241A12', borderWidth: 1, borderColor: '#5C4322' },
  rightsTitle: { color: '#FFD166', fontSize: 14, fontWeight: '900' },
  rightsText: { color: '#E9E3F0', fontSize: 12, lineHeight: 17, marginTop: 5 },
  sectionLabel: { color: colors.primaryLight, fontSize: 13, fontWeight: '900', marginTop: 14, marginBottom: 6 },
  input: { minHeight: 46, borderRadius: 14, backgroundColor: '#1A1225', borderWidth: 1, borderColor: '#3F3154', paddingHorizontal: 14, color: colors.textPrimary, fontSize: 14, marginTop: 4 },
  pricingModeRow: { flexDirection: 'row', gap: 8 },
  pricingChip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#21182F', borderWidth: 1, borderColor: '#40354E', alignItems: 'center', justifyContent: 'center' },
  pricingChipOn: { backgroundColor: '#5B3F8C', borderColor: '#A884FA' },
  pricingChipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  pricingChipTextOn: { color: '#FFF' },
  pickButton: { minHeight: 46, borderRadius: 14, backgroundColor: '#1A1225', borderWidth: 1, borderColor: '#3F3154', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  pickButtonText: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  coverThumb: { width: 32, height: 32, borderRadius: 8 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  rightsCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: '#8B5CF6' },
  checkboxMark: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  rightsCheckText: { flex: 1, color: '#E9E3F0', fontSize: 12, lineHeight: 17 },
  submitButton: { minHeight: 48, borderRadius: 24, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  submitButtonBusy: { opacity: 0.7 },
  submitButtonText: { color: '#0E0A14', fontSize: 15, fontWeight: '900' },
  myTrackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#151020', borderWidth: 1, borderColor: '#3F3154', marginTop: 8 },
  myTrackTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  myTrackPrice: { color: '#E5F266', fontSize: 12, fontWeight: '800', marginTop: 2 },
  removeButton: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#2B1A22', borderWidth: 1, borderColor: '#7A3049', alignItems: 'center', justifyContent: 'center' },
  removeButtonText: { color: '#FF9FB6', fontSize: 12, fontWeight: '800' },
});
