import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, PanResponder, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ClampedText from '../components/ClampedText';
import { Alert } from '../utils/keepAlert';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { supabase } from '../services/supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { getDiscoveryAccess, getCompareAccess, DiscoveryAccess, QuotaAccess } from '../services/growthAccessService';
import { loadCurrentPlanCode, loadDemoDiscoveryLocked } from '../services/planService';
import ProfileCertificationBadge from '../components/ProfileCertificationBadge';
import ProfileCounterRow from '../components/ProfileCounterRow';
import { loadPublicProfileSnapshot, PublicProfileSnapshot } from '../services/publicProfileStateService';
import { getFeatureState, isFeatureEnabled } from '../services/featureFlagService';
import MotionActionButton from '../components/MotionActionButton';
import PersonalThemeBackdrop from '../components/PersonalThemeBackdrop';
import { CreatorEvent, EventRsvpCounts, EventRsvpStatus, loadEventRsvpCounts, loadMyRsvps, loadUpcomingEvents, setEventRsvp } from '../services/creatorEventService';
import StandardBackButton from '../components/StandardBackButton';
import KeepModal from '../components/KeepModal';

const DISCOVERY_RADII = [5, 10, 25, 50, 100, 250, 500, 1000, 5000, 20000];
const FREE_LOCAL_DISCOVERY_LIMIT = 3;

type SearchPosition = { latitude: number; longitude: number };

type ProfileCard = {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  city?: string;
  countryCode?: string;
  approxLat?: number | null;
  approxLng?: number | null;
  favoriteGenres: string[];
  favoriteArtists: string[];
  certificationTier?: 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO' | 'UNVERIFIED';
};

