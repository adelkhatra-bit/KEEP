import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { attendDiscoveryEvent, recordEventDiscoveryEngagement, requestDiscoveryEventTicket } from '../services/eventDiscoveryService';
import { eventTicketPriceLabel, type EventDiscoveryItem } from '../services/eventDiscoveryPolicy';
import type { EventTicketPurchaseRequest } from '../services/creatorEventService';
import { shareEvent } from '../services/sharingService';
import PayoutCheckoutSheet from './PayoutCheckoutSheet';

type Props = { event: EventDiscoveryItem; surface: 'STORY' | 'PULSE'; onNext: () => void };

export default function EventDiscoveryCard({ event, surface, onNext }: Props) {
  const [going, setGoing] = useState(event.rsvpStatus === 'GOING');
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState<EventTicketPurchaseRequest | null>(null);
  const inFlight = useRef(false);
  const userId = useUserStore((state) => state.user?.id);
  const own = userId === event.creatorId;
  useEffect(() => { setGoing(event.rsvpStatus === 'GOING'); }, [event.id, event.rsvpStatus]);
  useEffect(() => {
    let recorded = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
    const start = () => {
      cancel();
      if (recorded || own || AppState.currentState !== 'active' || (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden)) return;
      timer = setTimeout(() => {
        recorded = true;
        void recordEventDiscoveryEngagement(event.id, 'VIEW', surface).catch(() => {});
      }, 2000);
    };
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') start(); else cancel(); });
    const visibility = () => { if (document.hidden) cancel(); else start(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
    start();
    return () => {
      cancel(); sub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
    };
  }, [event.id, surface, own]);

  const attend = async () => {
    if (inFlight.current || going) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (event.ticketPriceCents && event.ticketPriceCents > 0) {
        const request = await requestDiscoveryEventTicket(event);
        if (request.status !== 'COMPLETED') {
          if (!request.payoutLink && !request.payoutQrUrl) throw new Error('EVENT_PAYMENT_NOT_READY');
          setCheckout(request);
          return;
        }
      }
      await attendDiscoveryEvent(event.id);
      setGoing(true);
    } catch (error: any) {
      Alert.alert('Participation non enregistrée', error?.message === 'EVENT_ACCOUNT_REQUIRED'
        ? 'Un compte avec e-mail vérifié est nécessaire. Le mode démo ne modifie aucune participation.'
        : error?.message === 'EVENT_PAYMENT_NOT_READY' ? 'L’organisateur n’a pas encore configuré son lien de paiement.'
        : 'Réessaie dans un instant. Ta participation n’a pas été modifiée.');
    } finally { inFlight.current = false; setBusy(false); }
  };
  const price = eventTicketPriceLabel(event);
  return (
    <View style={s.card} testID={`event-discovery-${event.id}`}>
      <View style={s.heading}>
        <Text style={s.badge}>Soirée</Text>
        <TouchableOpacity style={s.help} accessibilityRole="button" accessibilityLabel="Informations sur cette soirée" onPress={() => Alert.alert(event.name, [event.description, price ? `Entrée : ${price}. J’Y VAIS enregistre ta participation, pas un paiement ni un billet.` : 'J’Y VAIS enregistre ta participation.'].filter(Boolean).join('\n\n'))}>
          <Text style={s.helpText}>ⓘ</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={s.content} contentContainerStyle={s.contentInner}>
        {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={s.poster} resizeMode="contain" accessibilityLabel={`Affiche : ${event.name}`} /> : null}
        <Text style={s.title}>{event.name}</Text>
        <Text style={s.text}>{new Date(event.startsAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        <Text style={s.text}>{[event.venueName, event.countryCode].filter(Boolean).join(' · ')}</Text>
        {price ? <Text style={s.text}>Entrée · {price}</Text> : null}
      </ScrollView>
      {!own ? <TouchableOpacity style={s.going} disabled={busy || going} accessibilityRole="button" accessibilityState={{ disabled: going, busy }} accessibilityLabel={going ? 'Participation enregistrée' : 'J’y vais'} onPress={() => { void attend(); }} testID={`event-going-${event.id}`}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={s.actionText}>{going ? '✓ J’Y VAIS · ENREGISTRÉ' : 'J’Y VAIS'}</Text>}
      </TouchableOpacity> : <Text style={s.text}>Ta soirée</Text>}
      <View style={s.actions}>
        <TouchableOpacity style={s.secondary} accessibilityRole="button" accessibilityLabel="Partager cette soirée" onPress={() => { void shareEvent(event.id, event.name, () => { void recordEventDiscoveryEngagement(event.id, 'SHARE', surface).catch(() => {}); }).catch(() => Alert.alert('Partage indisponible', 'Réessaie dans un instant.')); }}><Text style={s.actionText}>↗ Partager</Text></TouchableOpacity>
        <TouchableOpacity style={s.secondary} accessibilityRole="button" accessibilityLabel="Passer à la carte suivante" onPress={onNext} testID={`event-next-${event.id}`}><Text style={s.actionText}>Suivant ›</Text></TouchableOpacity>
      </View>
      <PayoutCheckoutSheet visible={Boolean(checkout)} sellerUsername={checkout?.sellerUsername} amountCents={checkout?.amountCents ?? 0} currencyCode={checkout?.currencyCode ?? event.currencyCode} payoutLink={checkout?.payoutLink} payoutQrUrl={checkout?.payoutQrUrl} onClose={() => setCheckout(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, minHeight: 0, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: colors.backgroundCard, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: colors.border },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  help: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: colors.textPrimary, fontSize: 22 },
  content: { flex: 1, minHeight: 0 },
  contentInner: { gap: 8, paddingBottom: 12 },
  poster: { width: '100%', height: 180, borderRadius: 12 },
  title: { color: colors.textPrimary, fontSize: 19, fontWeight: '800' },
  text: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  going: { minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  secondary: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
});
