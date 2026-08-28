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

const webCityCache = new Map<string, KeepResolvedLocation | null>();

async function geocodeWeb(query: string): Promise<KeepResolvedLocation | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  if (webCityCache.has(normalized)) return webCityCache.get(normalized) ?? null;

  // Recherche explicite uniquement. Nominatim/OSM est utilisé comme fallback
  // sans clé afin que la PWA puisse transformer une ville PUBLIQUE en centre de
  // ville approximatif. Aucune position GPS privée d'un autre utilisateur n'est
  // créée ou enregistrée ici.
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'fr');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`web_geocode_${response.status}`);
  const rows = await response.json() as any[];
  const first = rows?.[0];
  if (!first) {
    webCityCache.set(normalized, null);
    return null;
  }

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    webCityCache.set(normalized, null);
    return null;
  }

  const approx = roundKeepCoordinates(latitude, longitude);
  const address = first.address || {};
  const result: KeepResolvedLocation = {
    ...approx,
    city: address.city || address.town || address.village || address.municipality || query.trim(),
    countryCode: typeof address.country_code === 'string' ? address.country_code.toUpperCase() : undefined,
    source: 'web-free',
  };
  webCityCache.set(normalized, result);
  return result;
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
  if (Platform.OS === 'web') return geocodeWeb(query);

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
