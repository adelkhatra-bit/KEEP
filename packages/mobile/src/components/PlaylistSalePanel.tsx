import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import { getPlaylistSaleAccess, PlaylistSaleAccess, PlaylistSaleOffer, setPlaylistSalePrice, clearPlaylistSalePrice, loadMyPlaylistSaleOffers } from '../services/playlistSaleService';
import { Alert as KeepAlert } from '../utils/keepAlert';

type PriceEditState = { playlistId: string; priceText: string } | null;

export default function PlaylistSalePanel({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [access, setAccess] = useState<PlaylistSaleAccess | null>(null);
  const [offers, setOffers] = useState<PlaylistSaleOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PriceEditState>(null);
  const [error, setError] = useState('');

  const loadData = async () => {
    if (!user || isLocalGuest || isDemoMode) {
      setAccess(null);
      setOffers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [liveAccess, liveOffers] = await Promise.all([
        getPlaylistSaleAccess(),
        loadMyPlaylistSaleOffers(),
      ]);
      setAccess(liveAccess);
      setOffers(liveOffers);
    } catch (e: any) {
      setError(e?.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.id, isLocalGuest, isDemoMode]);

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      void loadData();
    });
    return () => unsubscribe?.();
  }, [navigation]);

  const handleSetPrice = async (playlistId: string, playlistName: string, priceText: string) => {
    const priceCents = Math.round(parseFloat(priceText) * 100);
    if (!priceText || isNaN(priceCents) || priceCents <= 0) {
      KeepAlert.alert('Prix invalide', 'Entrez un prix positif.');
      return;
    }
    setBusy(true);
    try {
      await setPlaylistSalePrice(playlistId, playlistName, priceCents);
      await loadData();
      setEditing(null);
      KeepAlert.alert('Succès', `Playlist en vente pour ${(priceCents / 100).toFixed(2)}€.`);
    } catch (e: any) {
      KeepAlert.alert('Erreur', e?.message || 'Impossible de fixer le prix.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearPrice = async (playlistId: string) => {
    Alert.alert('Désactiver la vente', 'La playlist ne sera plus en vente. Les acheteurs passés auront toujours accès.', [
      { text: 'Annuler', onPress: () => {} },
      {
        text: 'Désactiver',
        onPress: async () => {
          setBusy(true);
          try {
            await clearPlaylistSalePrice(playlistId);
            await loadData();
            KeepAlert.alert('Succès', 'Playlist retirée de la vente.');
          } catch (e: any) {
            KeepAlert.alert('Erreur', e?.message || 'Impossible de désactiver.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (!user) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.empty}>
          <Text style={s.emptyText}>Crée un compte KEEP pour vendre tes playlists.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLocalGuest || isDemoMode) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.empty}>
          <Text style={s.emptyText}>Mode invité : connexion requise pour vendre.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} accessibilityLabel="Retour">
          <Text style={s.back}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>💰 Vendre mes playlists</Text>
          <Text style={s.subtitle}>Fixe tes prix, gagne avec ta sélection</Text>
        </View>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={s.centerView}>
            <ActivityIndicator color={colors.primaryLight} size="large" />
          </View>
        ) : error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>❌ {error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => void loadData()}>
              <Text style={s.retryBtnText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : !access ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyBoxText}>Impossible de charger les données d'accès.</Text>
          </View>
        ) : (
          <>
            {/* Accès */}
            <View style={[s.accessCard, access.unlocked && s.accessCardUnlocked]}>
              <Text style={s.accessEyebrow}>ACCÈS VENTE</Text>
              <View style={s.accessRow}>
                <View style={s.accessStat}>
                  <Text style={s.accessValue}>{access.followers}</Text>
                  <Text style={s.accessLabel}>Abonnés</Text>
                </View>
                <View style={s.accessSeparator} />
                <View style={s.accessStat}>
                  <Text style={s.accessValue}>{access.threshold}</Text>
                  <Text style={s.accessLabel}>Seuil requis</Text>
                </View>
                <View style={s.accessSeparator} />
                <View style={s.accessStat}>
                  <Text style={access.unlocked ? s.accessValueGreen : s.accessValueRed}>{access.unlocked ? '✓' : '✗'}</Text>
                  <Text style={s.accessLabel}>{access.unlocked ? 'Débloquée' : 'Verrouillée'}</Text>
                </View>
              </View>
              {!access.unlocked && (
                <Text style={s.accessHint}>
                  Atteins {access.threshold - access.followers} abonné{access.threshold - access.followers > 1 ? 's' : ''} de plus pour déverrouiller la vente.
                </Text>
              )}
            </View>

            {/* Offres Actives */}
            {offers.length > 0 && (
              <View style={s.offersSection}>
                <Text style={s.sectionTitle}>MES OFFRES ACTIVES ({offers.length})</Text>
                <FlatList
                  scrollEnabled={false}
                  data={offers}
                  keyExtractor={(item) => item.playlistId}
                  renderItem={({ item }) => (
                    <View style={s.offerCard}>
                      <View style={s.offerTop}>
                        <View style={s.offerInfo}>
                          <Text style={s.offerName}>{item.playlistName}</Text>
                          <Text style={s.offerPrice}>
                            {(item.priceCents / 100).toFixed(2)}€ {item.currencyCode}
                          </Text>
                        </View>
                        <View style={s.offerBadge}>
                          <Text style={s.offerBadgeText}>EN VENTE</Text>
                        </View>
                      </View>
                      <Text style={s.offerDate}>Mise à jour: {new Date(item.updatedAt).toLocaleDateString('fr-FR')}</Text>
                      <View style={s.offerActions}>
                        <TouchableOpacity
                          style={s.editBtn}
                          disabled={busy}
                          onPress={() => setEditing({ playlistId: item.playlistId, priceText: (item.priceCents / 100).toFixed(2) })}
                        >
                          <Text style={s.editBtnText}>✎ Modifier</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.removeBtn}
                          disabled={busy}
                          onPress={() => void handleClearPrice(item.playlistId)}
                        >
                          <Text style={s.removeBtnText}>✕ Retirer</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                />
              </View>
            )}

            {/* Message si verrouillé */}
            {!access.unlocked && (
              <View style={s.lockedBox}>
                <Text style={s.lockedTitle}>🔒 Vente verrouillée</Text>
                <Text style={s.lockedText}>
                  Tu dois avoir au moins {access.threshold} abonnés pour vendre tes playlists. Partage ton profil et gagne des abonnés !
                </Text>
              </View>
            )}

            {/* Message si accès mais pas d'offres */}
            {access.unlocked && offers.length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyBoxTitle}>Aucune playlist en vente</Text>
                <Text style={s.emptyBoxText}>Tu peux commencer à en vendre en sélectionnant une playlist dans ton profil.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Modal d'édition de prix */}
      {editing && (
        <View style={s.modal}>
          <TouchableOpacity style={s.modalOverlay} onPress={() => setEditing(null)} />
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Modifier le prix</Text>
            <Text style={s.modalSubtitle}>{editing.playlistId}</Text>
            <View style={s.modalInput}>
              <Text style={s.modalCurrency}>€</Text>
              <TextInput
                style={s.modalTextInput}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={editing.priceText}
                onChangeText={(text) => setEditing({ ...editing, priceText: text })}
                editable={!busy}
              />
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                disabled={busy}
                onPress={() => setEditing(null)}
              >
                <Text style={s.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalSaveBtn}
                disabled={busy}
                onPress={() => void handleSetPrice(editing.playlistId, editing.playlistId, editing.priceText)}
              >
                {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.modalSaveBtnText}>Valider</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.textPrimary, fontSize: 36, lineHeight: 40, width: 42 },
  headerText: { flex: 1, alignItems: 'center' },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '800', marginTop: 2 },
  headerSpacer: { width: 42 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  centerView: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  errorBox: { borderRadius: radius.lg, backgroundColor: '#5C2C3C', borderWidth: 1, borderColor: '#E74C8C', padding: spacing.lg, alignItems: 'center' },
  errorText: { color: '#FFB8D4', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  retryBtn: { marginTop: spacing.md, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md, backgroundColor: '#E74C8C' },
  retryBtnText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  emptyBox: { borderRadius: radius.lg, backgroundColor: '#1A1225', borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: 'center' },
  emptyBoxTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  emptyBoxText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  accessCard: { borderRadius: radius.lg, backgroundColor: '#1A1225', borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  accessCardUnlocked: { borderColor: colors.success, backgroundColor: '#101D17' },
  accessEyebrow: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  accessRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: spacing.md },
  accessStat: { alignItems: 'center' },
  accessValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  accessValueGreen: { color: colors.success, fontSize: 20, fontWeight: '900' },
  accessValueRed: { color: '#E74C8C', fontSize: 20, fontWeight: '900' },
  accessLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  accessSeparator: { width: 1, height: 30, backgroundColor: colors.border },
  accessHint: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: spacing.md, textAlign: 'center', lineHeight: 16 },
  offersSection: { marginTop: spacing.lg },
  sectionTitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: spacing.md },
  offerCard: { borderRadius: radius.lg, backgroundColor: '#1A1225', borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  offerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  offerInfo: { flex: 1 },
  offerName: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  offerPrice: { color: colors.success, fontSize: 16, fontWeight: '900', marginTop: 2 },
  offerBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.success },
  offerBadgeText: { color: '#0A140F', fontSize: 9, fontWeight: '900' },
  offerDate: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: spacing.md },
  offerActions: { flexDirection: 'row', gap: spacing.sm },
  editBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  editBtnText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  removeBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: '#E74C8C', alignItems: 'center' },
  removeBtnText: { color: '#E74C8C', fontSize: 11, fontWeight: '900' },
  lockedBox: { borderRadius: radius.lg, backgroundColor: '#2C1A3E', borderWidth: 1, borderColor: colors.primaryLight, padding: spacing.lg },
  lockedTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  lockedText: { color: '#F8F6FC', fontSize: 12, fontWeight: '700', marginTop: spacing.sm, lineHeight: 17 },
  modal: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modalOverlay: { ...StyleSheet.absoluteFillObject },
  modalContent: { backgroundColor: colors.backgroundCard, borderRadius: radius.xl, padding: spacing.lg, width: '85%', borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  modalSubtitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm },
  modalInput: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  modalCurrency: { color: colors.textMuted, fontSize: 14, fontWeight: '900' },
  modalTextInput: { flex: 1, paddingVertical: spacing.md, color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  modalSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.success, alignItems: 'center' },
  modalSaveBtnText: { color: '#0A140F', fontSize: 12, fontWeight: '900' },
});
