import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import { getPlaylistSaleAccess, PlaylistSaleAccess, PlaylistSaleOffer, setPlaylistSalePrice, clearPlaylistSalePrice, loadMyPlaylistSaleOffers, loadMyPlaylistSales, loadMyPlaylistPurchases, markPlaylistSalePaid, PlaylistSaleTransaction } from '../services/playlistSaleService';
import { Alert as KeepAlert } from '../utils/keepAlert';
import { syncMarketplaceDelivery } from '../services/musicProviderSyncService';
import { isFeatureEnabled } from '../services/featureFlagService';

const PRICE_PRESETS = [50, 100, 200, 300, 500, 1000] as const;

type PriceEditState = { playlistId: string; playlistName: string; priceCents: number } | null;

export default function PlaylistSalePanel({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [access, setAccess] = useState<PlaylistSaleAccess | null>(null);
  const [offers, setOffers] = useState<PlaylistSaleOffer[]>([]);
  const [sales, setSales] = useState<PlaylistSaleTransaction[]>([]);
  const [purchases, setPurchases] = useState<PlaylistSaleTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PriceEditState>(null);
  const [error, setError] = useState('');
  // Adel (20/09/2026) : marketplace playlists en "coming soon" -- paiement
  // par lien externe, non conforme Apple IAP pour du contenu numérique
  // déverrouillé dans l'app. Garde-fou d'accès direct (deep-link/route),
  // au cas où le point d'entrée menu serait contourné -- le flag Super
  // Admin 'playlist_marketplace' reste la seule source de vérité.
  const [marketplaceEnabled, setMarketplaceEnabled] = useState<boolean | null>(null);
  // (21/09/2026) BUG RÉEL corrigé : ce check ne tournait qu'au montage --
  // un changement de flag/bypass fait dans Super Admin pendant que l'écran
  // était déjà ouvert n'était jamais relu sans relancer l'app. Recalculé
  // aussi à chaque focus.
  useEffect(() => {
    let live = true;
    const check = () => { isFeatureEnabled('playlist_marketplace').then((enabled) => { if (live) setMarketplaceEnabled(enabled); }); };
    check();
    const unsubscribe = navigation?.addListener?.('focus', check);
    return () => { live = false; unsubscribe?.(); };
  }, [navigation]);

  const loadData = async () => {
    if (!user || isLocalGuest || isDemoMode) {
      setAccess(null);
      setOffers([]);
      setSales([]);
      setPurchases([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [liveAccess, liveOffers, liveSales, livePurchases] = await Promise.all([
        getPlaylistSaleAccess(),
        loadMyPlaylistSaleOffers(),
        loadMyPlaylistSales(),
        loadMyPlaylistPurchases(),
      ]);
      setAccess(liveAccess);
      setOffers(liveOffers);
      setSales(liveSales);
      setPurchases(livePurchases);
    } catch (e: any) {
      setError(e?.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  // Adel (16-17/09/2026) : "l'utilisateur se fait payer directement" -- une
  // fois payé sur SON lien perso (hors KEEP), le vendeur confirme ici -- ça
  // débloque l'accès de CET acheteur précis (démasquage des morceaux).
  const handleMarkPaid = (transaction: PlaylistSaleTransaction) => {
    Alert.alert(
      'Confirmer la réception du paiement',
      `Confirme uniquement si tu as bien reçu ${(transaction.amountCents / 100).toFixed(2)} ${transaction.currencyCode} de @${transaction.counterpartUsername} sur ton lien de paiement personnel. Ça débloquera "${transaction.playlistName}" pour lui.`,
      [
        { text: 'Annuler', onPress: () => {} },
        {
          text: 'J’ai bien été payé',
          onPress: async () => {
            setBusy(true);
            try {
              const delivered = await markPlaylistSalePaid(transaction.id);
              const providerSync = await syncMarketplaceDelivery(transaction.id).catch(() => null);
              await loadData();
              if (!providerSync?.connectedProviders) {
                KeepAlert.alert('Playlist livrée', `« ${delivered.playlistName} » et ses ${delivered.trackCount} titre${delivered.trackCount > 1 ? 's' : ''} sont maintenant dans la bibliothèque Loki de @${transaction.counterpartUsername}. La synchronisation Spotify/Deezer démarrera dès qu’un service sera connecté.`);
              } else {
                const complete = providerSync.results.filter((row) => row.status === 'COMPLETE').map((row) => row.provider).join(', ');
                KeepAlert.alert('Playlist livrée', `Livraison Loki terminée${complete ? ` et synchronisée vers ${complete}` : ''}.`);
              }
            } catch (e: any) {
              KeepAlert.alert('Erreur', e?.message || 'Impossible de confirmer ce paiement.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
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

  const handleSetPrice = async (playlistId: string, playlistName: string, priceCents: number) => {
    if (!PRICE_PRESETS.includes(priceCents as (typeof PRICE_PRESETS)[number])) {
      KeepAlert.alert('Prix invalide', 'Choisis un des prix proposés.');
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

  if (marketplaceEnabled === false) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.empty}>
          <Text style={s.emptyText}>Bientôt disponible.</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        {/* Adel (21/09/2026, mission 3/3) : "Écran historique des ventes"
            -- lecture seule, séparé de ce panneau de gestion. */}
        <TouchableOpacity style={s.historyLink} onPress={() => navigation.navigate('PlaylistSaleHistory')} accessibilityLabel="Voir l'historique complet des ventes">
          <Text style={s.historyLinkText}>Historique</Text>
        </TouchableOpacity>
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

            {/* Adel (21/09/2026, décision 2) : encart permanent -- le
                fonctionnement reste manuel tant que l'API de paiement
                réelle n'est pas intégrée. Le vendeur doit comprendre AVANT
                de confirmer une vente que c'est lui, et lui seul, qui
                certifie avoir reçu l'argent. */}
            <View style={s.manualNotice}>
              <Text style={s.manualNoticeTitle}>ℹ️ Fonctionnement actuel : confirmation manuelle</Text>
              <Text style={s.manualNoticeText}>Loki n'encaisse jamais et ne vérifie pas les paiements. C'est à toi de confirmer "J'ai bien été payé" uniquement après avoir réellement reçu l'argent sur ton lien personnel -- cette confirmation débloque l'accès pour l'acheteur de façon définitive.</Text>
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
                          onPress={() => setEditing({ playlistId: item.playlistId, playlistName: item.playlistName, priceCents: item.priceCents })}
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

            {/* Ventes en attente de confirmation -- l'acheteur a déjà cliqué
                Acheter (payé ou en train de payer sur le lien du vendeur) */}
            {sales.filter((s2) => s2.status === 'PENDING').length > 0 && (
              <View style={s.offersSection}>
                <Text style={s.sectionTitle}>VENTES EN ATTENTE ({sales.filter((s2) => s2.status === 'PENDING').length})</Text>
                {sales.filter((s2) => s2.status === 'PENDING').map((sale) => (
                  <View key={sale.id} style={s.offerCard}>
                    <View style={s.offerTop}>
                      <View style={s.offerInfo}>
                        <Text style={s.offerName}>@{sale.counterpartUsername} · {sale.playlistName}</Text>
                        <Text style={s.offerPrice}>{(sale.amountCents / 100).toFixed(2)}€ {sale.currencyCode}</Text>
                      </View>
                    </View>
                    <Text style={s.offerDate}>Demandé le {new Date(sale.createdAt).toLocaleDateString('fr-FR')} -- pas encore confirmé</Text>
                    <TouchableOpacity style={s.editBtn} disabled={busy} onPress={() => handleMarkPaid(sale)}>
                      <Text style={s.editBtnText}>✓ J’ai été payé -- débloquer</Text>
                    </TouchableOpacity>
                  </View>
                ))}
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

            {sales.filter((s2) => s2.status === 'COMPLETED').length > 0 && (
              <View style={s.offersSection}>
                <Text style={s.sectionTitle}>VENTES CONFIRMÉES ({sales.filter((s2) => s2.status === 'COMPLETED').length})</Text>
                {sales.filter((s2) => s2.status === 'COMPLETED').map((sale) => (
                  <View key={sale.id} style={s.offerCard}>
                    <Text style={s.offerName}>@{sale.counterpartUsername} · {sale.playlistName}</Text>
                    <Text style={s.offerPrice}>{(sale.amountCents / 100).toFixed(2)}€ {sale.currencyCode}</Text>
                  </View>
                ))}
              </View>
            )}

            {purchases.length > 0 && (
              <View style={s.offersSection}>
                <Text style={s.sectionTitle}>MES ACHATS ({purchases.length})</Text>
                {purchases.map((purchase) => (
                  <View key={purchase.id} style={s.offerCard}>
                    <Text style={s.offerName}>@{purchase.counterpartUsername} · {purchase.playlistName}</Text>
                    <Text style={s.offerPrice}>{(purchase.amountCents / 100).toFixed(2)}€ {purchase.currencyCode}</Text>
                    <Text style={s.offerDate}>{purchase.status === 'COMPLETED' ? '✓ Débloqué -- va sur son profil pour voir les morceaux' : '⏳ En attente que le vendeur confirme ton paiement'}</Text>
                  </View>
                ))}
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
            <Text style={s.modalSubtitle}>{editing.playlistName}</Text>
            <View style={s.pricePresetGrid}>
              {PRICE_PRESETS.map((priceCents) => {
                const selected = editing.priceCents === priceCents;
                return (
                  <TouchableOpacity
                    key={priceCents}
                    style={[s.pricePreset, selected && s.pricePresetSelected]}
                    disabled={busy}
                    onPress={() => setEditing({ ...editing, priceCents })}
                  >
                    <Text style={[s.pricePresetText, selected && s.pricePresetTextSelected]}>
                      {(priceCents / 100).toFixed(2)} €
                    </Text>
                  </TouchableOpacity>
                );
              })}
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
                onPress={() => void handleSetPrice(editing.playlistId, editing.playlistName, editing.priceCents)}
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
  historyLink: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  historyLinkText: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' },
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
  manualNotice: { marginTop: spacing.lg, borderRadius: radius.lg, backgroundColor: '#1A1225', borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  manualNoticeTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  manualNoticeText: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 },
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
  pricePresetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  pricePreset: { width: '31%', paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  pricePresetSelected: { backgroundColor: colors.success, borderColor: colors.success },
  pricePresetText: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' },
  pricePresetTextSelected: { color: '#0A140F' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  modalSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.success, alignItems: 'center' },
  modalSaveBtnText: { color: '#0A140F', fontSize: 12, fontWeight: '900' },
});
