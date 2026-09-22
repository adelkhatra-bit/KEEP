import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, SafeAreaView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import { loadMySalesHistory, PlaylistSaleHistoryEntry } from '../services/playlistSaleService';

/**
 * Adel (21/09/2026, mission 3/3) : "Écran historique des ventes : liste
 * transactions pour le vendeur (base compta : seller_id, buyer_id,
 * playlist_id, amount, currency, status, dates, paypal_tx_id)." Lecture
 * seule -- la confirmation de paiement ("J'ai bien été payé") reste sur
 * PlaylistSalePanel, cet écran est la trace complète pour la compta, pas
 * une deuxième façon de confirmer une vente.
 */
export default function PlaylistSaleHistoryScreen({ navigation }: any) {
  const [entries, setEntries] = useState<PlaylistSaleHistoryEntry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (showSpinner: boolean) => {
    if (showSpinner) setRefreshing(true);
    setError('');
    try {
      setEntries(await loadMySalesHistory());
    } catch (e: any) {
      setError(e?.message || 'Erreur lors du chargement');
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
    const unsubscribe = navigation?.addListener?.('focus', () => { void load(false); });
    return () => unsubscribe?.();
  }, [navigation]);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backButton} onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('PlaylistSale'))} accessibilityRole="button" accessibilityLabel="Retour">
          <Text style={s.back}>←</Text>
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>Historique des ventes</Text>
          <Text style={s.subtitle}>Toutes tes transactions, pour ta compta</Text>
        </View>
        <View style={s.headerSpacer} />
      </View>

      {entries === null ? (
        <View style={s.centerView}><ActivityIndicator color={colors.primaryLight} size="large" /></View>
      ) : error ? (
        <View style={s.centerView}>
          <Text style={s.errorText}>❌ {error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => void load(true)}><Text style={s.retryBtnText}>Réessayer</Text></TouchableOpacity>
        </View>
      ) : entries.length === 0 ? (
        <View style={s.centerView}>
          <Text style={s.emptyText}>Aucune vente pour l'instant.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primaryLight} />}
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={s.rowTop}>
                <View style={s.rowInfo}>
                  <Text style={s.rowPlaylist} numberOfLines={1}>{item.playlistName}</Text>
                  <Text style={s.rowBuyer}>@{item.buyerUsername || 'acheteur'}</Text>
                </View>
                <Text style={s.rowAmount}>{(item.amountCents / 100).toFixed(2)} {item.currencyCode === 'EUR' ? '€' : item.currencyCode}</Text>
              </View>
              <View style={s.rowBottom}>
                <View style={[s.statusBadge, item.status === 'COMPLETED' ? s.statusBadgeCompleted : s.statusBadgePending]}>
                  <Text style={[s.statusBadgeText, item.status === 'COMPLETED' ? s.statusBadgeTextCompleted : s.statusBadgeTextPending]}>
                    {item.status === 'COMPLETED' ? '✓ Payée' : '⏳ En attente'}
                  </Text>
                </View>
                <Text style={s.rowDate}>{formatDate(item.createdAt)}</Text>
              </View>
              {item.deliveredAt ? <Text style={s.rowMeta}>Livrée le {formatDate(item.deliveredAt)}</Text> : null}
              {item.paymentReference ? <Text style={s.rowMeta}>Référence : {item.paymentReference}</Text> : null}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 68, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},
  back: { color: colors.textPrimary, fontSize: 24, lineHeight: 26, fontWeight:'800' },
  headerText: { flex: 1, alignItems: 'center', paddingHorizontal:spacing.sm },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '800', marginTop: 2 },
  headerSpacer: { width: 44 },
  centerView: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  retryBtn: { minHeight:48, marginTop: spacing.md, paddingHorizontal: 20, borderRadius: 24, backgroundColor: colors.primary, alignItems:'center', justifyContent:'center' },
  retryBtnText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  emptyText: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop:spacing.md, paddingBottom:spacing.xxxl },
  row: { borderRadius: 20, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom:spacing.md },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowInfo: { flex: 1, paddingRight: spacing.sm },
  rowPlaylist: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  rowBuyer: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  rowAmount: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1 },
  statusBadgeCompleted: { backgroundColor: 'rgba(45,225,194,0.10)', borderColor: colors.success },
  statusBadgePending: { backgroundColor: colors.backgroundElevated, borderColor: colors.border },
  statusBadgeText: { fontSize: 10, fontWeight: '900' },
  statusBadgeTextCompleted: { color: colors.success },
  statusBadgeTextPending: { color: colors.textMuted },
  rowDate: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  rowMeta: { color: colors.textMuted, fontSize: 10, fontWeight: '600', marginTop: 4 },
});