function normalizeList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function normalizeOptionalCoordinate(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function overlapScore(a: string[], b: string[]): number {
  const left = new Set(a.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const right = new Set(b.map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!left.size || !right.size) return 0;
  const matches = [...left].filter((item) => right.has(item)).length;
  return Math.round((matches / Math.max(left.size, right.size)) * 100);
}

export default function DiscoverScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [planCode, setPlanCode] = useState('FREE');
  const [radiusKm, setRadiusKm] = useState(25);
  const [profileIndex, setProfileIndex] = useState(0);
  const [discoveryAccess, setDiscoveryAccess] = useState<DiscoveryAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [guestSeenIds, setGuestSeenIds] = useState<string[]>([]);
  const [avatarFailedFor, setAvatarFailedFor] = useState<string | null>(null);
  const [currentProfileSnapshot, setCurrentProfileSnapshot] = useState<PublicProfileSnapshot | null>(null);
  const [discoverMode, setDiscoverMode] = useState<'PEOPLE' | 'EVENTS'>('PEOPLE');
  const [upcomingEvents, setUpcomingEvents] = useState<CreatorEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsFeatureEnabled, setEventsFeatureEnabled] = useState(true);
  const [returnToParties, setReturnToParties] = useState(false);
  const [eventDetail, setEventDetail] = useState<CreatorEvent | null>(null);
  const [eventDetailOpen, setEventDetailOpen] = useState(false);
  const [eventRsvp, setEventRsvpState] = useState<EventRsvpStatus | null>(null);
  const [eventRsvpCounts, setEventRsvpCounts] = useState<EventRsvpCounts>({ going: 0, maybe: 0, notGoing: 0 });
  const [eventActionBusy, setEventActionBusy] = useState(false);
  const [discoverHelpOpen, setDiscoverHelpOpen] = useState(false);
  // Adel : brancher le flag "local_discovery" pour de vrai plutôt que de
  // laisser un interrupteur décoratif dans Super Admin -- coupe-circuit
  // d'urgence réel pour tout l'écran Découvertes. `true` par défaut tant que
  // la vérification n'est pas revenue pour éviter un flash "indisponible" à
  // chaque ouverture ; une fois vérifiée, false coupe réellement l'écran.
  const [localDiscoveryEnabled, setLocalDiscoveryEnabled] = useState(true);
  const [localDiscoveryChecked, setLocalDiscoveryChecked] = useState(false);
  const [localDiscoveryUnavailable, setLocalDiscoveryUnavailable] = useState(false);
  const [localDiscoveryRetry, setLocalDiscoveryRetry] = useState(0);
  useEffect(() => { let live = true; getFeatureState('local_discovery').then((state) => { if (live) { setLocalDiscoveryEnabled(state === 'enabled'); setLocalDiscoveryUnavailable(state === 'unavailable'); setLocalDiscoveryChecked(true); } }); return () => { live = false; }; }, [localDiscoveryRetry]);
  const [demoDiscoveryLocked, setDemoDiscoveryLocked] = useState(true);
  useEffect(() => {
    let live = true;
    if (!isDemoMode) { setDemoDiscoveryLocked(false); return () => { live = false; }; }
    loadDemoDiscoveryLocked().then((locked) => { if (live) setDemoDiscoveryLocked(locked); }).catch(() => { if (live) setDemoDiscoveryLocked(true); });
    return () => { live = false; };
  }, [isDemoMode]);
  // Adel : le bloc "AFFINITÉ %" ci-dessous est la vraie fonctionnalité
  // derrière le flag Super Admin "compare_keep" ("Comparer nos KEEP") --
  // jamais branché jusqu'ici. Coupe-circuit réel, pas décoratif.
  const [compareFeatureEnabled, setCompareFeatureEnabled] = useState(true);
  useEffect(() => { let live = true; isFeatureEnabled('compare_keep').then((enabled) => live && setCompareFeatureEnabled(enabled)); return () => { live = false; }; }, []);
  useEffect(() => { let live = true; isFeatureEnabled('events').then((enabled) => { if (live) setEventsFeatureEnabled(enabled); }).catch(() => {}); return () => { live = false; }; }, []);

  useEffect(() => {
    const focus = String(route?.params?.focus ?? '').toUpperCase();
    const source = String(route?.params?.source ?? '').toUpperCase();
    if (source.startsWith('PARTIES_')) setReturnToParties(true);
    if (focus === 'EVENTS') setDiscoverMode('EVENTS');
    if (focus === 'PEOPLE') setDiscoverMode('PEOPLE');
    const requestedEventId = route?.params?.openEventId ?? route?.params?.eventId;
    if (focus || source) navigation.setParams?.({ focus: undefined, source: undefined, openEventId: requestedEventId, eventId: undefined });
  }, [navigation, route?.params?.focus, route?.params?.source, route?.params?.openEventId, route?.params?.eventId]);

  useEffect(() => {
    if (!eventsFeatureEnabled) { setUpcomingEvents([]); return undefined; }
    let live = true;
    setEventsLoading(true);
    loadUpcomingEvents(user?.id)
      .then((rows) => { if (live) setUpcomingEvents(rows); })
      .catch(() => { if (live) setUpcomingEvents([]); })
      .finally(() => { if (live) setEventsLoading(false); });
    return () => { live = false; };
  }, [eventsFeatureEnabled, user?.id]);
  const [searchPosition, setSearchPosition] = useState<SearchPosition | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [profileQuery, setProfileQuery] = useState('');
  // BUG RÉEL trouvé le 30/08/2026 (audit Découvertes en direct, Adel : "je
  // fais une recherche... ça ne fonctionne pas") : filteredProfiles changeait
  // `currentProfile` à CHAQUE frappe, et l'effet de vérification d'accès
  // (getDiscoveryAccess/keep_discovery_profile_access) consomme réellement un
  // crédit Découvertes par profil vérifié -- taper un pseudo de quelques
  // lettres épuisait donc le quota gratuit (3) en une seconde, avant même que
  // l'utilisateur voie un résultat. `committedQuery` ne se met à jour que
  // 400ms après la dernière frappe : le champ reste réactif à l'écran, mais
  // le filtrage qui déclenche la vérification de crédit ne bouge plus à
  // chaque caractère.
  const [committedQuery, setCommittedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setCommittedQuery(profileQuery), 400);
    return () => clearTimeout(timer);
  }, [profileQuery]);

  // Audit multi-agent 07/09/2026 : la recherche ne filtrait que le lot de
  // profils déjà chargé (plafonné) -- chercher un pseudo qui existe mais qui
  // n'était pas dans ce lot ne retournait jamais rien, silencieusement.
  // Recherche directe côté serveur dès qu'une requête est en cours, en
  // complément du filtrage local instantané (qui reste affiché pendant
  // l'aller-retour réseau pour ne rien casser du confort existant).
  const [searchedProfiles, setSearchedProfiles] = useState<ProfileCard[] | null>(null);
  useEffect(() => {
    let live = true;
    const needle = committedQuery.trim().replace(/^@/, '');
    if (!needle || isDemoMode || !supabase) { setSearchedProfiles(null); return () => { live = false; }; }
    const client = supabase;
    const run = async () => {
      try {
        let query = client
          .from('profiles')
          .select('id,username,avatar_url,bio,city,country_code,approx_lat,approx_lng,favorite_genres,favorite_artists,certification_tier')
          .eq('is_public', true)
          .eq('discovery_hidden', false)
          .ilike('username', `%${needle}%`)
          .limit(50);
        if (user?.id) query = query.neq('id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        if (live) setSearchedProfiles((data ?? []).map((row: any) => ({
          id: row.id,
          username: row.username || 'keep-user',
          avatarUrl: row.avatar_url || undefined,
          bio: row.bio || undefined,
          city: row.city || undefined,
          countryCode: row.country_code || undefined,
          approxLat: normalizeOptionalCoordinate(row.approx_lat),
          approxLng: normalizeOptionalCoordinate(row.approx_lng),
          favoriteGenres: normalizeList(row.favorite_genres),
          favoriteArtists: normalizeList(row.favorite_artists),
          certificationTier: row.certification_tier || undefined,
        })));
      } catch { if (live) setSearchedProfiles(null); }
    };
    void run();
    return () => { live = false; };
  }, [committedQuery, user?.id, isDemoMode]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (isDemoMode || !supabase) {
        if (live) setProfiles([
          { id: 'demo-julie', username: 'julie.vibes', bio: 'Pop française · Lyon', city: 'Lyon', countryCode: 'FR', approxLat: 45.764, approxLng: 4.836, favoriteGenres: ['Pop', 'Dance'], favoriteArtists: ['Dua Lipa', 'Angèle'] },
          { id: 'demo-maxime', username: 'maxime.mix', bio: 'Rap · Afro · soirées', city: 'Villeurbanne', countryCode: 'FR', approxLat: 45.771, approxLng: 4.88, favoriteGenres: ['Rap', 'Afro'], favoriteArtists: ['Damso', 'Burna Boy'] },
          { id: 'demo-lea', username: 'lea.keep', bio: 'R&B · Soul', city: 'Lyon', countryCode: 'FR', approxLat: 45.75, approxLng: 4.85, favoriteGenres: ['R&B', 'Soul'], favoriteArtists: ['SZA', 'The Weeknd'] },
        ]);
        return;
      }
      setLoadingProfiles(true);
      try {
        let query = supabase
          .from('profiles')
          .select('id,username,avatar_url,bio,city,country_code,approx_lat,approx_lng,favorite_genres,favorite_artists,certification_tier')
          .eq('is_public', true)
          .eq('discovery_hidden', false)
          .order('updated_at', { ascending: false })
          .limit(1000);
        if (user?.id) query = query.neq('id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        if (live) setProfiles((data ?? []).map((row: any) => ({
          id: row.id,
          username: row.username || 'keep-user',
          avatarUrl: row.avatar_url || undefined,
          bio: row.bio || undefined,
          city: row.city || undefined,
          countryCode: row.country_code || undefined,
          approxLat: normalizeOptionalCoordinate(row.approx_lat),
          approxLng: normalizeOptionalCoordinate(row.approx_lng),
          favoriteGenres: normalizeList(row.favorite_genres),
          favoriteArtists: normalizeList(row.favorite_artists),
          certificationTier: row.certification_tier || undefined,
        })));
      } catch {
        if (live) setProfiles([]);
      } finally { if (live) setLoadingProfiles(false); }
    };
    void load();
    return () => { live = false; };
  }, [isDemoMode, user?.id]);


  useEffect(() => {
    let live = true;
    const loadPlan = async () => {
      if (isDemoMode) { if (live) setPlanCode('DEMO'); return; }
      if (!user || isLocalGuest) { if (live) setPlanCode('FREE'); return; }
      try {
        const code = await loadCurrentPlanCode(user.id);
        if (live) setPlanCode(code || 'FREE');
      } catch { if (live) setPlanCode('FREE'); }
    };
    void loadPlan();
    return () => { live = false; };
  }, [user?.id, isLocalGuest, isDemoMode]);

  useEffect(() => {
    setProfileIndex(0);
    setDiscoveryAccess(null);
    setGuestSeenIds([]);
    setSearchPosition(null);
    setHasSearched(false);
    setCurrentProfileSnapshot(null);
    setProfileQuery('');
  }, [user?.id]);

  const filteredProfiles = useMemo(() => {
    const needle = committedQuery.trim().replace(/^@/, '').toLowerCase();
    const candidates = needle
      ? (searchedProfiles ?? profiles.filter((profile) => profile.username.toLowerCase().includes(needle)))
      : profiles;

    // Découvertes doit être utile dès l'ouverture : le GPS affine le classement,
    // il ne doit jamais être une condition pour voir ou retrouver un profil public.
    if (!hasSearched || !searchPosition) return candidates;

    const ranked = candidates.map((profile) => {
      const hasCoordinates = Number.isFinite(profile.approxLat) && Number.isFinite(profile.approxLng);
      const distance = hasCoordinates
        ? distanceKm(searchPosition.latitude, searchPosition.longitude, profile.approxLat as number, profile.approxLng as number)
        : null;
      return { profile, distance };
    }).filter((item) => radiusKm >= 20000 ? true : item.distance !== null && item.distance <= radiusKm);
    ranked.sort((a, b) => {
      if (a.distance === null && b.distance === null) return a.profile.username.localeCompare(b.profile.username);
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
    return ranked.map((item) => item.profile);
  }, [profiles, searchedProfiles, committedQuery, radiusKm, searchPosition, hasSearched]);

  const currentProfile = (hasSearched || committedQuery.trim().length > 0) && filteredProfiles.length ? filteredProfiles[profileIndex % filteredProfiles.length] : null;

  useEffect(() => {
    let live = true;
    const check = async () => {
      if (!currentProfile) { if (live) setDiscoveryAccess(null); return; }
      setAccessLoading(true);
      try {
        if (isDemoMode) {
          if (live) setDiscoveryAccess({ planCode: 'DEMO', allowed: true, used: 0, limit: null, remaining: null, unlimited: true, newlyCounted: false });
          return;
        }
        if (!user || isLocalGuest) {
          const alreadySeen = guestSeenIds.includes(currentProfile.id);
          const allowed = alreadySeen || guestSeenIds.length < FREE_LOCAL_DISCOVERY_LIMIT;
          if (allowed && !alreadySeen && live) setGuestSeenIds((ids) => [...ids, currentProfile.id]);
          if (live) setDiscoveryAccess({
            planCode: 'FREE', allowed,
            used: alreadySeen ? guestSeenIds.length : Math.min(guestSeenIds.length + (allowed ? 1 : 0), FREE_LOCAL_DISCOVERY_LIMIT),
            limit: FREE_LOCAL_DISCOVERY_LIMIT,
            remaining: Math.max(FREE_LOCAL_DISCOVERY_LIMIT - guestSeenIds.length - (!alreadySeen && allowed ? 1 : 0), 0),
            unlimited: false,
            newlyCounted: allowed && !alreadySeen,
          });
          return;
        }
        const access = await getDiscoveryAccess(currentProfile.id);
        if (live) setDiscoveryAccess(access);
      } catch {
        if (live) setDiscoveryAccess({ planCode, allowed: planCode !== 'FREE', used: 0, limit: planCode === 'FREE' ? 3 : null, remaining: planCode === 'FREE' ? 0 : null, unlimited: planCode !== 'FREE', newlyCounted: false });
      } finally { if (live) setAccessLoading(false); }
    };
    void check();
    return () => { live = false; };
  }, [currentProfile?.id, user?.id, isLocalGuest, isDemoMode, planCode]);

  useEffect(() => { setAvatarFailedFor(null); }, [currentProfile?.id, currentProfile?.avatarUrl]);

  // Adel : compares_per_month était configurable dans Super Admin mais
  // jamais compté nulle part -- même trou que follows_max/local_discovery.
  const [compareAccess, setCompareAccess] = useState<QuotaAccess | null>(null);
  useEffect(() => {
    let live = true;
    const check = async () => {
      if (!currentProfile || !compareFeatureEnabled) { if (live) setCompareAccess(null); return; }
      if (!user || isLocalGuest || isDemoMode) { if (live) setCompareAccess({ planCode: 'FREE', allowed: true, used: 0, limit: null, remaining: null, unlimited: true }); return; }
      try {
        const access = await getCompareAccess(true);
        if (live) setCompareAccess(access);
      } catch {
        if (live) setCompareAccess({ planCode, allowed: true, used: 0, limit: null, remaining: null, unlimited: true });
      }
    };
    void check();
    return () => { live = false; };
  }, [currentProfile?.id, compareFeatureEnabled, user?.id, isLocalGuest, isDemoMode]);

  useEffect(() => {
    let live = true;
    setCurrentProfileSnapshot(null);
    if (!currentProfile?.id || discoveryAccess?.allowed === false) return () => { live = false; };
    void loadPublicProfileSnapshot(currentProfile.id)
      .then((snapshot) => { if (live) setCurrentProfileSnapshot(snapshot); })
      .catch(() => { if (live) setCurrentProfileSnapshot(null); });
    return () => { live = false; };
  }, [currentProfile?.id, discoveryAccess?.allowed]);

  const resetSearchResults = () => {
    setHasSearched(false);
    setSearchPosition(null);
    setProfileIndex(0);
    setDiscoveryAccess(null);
    setCurrentProfileSnapshot(null);
  };

  const searchAroundMe = async () => {
    if (searchBusy) return;
    setSearchBusy(true);
    setProfileIndex(0);
    setDiscoveryAccess(null);
    setCurrentProfileSnapshot(null);
    setHasSearched(true);

    let persisted: SearchPosition | null = null;
    if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
      try {
        const { data } = await supabase.from('profiles').select('approx_lat,approx_lng').eq('id', user.id).maybeSingle();
        const lat = normalizeOptionalCoordinate(data?.approx_lat);
        const lng = normalizeOptionalCoordinate(data?.approx_lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          persisted = { latitude: lat as number, longitude: lng as number };
          setSearchPosition(persisted);
        }
      } catch {}
    }

    try {
      const permission = await Promise.race([
        Location.requestForegroundPermissionsAsync(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('GPS_PERMISSION_TIMEOUT')), 7000)),
      ]);
      if (permission.status !== 'granted') {
        if (!persisted) setSearchPosition(null);
        Alert.alert('Localisation', persisted
          ? 'Loki Music utilise ta dernière position enregistrée. Tu peux autoriser le GPS plus tard pour l’actualiser.'
          : 'Le GPS n’est pas autorisé. Les profils publics restent disponibles et tu peux rechercher un pseudo directement.');
        return;
      }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('GPS_FIX_TIMEOUT')), 9000)),
      ]);
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setSearchPosition(next);
      if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
        await supabase.from('profiles').update({ approx_lat: Math.round(next.latitude * 1000) / 1000, approx_lng: Math.round(next.longitude * 1000) / 1000, location_opt_in: true }).eq('id', user.id);
      }
    } catch {
      if (!persisted) setSearchPosition(null);
      Alert.alert('Localisation', persisted
        ? 'Position GPS lente : Loki Music utilise ta dernière position enregistrée pour cette recherche.'
        : 'Position GPS indisponible. Les profils publics restent visibles et la recherche par pseudo fonctionne quand même.');
    } finally { setSearchBusy(false); }
  };

  const nextProfile = () => {
    if (filteredProfiles.length) setProfileIndex((value) => (value + 1) % filteredProfiles.length);
  };
  const previousProfile = () => {
    if (filteredProfiles.length) setProfileIndex((value) => (value - 1 + filteredProfiles.length) % filteredProfiles.length);
  };
  const profileDeckPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx <= -38 || gesture.vx <= -0.35) nextProfile();
      else if (gesture.dx >= 38 || gesture.vx >= 0.35) previousProfile();
    },
  }), [filteredProfiles.length]);

  const openEventInline = async (event: CreatorEvent) => {
    setEventDetail(event);
    setEventDetailOpen(true);
    setEventRsvpState(null);
    setEventRsvpCounts({ going: 0, maybe: 0, notGoing: 0 });
    setEventActionBusy(true);
    try {
      const [counts, myRsvps] = await Promise.all([
        loadEventRsvpCounts(event.id),
        user?.id && !isLocalGuest && !isDemoMode ? loadMyRsvps(user.id) : Promise.resolve({} as Record<string, EventRsvpStatus>),
      ]);
      setEventRsvpCounts(counts);
      setEventRsvpState(myRsvps[event.id] ?? null);
    } catch {
      // Le détail reste visible même si les compteurs sont momentanément indisponibles.
    } finally {
      setEventActionBusy(false);
    }
  };

  const updateEventRsvpInline = async (status: EventRsvpStatus) => {
    if (!eventDetail || eventActionBusy) return;
    if (!user?.id || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte pour répondre à cet événement.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: openAccount },
      ]);
      return;
    }
    const previous = eventRsvp;
    setEventActionBusy(true);
    try {
      await setEventRsvp(user.id, eventDetail.id, status);
      setEventRsvpState(status);
      const fresh = await loadEventRsvpCounts(eventDetail.id).catch(() => null);
      if (fresh) setEventRsvpCounts(fresh);
    } catch {
      setEventRsvpState(previous);
      Alert.alert('Événement', 'Impossible d’enregistrer ta réponse pour le moment.');
    } finally {
      setEventActionBusy(false);
    }
  };

  useEffect(() => {
    const requestedId = String(route?.params?.openEventId ?? route?.params?.eventId ?? '').trim();
    if (!requestedId || discoverMode !== 'EVENTS' || !upcomingEvents.length) return;
    const event = upcomingEvents.find((row) => row.id === requestedId);
    if (!event) return;
    void openEventInline(event);
    navigation.setParams?.({ openEventId: undefined, eventId: undefined });
  }, [discoverMode, upcomingEvents, route?.params?.openEventId, route?.params?.eventId, navigation]);

  const openPremium = () => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'SOCIAL_DISCOVERY' });
  const openCurrentProfile = () => { if (currentProfile && discoveryAccess?.allowed) navigation.navigate('PublicProfile', { username: currentProfile.username }); };
  // Adel (08/09/2026) : "il faut pas qu'il soit redirigé, il faut qu'il
  // reste au même endroit" -- même popup en place que partout ailleurs
  // (useAccountGateStore), plus de saut vers l'onglet Profil.
  const openAccount = () => useAccountGateStore.getState().requestAccount('create');
  // Refonte deck (spec Adel 22/09/2026) : le bouton GARDER (♥ menthe) suit
  // le profil directement depuis Découvertes -- mêmes RPC sécurisées que le
  // profil public (keep_follow_profile/keep_unfollow_profile), jamais
  // d'écriture directe sur `follows`.
  const [isFollowing, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setFollowing(false);
    setFollowBusy(false);
    if (!supabase || !user?.id || !currentProfile?.id || isLocalGuest || isDemoMode) return () => { live = false; };
    void Promise.resolve(supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('followee_id', currentProfile.id).maybeSingle())
      .then(({ data }) => { if (live) setFollowing(Boolean(data)); }, () => {});
    return () => { live = false; };
  }, [currentProfile?.id, user?.id, isLocalGuest, isDemoMode]);
  const toggleFollow = async () => {
    if (!supabase || !user || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki Music requis', `Crée ou connecte ton compte Loki Music : tu suivras ${currentProfile?.username || 'ce profil'} automatiquement dès que ton compte sera prêt.`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create', currentProfile?.username) },
      ]);
      return;
    }
    if (!currentProfile || followBusy) return;
    setFollowBusy(true);
    if (isFollowing) {
      const { error } = await supabase.rpc('keep_unfollow_profile', { p_followee_id: currentProfile.id });
      if (!error) setFollowing(false);
    } else {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: currentProfile.id });
      if (!error) setFollowing(true);
      else if (String(error.message || '').includes('FOLLOW_LIMIT')) Alert.alert('Limite atteinte', 'Ton plan actuel limite le nombre de profils que tu peux suivre.');
    }
    setFollowBusy(false);
  };

  const compatibility = currentProfile ? overlapScore([...(user?.favoriteGenres ?? []), ...(user?.favoriteArtists ?? [])], [...currentProfile.favoriteGenres, ...currentProfile.favoriteArtists]) : null;
  const currentDistance = currentProfile && searchPosition && Number.isFinite(currentProfile.approxLat) && Number.isFinite(currentProfile.approxLng)
    ? distanceKm(searchPosition.latitude, searchPosition.longitude, currentProfile.approxLat as number, currentProfile.approxLng as number) : null;
  const proximity = currentProfile
    ? currentDistance !== null
      ? `${currentDistance < 1 ? '< 1' : Math.round(currentDistance)} km · ${[currentProfile.city, currentProfile.countryCode].filter(Boolean).join(' · ') || 'autour de toi'}`
      : user?.city && currentProfile.city && user.city.toLowerCase() === currentProfile.city.toLowerCase()
      ? `Même ville · ${currentProfile.city}`
      : user?.countryCode && currentProfile.countryCode === user.countryCode
        ? `Même pays · ${currentProfile.countryCode}`
        : [currentProfile.city, currentProfile.countryCode].filter(Boolean).join(' · ')
    : '';

  const discoveryUnlocked = (isDemoMode && !demoDiscoveryLocked) || discoveryAccess?.allowed === true;
  const freeRemaining = discoveryAccess?.planCode === 'FREE' ? discoveryAccess.remaining : null;

  if (isDemoMode && demoDiscoveryLocked) {
    return (
      <SafeAreaView style={styles.container}><PersonalThemeBackdrop />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.demoLockedHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Découvertes</Text>
              <Text style={styles.demoLockedKicker}>APERÇU DU MODE CONNECTÉ</Text>
            </View>
            <TouchableOpacity
              style={styles.demoHelpButton}
              onPress={() => Alert.alert(
                'Découvertes & FREE',
                'Découvertes te permet de trouver des profils et événements selon tes goûts. En mode démo, cette zone est verrouillée pour éviter de créer de fausses données. Une fois connecté, tu peux suivre des profils, participer aux événements et utiliser tes FREE pour garder certaines trouvailles sur ton profil. Écouter reste gratuit.',
                [
                  { text: 'Fermer', style: 'cancel' },
                  { text: 'Créer / se connecter', onPress: openAccount },
                ],
              )}
              accessibilityRole="button"
              accessibilityLabel="Comprendre Découvertes et les FREE"
            >
              <Text style={styles.demoHelpButtonText}>?</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.demoLockedCard}>
            <View style={styles.demoLockCircle}><Text style={styles.demoLockIcon}>🔒</Text></View>
            <Text style={styles.demoLockedTitle}>Connecte ton profil pour ouvrir Découvertes</Text>
            <Text style={styles.demoLockedBody}>En mode démo, tu vois comment Loki Music fonctionne mais aucun profil réel n’est suivi, aucun événement n’est rejoint et aucun FREE n’est dépensé.</Text>
            <View style={styles.demoFeatureRow}><Text style={styles.demoFeatureIcon}>◎</Text><Text style={styles.demoFeatureText}>Profils selon proximité + affinités musicales</Text></View>
            <View style={styles.demoFeatureRow}><Text style={styles.demoFeatureIcon}>♫</Text><Text style={styles.demoFeatureText}>Événements validés et participation depuis l’app</Text></View>
            <View style={styles.demoFeatureRow}><Text style={styles.demoFeatureIcon}>◆</Text><Text style={styles.demoFeatureText}>FREE = crédits pour garder certaines trouvailles, pas pour écouter</Text></View>
            <MotionActionButton
              variant="primary"
              size="medium"
              onPress={openAccount}
              accessibilityLabel="Créer ou connecter mon compte Loki Music"
            >
              CRÉER / SE CONNECTER
            </MotionActionButton>
          </View>
        </ScrollView>
</SafeAreaView>
    );
  }

  if (discoverMode === 'PEOPLE' && localDiscoveryChecked && !localDiscoveryEnabled) {
    return (
      <SafeAreaView style={styles.container}><PersonalThemeBackdrop />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.discoverTitleRow}>
            <Text style={[styles.title, styles.discoverTitle]}>{t('nav.discover')}</Text>
            <TouchableOpacity style={styles.discoverHelpButton} onPress={() => setDiscoverHelpOpen(true)} accessibilityRole="button" accessibilityLabel="Tout comprendre sur Découvertes">
              <Text style={styles.discoverHelpButtonText}>?</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.discoveryModes}>
            <View style={[styles.discoveryModeButton, styles.discoveryModeButtonOn]} accessibilityRole="text" accessibilityLabel="Personnes, rubrique sélectionnée mais temporairement indisponible"><Text style={[styles.discoveryModeText, styles.discoveryModeTextOn]}>PERSONNES</Text></View>
            {eventsFeatureEnabled ? <TouchableOpacity style={styles.discoveryModeButton} onPress={() => setDiscoverMode('EVENTS')}><Text style={styles.discoveryModeText}>ÉVÉNEMENTS</Text></TouchableOpacity> : null}
          </View>
          <View style={styles.emptyCard}>
            <Text style={styles.mutedHint}>{localDiscoveryUnavailable ? 'Connexion à Loki Music momentanément ralentie : le droit d’accès à Découvertes n’a pas pu être vérifié. Ce n’est pas une désactivation.' : 'La découverte de personnes est temporairement indisponible. Les événements restent accessibles ci-dessus.'}</Text>
            {localDiscoveryUnavailable ? <TouchableOpacity onPress={() => { setLocalDiscoveryChecked(false); setLocalDiscoveryRetry((n) => n + 1); }} accessibilityRole="button" accessibilityLabel="Réessayer de charger Découvertes"><Text style={styles.discoveryModeText}>Réessayer</Text></TouchableOpacity> : null}
          </View>
        </ScrollView>
</SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}><PersonalThemeBackdrop />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {returnToParties ? <StandardBackButton label="Soirées" onPress={() => { setReturnToParties(false); navigation.navigate('Parties'); }} accessibilityLabel="Retour aux rubriques Soirées" /> : null}
        <View style={styles.discoverTitleRow}>
          <Text style={[styles.title, styles.discoverTitle]}>{t('nav.discover')}</Text>
          <TouchableOpacity style={styles.discoverHelpButton} onPress={() => setDiscoverHelpOpen(true)} accessibilityRole="button" accessibilityLabel="Tout comprendre sur Découvertes">
            <Text style={styles.discoverHelpButtonText}>?</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.discoveryModes} accessibilityLabel="Choisir le type de découverte">
          <TouchableOpacity style={[styles.discoveryModeButton, discoverMode === 'PEOPLE' && styles.discoveryModeButtonOn]} onPress={() => setDiscoverMode('PEOPLE')} accessibilityRole="tab" accessibilityState={{ selected: discoverMode === 'PEOPLE' }}>
            <Text style={[styles.discoveryModeText, discoverMode === 'PEOPLE' && styles.discoveryModeTextOn]}>PERSONNES</Text>
          </TouchableOpacity>
          {eventsFeatureEnabled ? <TouchableOpacity style={[styles.discoveryModeButton, discoverMode === 'EVENTS' && styles.discoveryModeButtonOn]} onPress={() => setDiscoverMode('EVENTS')} accessibilityRole="tab" accessibilityState={{ selected: discoverMode === 'EVENTS' }}>
            <Text style={[styles.discoveryModeText, discoverMode === 'EVENTS' && styles.discoveryModeTextOn]}>ÉVÉNEMENTS</Text>
          </TouchableOpacity> : null}
        </View>
        {discoverMode === 'EVENTS' ? (
          <View style={styles.eventsDiscovery}>
            <View style={styles.eventsDiscoveryHeader}><View style={{flex:1}}><Text style={styles.sectionTitle}>Événements à découvrir</Text><Text style={styles.mutedHint}>Soirées publiques validées, à venir sur Loki Music.</Text></View><Text style={styles.eventsCount}>{upcomingEvents.length}</Text></View>
            {eventsLoading ? <ActivityIndicator color={colors.primaryLight} style={styles.eventsLoader} /> : upcomingEvents.length ? upcomingEvents.map((event) => {
              const startsAt = new Date(event.startsAt);
              const live = startsAt.getTime() <= Date.now() && (!event.endsAt || new Date(event.endsAt).getTime() >= Date.now());
              return (
                <TouchableOpacity key={event.id} style={styles.eventDiscoveryCard} onPress={() => { void openEventInline(event); }} accessibilityLabel={`Voir l’événement ${event.name} sans quitter Découvertes`}>
                  {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={styles.eventDiscoveryCover} /> : <View style={[styles.eventDiscoveryCover, styles.eventDiscoveryFallback]}><Text style={styles.eventDiscoveryFallbackText}>♬</Text></View>}
                  <View style={styles.eventDiscoveryCopy}>
                    <View style={styles.eventDiscoveryKickerRow}><Text style={styles.eventDiscoveryKicker}>{live ? '● EN COURS' : 'À VENIR'}</Text><Text style={styles.eventDiscoveryPrice}>{event.ticketPriceCents ? `${(event.ticketPriceCents / 100).toFixed(2).replace('.', ',')} €` : 'ENTRÉE LIBRE'}</Text></View>
                    <Text style={styles.eventDiscoveryTitle} numberOfLines={2}>{event.name}</Text>
                    <Text style={styles.eventDiscoveryMeta} numberOfLines={1}>{startsAt.toLocaleString('fr-FR', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</Text>
                    <Text style={styles.eventDiscoveryMeta} numberOfLines={1}>{[event.venueName, event.countryCode].filter(Boolean).join(' · ') || 'Lieu à préciser'}</Text>
                    {event.djArtistNames.length ? <Text style={styles.eventDiscoveryArtists} numberOfLines={1}>{event.djArtistNames.map((name) => name.replace(/^@+/, '')).join(' · ')}</Text> : null}
                  </View>
                  <Text style={styles.eventDiscoveryArrow}>›</Text>
                </TouchableOpacity>
              );
            }) : <View style={styles.emptyCard}><Text style={styles.mutedHint}>Aucun événement public validé à venir pour le moment.</Text></View>}
          </View>
        ) : <>
        <View style={styles.discoveryHeader}>
          <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Profils autour de moi</Text><Text style={styles.mutedHint}>Découvre des personnes par proximité et affinités musicales.</Text></View>
          {currentProfile && !discoveryUnlocked && !accessLoading ? <TouchableOpacity style={styles.lockBadge} onPress={openPremium}><Text style={styles.lockText}>🔒 Premium</Text></TouchableOpacity> : currentProfile && freeRemaining !== null ? <TouchableOpacity style={styles.trialBadge} onPress={openPremium} accessibilityRole="button" accessibilityLabel="Voir Premium pour plus de découvertes"><Text style={styles.trialText}>FREE · {freeRemaining} RESTANT{freeRemaining === 1 ? '' : 'S'}</Text></TouchableOpacity> : null}
        </View>
        <View style={styles.usernameSearch}>
          <Text style={styles.usernameSearchIcon}>⌕</Text>
          <TextInput value={profileQuery} onChangeText={(value) => { setProfileQuery(value); setProfileIndex(0); setDiscoveryAccess(null); setCurrentProfileSnapshot(null); }} placeholder="Rechercher un pseudo Loki Music" placeholderTextColor={colors.textMutedGrey} autoCapitalize="none" autoCorrect={false} style={styles.usernameSearchInput} accessibilityLabel="Rechercher un contact Loki Music par pseudo" />
          {profileQuery ? <MotionActionButton
            variant="ghost"
            size="small"
            onPress={() => { setProfileQuery(''); setProfileIndex(0); }}
            accessibilityLabel="Effacer la recherche"
            accessibilityHint="Réinitialise la recherche par pseudo"
          >
            ×
          </MotionActionButton> : null}
        </View>
        <View style={styles.searchPanel}>
          <View style={styles.radiusHeader}><Text style={styles.radiusLabel}>1 · DISTANCE</Text><View style={styles.radiusValue}><Text style={styles.radiusValueText}>{radiusKm >= 20000 ? 'MONDE' : `${radiusKm} KM`}</Text></View></View>
          <View style={styles.radiusTrack}><View style={[styles.radiusFill, { width: `${(DISCOVERY_RADII.indexOf(radiusKm as any) / (DISCOVERY_RADII.length - 1)) * 100}%` }]} /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radiusChoices}>
            {DISCOVERY_RADII.map((value) => (
              <TouchableOpacity key={value} style={[styles.radiusChoice, radiusKm === value && styles.radiusChoiceOn]} onPress={() => { setRadiusKm(value); resetSearchResults(); }} accessibilityLabel={value >= 20000 ? 'Rayon Monde' : `Rayon ${value} kilomètres`}><Text style={[styles.radiusChoiceText, radiusKm === value && styles.radiusChoiceTextOn]}>{value >= 20000 ? 'Monde' : value}</Text></TouchableOpacity>
            ))}
          </ScrollView>
          <MotionActionButton
          variant="primary"
          size="medium"
          onPress={() => void searchAroundMe()}
          disabled={searchBusy}
          accessibilityLabel="Rechercher des profils autour de moi"
          accessibilityHint="Lance une recherche dans le rayon sélectionné"
        >
          {searchBusy ? '⏳ Recherche...' : '2 · ⌖ RECHERCHER'}
        </MotionActionButton>
          <Text style={styles.searchHint}>{hasSearched && searchPosition ? `${filteredProfiles.length} profil${filteredProfiles.length > 1 ? 's' : ''} dans ce rayon` : `${filteredProfiles.length} profil${filteredProfiles.length > 1 ? 's' : ''} disponible${filteredProfiles.length > 1 ? 's' : ''} · le GPS affine ensuite la proximité`}</Text>
        </View>
        {loadingProfiles || (currentProfile && accessLoading) ? <ActivityIndicator color={colors.primaryLight} /> : !discoveryUnlocked && currentProfile ? (
          <TouchableOpacity style={styles.lockCard} onPress={openPremium}><Text style={styles.lockIcon}>🔒</Text><Text style={styles.lockTitle}>Tes découvertes Free sont utilisées</Text><Text style={styles.lockBody}>Le compte Free découvre 3 profils. Premium 2,99 €/mois passe Découvertes en illimité. Tu peux aussi gagner des profils supplémentaires en partageant Loki Music et en faisant grandir tes abonnés.</Text><Text style={styles.lockCta}>VOIR PREMIUM 2,99 €</Text></TouchableOpacity>
        ) : !currentProfile ? (
          <View style={styles.emptyCard}><Text style={styles.mutedHint}>{profileQuery ? `Aucun profil ne correspond à ${profileQuery.replace(/^@/, '')}.` : hasSearched ? 'Aucun profil public dans ce rayon. Élargis la jauge puis relance la recherche.' : 'Aucun profil n’est affiché par défaut. Choisis une distance puis appuie sur RECHERCHER.'}</Text></View>
        ) : (
          <View style={styles.profileCard} {...profileDeckPan.panHandlers}>
            <TouchableOpacity activeOpacity={0.85} onPress={openCurrentProfile} style={styles.coverWrap} accessibilityLabel={`Ouvrir le profil de ${currentProfile.username}`}>
              {currentProfile.avatarUrl && avatarFailedFor !== currentProfile.id ? <Image source={{ uri: currentProfile.avatarUrl }} style={styles.cover} onError={() => setAvatarFailedFor(currentProfile.id)} /> : <View style={[styles.cover, styles.coverFallback]}><Text style={styles.coverInitial}>{currentProfile.username.slice(0,1).toUpperCase()}</Text></View>}
              {compareFeatureEnabled ? (
                compareAccess?.allowed === false
                  ? <TouchableOpacity style={styles.affinityBadge} onPress={openPremium} accessibilityLabel="Voir Premium pour comparer les affinités"><Text style={styles.affinityBadgeText}>🔒</Text></TouchableOpacity>
                  : <View style={styles.affinityBadge}><Text style={styles.affinityBadgeText}>{compatibility ?? 0}%</Text></View>
              ) : null}
            </TouchableOpacity>
            {filteredProfiles.length > 1 ? <View style={styles.profileHeaderNav}>
              <MotionActionButton
                variant="ghost"
                size="small"
                onPress={previousProfile}
                accessibilityLabel="Profil précédent"
                accessibilityHint="Affiche le profil précédent"
              >
                ‹
              </MotionActionButton>
              <View style={styles.profileHeaderCenter}>
                <Text style={styles.profileName}>{currentProfile.username}</Text>
                <Text style={styles.deckCountHeader}>{profileIndex % filteredProfiles.length + 1} / {filteredProfiles.length}</Text>
                <ProfileCertificationBadge tier={currentProfileSnapshot?.certificationTier ?? currentProfile.certificationTier ?? 'UNVERIFIED'} compact />
              </View>
              <MotionActionButton
                variant="ghost"
                size="small"
                onPress={nextProfile}
                accessibilityLabel="Profil suivant"
                accessibilityHint="Affiche le profil suivant"
              >
                ›
              </MotionActionButton>
            </View> : <View style={styles.profileNameRow}><Text style={styles.profileName}>{currentProfile.username}</Text><ProfileCertificationBadge tier={currentProfileSnapshot?.certificationTier ?? currentProfile.certificationTier ?? 'UNVERIFIED'} compact /></View>}
            <Text style={styles.profileBio} numberOfLines={2}>{currentProfile.bio || 'Profil Loki Music public'}</Text>
            <Text style={styles.proximity}>{proximity || 'Profil public Loki Music'}</Text>
            <View style={styles.genreChips}>{(currentProfile.favoriteGenres.length ? currentProfile.favoriteGenres.slice(0, 2) : ['Loki Music']).map((genre) => (
              <View key={genre} style={styles.genreChip}><Text style={styles.genreChipText}>{genre}</Text></View>
            ))}</View>
            {currentProfileSnapshot ? <ProfileCounterRow kind="connections" compact items={[{ value: currentProfileSnapshot.followers, label: 'Abonnés' }, { value: currentProfileSnapshot.following, label: 'Abonnements' }]} /> : null}
            <View style={styles.cardActions}>
              <TouchableOpacity style={[styles.actionButton, styles.superButton, styles.superButtonFull]} onPress={openCurrentProfile} accessibilityLabel="Voir le profil">
                <Text style={styles.superIcon}>VOIR LE PROFIL</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        </>}
      </ScrollView>

      <KeepModal visible={discoverHelpOpen} transparent animationType="fade" onRequestClose={() => setDiscoverHelpOpen(false)}>
        <View style={styles.discoverHelpBackdrop}>
          <View style={styles.discoverHelpCard}>
            <View style={styles.discoverHelpHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.discoverHelpTitle}>Tout faire dans Découvertes</Text>
                <Text style={styles.discoverHelpHint}>Trouve des personnes et des événements sans quitter ton parcours.</Text>
              </View>
              <TouchableOpacity style={styles.discoverHelpClose} onPress={() => setDiscoverHelpOpen(false)} accessibilityLabel="Fermer l’aide Découvertes">
                <Text style={styles.discoverHelpCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.discoverHelpSteps}>
              <View style={styles.discoverHelpStep}><Text style={styles.discoverHelpNo}>1</Text><View style={styles.discoverHelpCopy}><Text style={styles.discoverHelpStepTitle}>Personnes</Text><Text style={styles.discoverHelpText}>Découvre des profils selon ta proximité et tes affinités musicales, puis ouvre leur profil sans perdre ta recherche.</Text></View></View>
              <View style={styles.discoverHelpStep}><Text style={styles.discoverHelpNo}>2</Text><View style={styles.discoverHelpCopy}><Text style={styles.discoverHelpStepTitle}>Recherche</Text><Text style={styles.discoverHelpText}>Tape un pseudo pour retrouver directement une personne, même si elle n’est pas dans les premières suggestions.</Text></View></View>
              <View style={styles.discoverHelpStep}><Text style={styles.discoverHelpNo}>3</Text><View style={styles.discoverHelpCopy}><Text style={styles.discoverHelpStepTitle}>Événements</Text><Text style={styles.discoverHelpText}>Ouvre un événement validé sur place, consulte les informations et réponds à l’invitation sans redirection inutile.</Text></View></View>
              <View style={styles.discoverHelpStep}><Text style={styles.discoverHelpNo}>4</Text><View style={styles.discoverHelpCopy}><Text style={styles.discoverHelpStepTitle}>FREE</Text><Text style={styles.discoverHelpText}>Écouter reste gratuit. Les FREE servent aux actions qui ajoutent réellement une musique à ton profil ou aux fonctions qui l’indiquent clairement avant validation.</Text></View></View>
            </View>
            <TouchableOpacity style={styles.discoverHelpDone} onPress={() => setDiscoverHelpOpen(false)} accessibilityLabel="Fermer l’aide Découvertes"><Text style={styles.discoverHelpDoneText}>J’AI COMPRIS</Text></TouchableOpacity>
          </View>
        </View>
      </KeepModal>

      <KeepModal visible={eventDetailOpen} transparent animationType="fade" onRequestClose={() => setEventDetailOpen(false)}>
        <View style={styles.eventModalBackdrop}>
          <View style={styles.eventModalCard}>
            <View style={styles.eventModalHandle} />
            <Text style={styles.eventModalEyebrow}>DÉCOUVERTES · ÉVÉNEMENT</Text>
            <Text style={styles.eventModalTitle}>{eventDetail?.name ?? 'Événement'}</Text>
            {eventDetail ? (
              <>
                <Text style={styles.eventModalMeta}>{new Date(eventDetail.startsAt).toLocaleString('fr-FR')} {eventDetail.venueName ? `· ${eventDetail.venueName}` : ''}</Text>
                {eventDetail.description ? (
                  // Adel (10/10/2026) : texte d'événement très long → 23 mots puis « En savoir plus » (repli, rien n'est supprimé) ;
                  // la zone défile pour que les compteurs et les trois réponses restent toujours visibles.
                  <ScrollView style={styles.eventModalBodyScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                    <ClampedText style={styles.eventModalBody} text={eventDetail.description} />
                  </ScrollView>
                ) : null}
                <View style={styles.eventModalStats}>
                  <View style={styles.eventModalStat}><Text style={styles.eventModalStatValue}>{eventRsvpCounts.going}</Text><Text style={styles.eventModalStatLabel}>participent</Text></View>
                  <View style={styles.eventModalStat}><Text style={styles.eventModalStatValue}>{eventRsvpCounts.maybe}</Text><Text style={styles.eventModalStatLabel}>intéressés</Text></View>
                </View>
                <View style={styles.eventRsvpRow}>
                  <TouchableOpacity disabled={eventActionBusy} style={[styles.eventRsvpButton, eventRsvp === 'NOT_GOING' && styles.eventRsvpButtonOn]} onPress={() => { void updateEventRsvpInline('NOT_GOING'); }}><Text style={styles.eventRsvpButtonText}>PAS POUR MOI</Text></TouchableOpacity>
                  <TouchableOpacity disabled={eventActionBusy} style={[styles.eventRsvpButton, eventRsvp === 'MAYBE' && styles.eventRsvpButtonOn]} onPress={() => { void updateEventRsvpInline('MAYBE'); }}><Text style={styles.eventRsvpButtonText}>PEUT-ÊTRE</Text></TouchableOpacity>
                  <TouchableOpacity disabled={eventActionBusy} style={[styles.eventRsvpButton, styles.eventRsvpGoing, eventRsvp === 'GOING' && styles.eventRsvpGoingOn]} onPress={() => { void updateEventRsvpInline('GOING'); }}><Text style={[styles.eventRsvpButtonText, styles.eventRsvpGoingText]}>{eventRsvp === 'GOING' ? '✓ JE PARTICIPE' : 'JE PARTICIPE'}</Text></TouchableOpacity>
                </View>
                {eventRsvp === 'GOING' ? <Text style={styles.eventRsvpSaved}>Participation enregistrée. Tu retrouveras aussi cet événement dans ton espace Soirées.</Text> : null}
              </>
            ) : null}
            <TouchableOpacity style={styles.eventModalClose} onPress={() => setEventDetailOpen(false)}><Text style={styles.eventModalCloseText}>FERMER</Text></TouchableOpacity>
          </View>
        </View>
      </KeepModal>
</SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 110 },
  title: { color: colors.white, fontSize: 22, fontWeight: '900', marginBottom: 10 },
  discoverTitleRow:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:10},
  discoverTitle:{flex:1,marginBottom:0},
  discoverHelpButton:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},
  discoverHelpButtonText:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},
  discoverHelpBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',alignItems:'center',justifyContent:'center',padding:22},
  discoverHelpCard:{width:'100%',maxWidth:460,borderRadius:22,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.primary,padding:18,gap:14},
  discoverHelpHead:{flexDirection:'row',alignItems:'flex-start',gap:10},
  discoverHelpTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900'},
  discoverHelpHint:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:4},
  discoverHelpClose:{width:32,height:32,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  discoverHelpCloseText:{color:colors.textPrimary,fontSize:20,fontWeight:'900',lineHeight:22},
  discoverHelpSteps:{gap:9},
  discoverHelpStep:{minHeight:56,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:10,flexDirection:'row',alignItems:'center',gap:10},
  discoverHelpNo:{width:28,height:28,borderRadius:14,backgroundColor:colors.primary,color:'#FFF',fontSize:12,fontWeight:'900',textAlign:'center',lineHeight:28},
  discoverHelpCopy:{flex:1,minWidth:0},
  discoverHelpStepTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  discoverHelpText:{color:colors.textMuted,fontSize:10,lineHeight:15,marginTop:2},
  discoverHelpDone:{minHeight:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  discoverHelpDoneText:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:.7},
  demoLockedHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:12},
  demoLockedKicker:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.1},
  demoHelpButton:{width:36,height:36,borderRadius:18,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(124,92,252,.10)',alignItems:'center',justifyContent:'center'},
  demoHelpButtonText:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},
  demoLockedCard:{padding:20,borderRadius:24,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,alignItems:'stretch',gap:11},
  demoLockCircle:{width:70,height:70,borderRadius:35,alignSelf:'center',alignItems:'center',justifyContent:'center',backgroundColor:'rgba(124,92,252,.14)',borderWidth:1,borderColor:colors.primaryLight},
  demoLockIcon:{fontSize:31},
  demoLockedTitle:{color:colors.white,fontSize:19,fontWeight:'900',textAlign:'center',marginTop:3},
  demoLockedBody:{color:colors.textMuted,fontSize:12,lineHeight:18,textAlign:'center',marginBottom:3},
  demoFeatureRow:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:11,paddingVertical:9,flexDirection:'row',alignItems:'center',gap:10},
  demoFeatureIcon:{width:24,color:colors.primaryLight,fontSize:17,fontWeight:'900',textAlign:'center'},
  demoFeatureText:{flex:1,color:colors.textPrimary,fontSize:11,lineHeight:16,fontWeight:'700'},
  discoveryModes:{flexDirection:'row',gap:8,marginBottom:12,padding:4,borderRadius:18,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},
  discoveryModeButton:{flex:1,minHeight:44,borderRadius:14,alignItems:'center',justifyContent:'center'},
  discoveryModeButtonOn:{backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight},
  discoveryModeText:{color:colors.textMuted,fontSize:11,fontWeight:'900',letterSpacing:.6},
  discoveryModeTextOn:{color:colors.white},
  eventsDiscovery:{gap:10},
  eventsDiscoveryHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:2},
  eventsCount:{minWidth:34,height:34,borderRadius:17,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary,overflow:'hidden',textAlign:'center',textAlignVertical:'center',lineHeight:32,color:colors.primaryLight,fontSize:12,fontWeight:'900'},
  eventsLoader:{marginVertical:24},
  eventDiscoveryCard:{minHeight:108,borderRadius:20,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:10,flexDirection:'row',alignItems:'center',gap:12},
  eventDiscoveryCover:{width:86,height:86,borderRadius:16,backgroundColor:colors.backgroundCard},
  eventDiscoveryFallback:{alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.primary},
  eventDiscoveryFallbackText:{color:colors.primaryLight,fontSize:30,fontWeight:'900'},
  eventDiscoveryCopy:{flex:1,minWidth:0},
  eventDiscoveryKickerRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  eventDiscoveryKicker:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:.6},
  eventDiscoveryPrice:{color:colors.primaryLight,fontSize:9,fontWeight:'900'},
  eventDiscoveryTitle:{color:colors.white,fontSize:15,fontWeight:'900',marginTop:5},
  eventDiscoveryMeta:{color:colors.textMuted,fontSize:10,lineHeight:15,marginTop:2},
  eventDiscoveryArtists:{color:colors.primaryLight,fontSize:10,fontWeight:'800',marginTop:4},
  eventDiscoveryArrow:{color:colors.primaryLight,fontSize:26,fontWeight:'800'},
  eventModalBackdrop:{flex:1,backgroundColor:'rgba(5,3,10,.82)',alignItems:'center',justifyContent:'center',padding:18},
  eventModalCard:{width:'100%',maxWidth:430,borderRadius:24,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:18},
  eventModalHandle:{width:46,height:4,borderRadius:2,backgroundColor:colors.border,alignSelf:'center',marginBottom:14},
  eventModalEyebrow:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.1,textAlign:'center'},
  eventModalTitle:{color:colors.white,fontSize:21,fontWeight:'900',textAlign:'center',marginTop:5},
  eventModalMeta:{color:colors.primaryLight,fontSize:11,fontWeight:'800',textAlign:'center',marginTop:7},
  eventModalBodyScroll:{maxHeight:210,marginTop:10},
  eventModalBody:{color:colors.textMuted,fontSize:12,lineHeight:18,textAlign:'center'},
  eventModalStats:{flexDirection:'row',gap:8,marginTop:14},
  eventModalStat:{flex:1,minHeight:54,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  eventModalStatValue:{color:colors.keep,fontSize:18,fontWeight:'900'},
  eventModalStatLabel:{color:colors.textMuted,fontSize:9,fontWeight:'800',marginTop:2},
  eventRsvpRow:{flexDirection:'row',gap:6,marginTop:14},
  eventRsvpButton:{flex:1,minHeight:46,borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(124,92,252,.08)',alignItems:'center',justifyContent:'center',paddingHorizontal:5},
  eventRsvpButtonOn:{backgroundColor:'rgba(124,92,252,.28)',borderColor:colors.primaryLight},
  eventRsvpGoing:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)'},
  eventRsvpGoingOn:{backgroundColor:'rgba(45,225,194,.20)'},
  eventRsvpButtonText:{color:colors.white,fontSize:8.5,fontWeight:'900',textAlign:'center'},
  eventRsvpGoingText:{color:colors.keep},
  eventRsvpSaved:{color:colors.keep,fontSize:10,fontWeight:'800',textAlign:'center',marginTop:10},
  eventModalClose:{minHeight:44,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:14,borderWidth:1,borderColor:colors.border},
  eventModalCloseText:{color:colors.textMuted,fontSize:10,fontWeight:'900',letterSpacing:.7},
  discoveryHeader:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:5},usernameSearch:{minHeight:50,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,marginBottom:7,borderRadius:16,backgroundColor:colors.backgroundCard,borderWidth:1.5,borderColor:'#665B73'},usernameSearchIcon:{color:colors.primaryLight,fontSize:20,fontWeight:'800'},usernameSearchInput:{flex:1,minHeight:46,color:colors.white,fontSize:15,fontWeight:'600'},usernameClear:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard},usernameClearText:{color:colors.white,fontSize:22,lineHeight:24,fontWeight:'700'},
  sectionTitle:{color:colors.white,fontSize:16,fontWeight:'900'},mutedHint:{color:colors.textMuted,fontSize:12,lineHeight:17},
  lockBadge:{paddingHorizontal:9,paddingVertical:5,borderRadius:10,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},lockText:{color:colors.white,fontSize:10,fontWeight:'900'},trialBadge:{paddingHorizontal:9,paddingVertical:5,borderRadius:10,backgroundColor:'rgba(45,225,194,0.12)',borderWidth:1,borderColor:colors.keepPressed},trialText:{color:colors.keep,fontSize:9,fontWeight:'900'},
  searchPanel:{padding:10,borderRadius:15,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,marginBottom:8},radiusHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:5},radiusLabel:{color:colors.textMuted,fontSize:9,fontWeight:'900'},radiusValue:{minWidth:54,paddingHorizontal:8,paddingVertical:4,borderRadius:10,backgroundColor:colors.backgroundCard,alignItems:'center'},radiusValueText:{color:colors.white,fontSize:9,fontWeight:'900'},radiusTrack:{height:3,borderRadius:3,backgroundColor:colors.border,overflow:'hidden'},radiusFill:{height:3,borderRadius:3,backgroundColor:colors.primary},radiusChoices:{flexDirection:'row',alignItems:'center',gap:5,marginTop:6,marginBottom:5,paddingRight:8},radiusChoice:{minWidth:48,minHeight:44,paddingHorizontal:7,borderRadius:8,alignItems:'center',justifyContent:'center'},radiusChoiceOn:{backgroundColor:colors.primary},radiusChoiceText:{color:colors.white,fontSize:12,fontWeight:'800'},radiusChoiceTextOn:{color:colors.white},searchButton:{minHeight:48,borderRadius:14,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:2},searchButtonText:{color:colors.white,fontSize:14,fontWeight:'900',letterSpacing:.4},searchHint:{color:colors.textMuted,fontSize:8,marginTop:5,textAlign:'center'},
  profileHeaderNav:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:10,marginBottom:4},profileHeaderCenter:{flex:1,alignItems:'center',justifyContent:'center'},deckCountHeader:{color:colors.textMuted,fontSize:10,fontWeight:'900',marginTop:2},deckNav:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,marginTop:8,marginBottom:4},deckArrow:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,borderWidth:2,borderColor:colors.primaryLight,shadowColor:colors.primaryLight,shadowOpacity:.6,shadowRadius:8,shadowOffset:{width:0,height:0},elevation:6},deckArrowText:{color:colors.white,fontSize:32,lineHeight:34,fontWeight:'900'},deckCount:{minWidth:54,textAlign:'center',color:colors.white,fontSize:12,fontWeight:'900'},
    lockCard:{padding:16,borderRadius:20,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center'},lockIcon:{fontSize:26,marginBottom:8},lockTitle:{color:colors.white,fontSize:16,fontWeight:'900',textAlign:'center'},lockBody:{color:colors.textMuted,fontSize:12,lineHeight:17,textAlign:'center',marginTop:6},lockCta:{color:colors.primaryLight,fontSize:12,fontWeight:'900',marginTop:12},
  emptyCard:{padding:18,borderRadius:18,backgroundColor:colors.background,borderWidth:1,borderColor:colors.border},
  profileCard:{padding:10,borderRadius:22,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},coverWrap:{position:'relative',alignItems:'center',alignSelf:'center'},cover:{width:198,height:198,borderRadius:16,backgroundColor:colors.backgroundCard},coverFallback:{alignItems:'center',justifyContent:'center'},coverInitial:{color:colors.white,fontSize:72,fontWeight:'900'},affinityBadge:{position:'absolute',top:10,right:10,minWidth:44,minHeight:32,paddingHorizontal:10,borderRadius:12,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},affinityBadgeText:{color:colors.white,fontSize:13,fontWeight:'900'},profileNameRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,marginTop:10},profileName:{color:colors.white,fontSize:21,fontWeight:'900',textAlign:'center'},profileBio:{color:colors.textMutedGrey,fontSize:14,lineHeight:19,textAlign:'center',marginTop:3},proximity:{color:colors.primaryLight,fontSize:11,fontWeight:'800',textAlign:'center',marginTop:3},genreChips:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:6,marginTop:8},genreChip:{paddingHorizontal:10,paddingVertical:5,borderRadius:12,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},genreChipText:{color:colors.white,fontSize:11,fontWeight:'800'},cardActions:{flexDirection:'row',justifyContent:'center',alignItems:'stretch',gap:10,marginTop:12,width:'100%'},actionButton:{minHeight:48,borderRadius:14,alignItems:'center',justifyContent:'center'},passButton:{backgroundColor:colors.pass},passIcon:{color:colors.white,fontSize:23,fontWeight:'900'},superButton:{backgroundColor:colors.primary,borderWidth:2,borderColor:colors.primaryLight,paddingHorizontal:14,shadowColor:colors.primaryLight,shadowOpacity:.5,shadowRadius:8,shadowOffset:{width:0,height:0},elevation:5},superButtonFull:{flex:1},superIcon:{color:colors.white,fontSize:12,lineHeight:16,fontWeight:'900',textAlign:'center'},keepButton:{width:68,height:68,borderRadius:34,backgroundColor:colors.keep,shadowColor:colors.keep,shadowOpacity:0.5,shadowRadius:10,shadowOffset:{width:0,height:0},elevation:7},keepButtonOn:{backgroundColor:colors.keepPressed},keepIcon:{color:colors.black,fontSize:24,fontWeight:'900'},
});
