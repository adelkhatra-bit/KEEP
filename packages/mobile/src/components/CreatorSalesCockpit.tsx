import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { loadMySalesHistory, type PlaylistSaleHistoryEntry } from '../services/playlistSaleService';
import { loadMyEventTicketSales, type EventTicketTransaction } from '../services/creatorEventService';
import { colors } from '../theme/colors';

type PaidSale = Pick<PlaylistSaleHistoryEntry, 'id' | 'amountCents' | 'currencyCode' | 'status' | 'createdAt'>
  | Pick<EventTicketTransaction, 'id' | 'amountCents' | 'currencyCode' | 'status' | 'createdAt'>;

export function summarizeSellerActivity(music: PaidSale[], tickets: PaidSale[], now: number = Date.now()) {
  const confirmed = [...music, ...tickets].filter((sale) => sale.status === 'COMPLETED');
  const pending = [...music, ...tickets].filter((sale) => sale.status === 'PENDING');
  const since = now - 30 * 24 * 60 * 60 * 1000;
  const euros30Days = confirmed.filter((sale) => sale.currencyCode === 'EUR' && Date.parse(sale.createdAt) >= since)
    .reduce((sum, sale) => sum + Math.max(0, sale.amountCents || 0), 0);
  return {
    musicSales: music.filter((sale) => sale.status === 'COMPLETED').length,
    ticketSales: tickets.filter((sale) => sale.status === 'COMPLETED').length,
    pending: pending.length,
    euros30Days,
    otherCurrencies30Days: confirmed.filter((sale) => sale.currencyCode !== 'EUR' && Date.parse(sale.createdAt) >= since).length,
  };
}

/** Cockpit créateur COMMUN mobile + ordinateur (Lot 5, 12/10/2026) : 3 chiffres, une seule vue pour la musique et les billets. */
export default function CreatorSalesCockpit({ onMusicSales, onEventSales, onHistory }: {
  onMusicSales: () => void;
  onEventSales: () => void;
  /** Historique comptable complet (écran PlaylistSaleHistory, lecture seule). */
  onHistory?: () => void;
}) {
  const focused = useIsFocused();
  const [music, setMusic] = React.useState<PlaylistSaleHistoryEntry[]>([]);
  const [tickets, setTickets] = React.useState<EventTicketTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [unavailable, setUnavailable] = React.useState(false);

  React.useEffect(() => {
    if (!focused) return undefined;
    let active = true;
    setLoading(true);
    void Promise.all([loadMySalesHistory(), loadMyEventTicketSales()]).then(([m, t]) => {
      if (!active) return;
      setMusic(m);
      setTickets(t);
      setUnavailable(false);
    }).catch(() => {
      if (active) setUnavailable(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [focused]);

  const data = React.useMemo(() => summarizeSellerActivity(music, tickets), [music, tickets]);

  return (
    <View style={s.shell} testID="seller-statistics">
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>ESPACE CRÉATEUR</Text>
          <Text style={s.title}>Mes ventes</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primaryLight} /> : null}
      </View>
      {unavailable ? (
        <Text style={s.note}>Statistiques indisponibles. Ouvre les ventes pour consulter l'historique.</Text>
      ) : (
        <>
          <View style={s.statRow}>
            <View style={s.stat}><Text style={s.number}>{data.musicSales + data.ticketSales}</Text><Text style={s.label}>Ventes confirmées</Text></View>
            <View style={s.stat}><Text style={s.number}>{data.pending}</Text><Text style={s.label}>À confirmer</Text></View>
            <View style={s.stat}><Text style={s.number}>{(data.euros30Days / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</Text><Text style={s.label}>Déclarés · 30 j</Text></View>
          </View>
          <Text style={s.note}>Montants déclarés par les vendeurs, non vérifiés auprès des prestataires.{data.otherCurrencies30Days > 0 ? ' Ventes dans d’autres devises non converties.' : ''}</Text>
        </>
      )}
      <View style={s.actions}>
        <TouchableOpacity style={s.button} onPress={onMusicSales} accessibilityRole="button" accessibilityLabel="Voir le détail des ventes de musique"><Text style={s.buttonText}>Ventes musique ›</Text></TouchableOpacity>
        <TouchableOpacity style={s.button} onPress={onEventSales} accessibilityRole="button" accessibilityLabel="Voir les billets et les soirées"><Text style={s.buttonText}>Billets ›</Text></TouchableOpacity>
        {onHistory ? <TouchableOpacity style={s.button} onPress={onHistory} accessibilityRole="button" accessibilityLabel="Voir l’historique complet des ventes"><Text style={s.buttonText}>Historique ›</Text></TouchableOpacity> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { width: '100%', marginTop: 16, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: '#6D55B2', backgroundColor: 'rgba(23, 17, 46, 0.95)', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', marginTop: 3 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flex: 1, minWidth: 96, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#403554', backgroundColor: '#221934' },
  number: { color: colors.textPrimary, fontSize: 23, fontWeight: '900' },
  label: { color: colors.textSecondary, fontSize: 11, marginTop: 5 },
  note: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  buttonText: { color: colors.textPrimary, fontSize: 12, fontWeight: '800' },
});
