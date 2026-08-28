import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type KeepApproximateCoordinates = {
  lat: number;
  lng: number;
};

export type KeepResolvedLocation = KeepApproximateCoordinates & {
  city?: string;
  countryCode?: string;
  source: 'native' | 'web-free';
};

export class KeepLocationPermissionError extends Error {
  constructor() {
    super('location_permission_denied');
    this.name = 'KeepLocationPermissionError';
  }
}

// ~1 km selon la latitude : assez précis pour la découverte locale, mais KEEP
// ne conserve jamais la position GPS exacte dans le profil.
export function roundKeepCoordinates(latitude: number, longitude: number): KeepApproximateCoordinates {
  return {
    lat: Math.round(latitude * 100) / 100,
    lng: Math.round(longitude * 100) / 100,
  };
}

async function reverseGeocodeWeb(latitude: number, longitude: number): Promise<{ city?: string; countryCode?: string }> {
  // Expo fournit la position GPS sur Web mais son geocoding/reverse-geocoding
  // est natif Android/iOS. Ce fallback est volontairement CLIENT-SIDE, sans clé
  // ni compte, et n'est appelé qu'après consentement sur la position courante.
  const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('localityLanguage', 'fr');

  const response = await fetch(url.toString(), { method: 'GET' });
  if (!response.ok) throw new Error(`web_reverse_geocode_${response.status}`);
  const data = await response.json() as any;
  return {
    city: data?.city || data?.locality || data?.principalSubdivision || undefined,
    countryCode: typeof data?.countryCode === 'string' ? data.countryCode.toUpperCase() : undefined,
  };
}

export async function getCurrentKeepLocation(): Promise<KeepResolvedLocation> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new KeepLocationPermissionError();

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const approx = roundKeepCoordinates(latitude, longitude);

  if (Platform.OS === 'web') {
    const place = await reverseGeocodeWeb(latitude, longitude);
    return { ...approx, ...place, source: 'web-free' };
  }

  const places = await Location.reverseGeocodeAsync({ latitude, longitude });
  const place = places[0];
  return {
    ...approx,
    city: place?.city || place?.subregion || place?.region || undefined,
    countryCode: place?.isoCountryCode?.toUpperCase() || undefined,
    source: 'native',
  };
}

export async function searchKeepCity(query: string): Promise<KeepResolvedLocation | null> {
  // Le geocoding texte d'Expo n'est disponible que sur Android/iOS. Sur Web,
  // l'utilisateur garde toujours la saisie manuelle ville + pays : aucune API
  // payante ni service de recherche tiers n'est nécessaire pour enregistrer.
  if (Platform.OS === 'web') return null;

  const matches = await Location.geocodeAsync(query);
  if (!matches.length) return null;
  const match = matches[0];
  const places = await Location.reverseGeocodeAsync(match);
  const place = places[0];
  const approx = roundKeepCoordinates(match.latitude, match.longitude);

  return {
    ...approx,
    city: place?.city || place?.subregion || place?.region || query.trim() || undefined,
    countryCode: place?.isoCountryCode?.toUpperCase() || undefined,
    source: 'native',
  };
}
