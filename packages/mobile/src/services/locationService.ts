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

// ~1 km selon la latitude : assez précis pour la découverte locale, mais Loki
// ne conserve jamais la position GPS exacte dans le profil.
export function roundKeepCoordinates(latitude: number, longitude: number): KeepApproximateCoordinates {
  return {
    lat: Math.round(latitude * 100) / 100,
    lng: Math.round(longitude * 100) / 100,
  };
}

async function getBrowserCoordinates(): Promise<{ latitude: number; longitude: number }> {
  const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geolocation) throw new Error('web_geolocation_unavailable');

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      (error) => {
        if (error.code === 1) reject(new KeepLocationPermissionError());
        else reject(new Error(`web_geolocation_${error.code}_${error.message || 'unavailable'}`));
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 60_000,
      },
    );
  });
}

async function reverseGeocodeBigDataCloud(latitude: number, longitude: number): Promise<{ city?: string; countryCode?: string }> {
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

async function reverseGeocodeNominatim(latitude: number, longitude: number): Promise<{ city?: string; countryCode?: string }> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '10');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'fr');

  const response = await fetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`web_reverse_geocode_fallback_${response.status}`);
  const data = await response.json() as any;
  const address = data?.address || {};
  return {
    city: address.city || address.town || address.village || address.municipality || address.county || undefined,
    countryCode: typeof address.country_code === 'string' ? address.country_code.toUpperCase() : undefined,
  };
}

async function reverseGeocodeWeb(latitude: number, longitude: number): Promise<{ city?: string; countryCode?: string }> {
  try {
    return await reverseGeocodeBigDataCloud(latitude, longitude);
  } catch {
    try {
      return await reverseGeocodeNominatim(latitude, longitude);
    } catch {
      // La position GPS reste exploitable pour Découvertes même si les deux
      // services gratuits de ville/pays sont momentanément indisponibles.
      return {};
    }
  }
}

async function geocodeWebCity(query: string): Promise<KeepResolvedLocation | null> {
  const clean = query.trim();
  if (!clean) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', clean);
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'fr');

  const response = await fetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`web_city_geocode_${response.status}`);
  const rows = await response.json() as any[];
  const match = rows?.[0];
  const latitude = Number(match?.lat);
  const longitude = Number(match?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const address = match?.address || {};
  const approx = roundKeepCoordinates(latitude, longitude);
  return {
    ...approx,
    city: address.city || address.town || address.village || address.municipality || clean,
    countryCode: typeof address.country_code === 'string' ? address.country_code.toUpperCase() : undefined,
    source: 'web-free',
  };
}

export async function getCurrentKeepLocation(): Promise<KeepResolvedLocation> {
  // Sur le Web, utiliser directement l'API standard du navigateur. Le wrapper
  // expo-location ajoutait une seconde couche de permission qui pouvait échouer
  // alors que navigator.geolocation avait déjà reçu l'autorisation.
  if (Platform.OS === 'web') {
    const position = await getBrowserCoordinates();
    const approx = roundKeepCoordinates(position.latitude, position.longitude);
    const place = await reverseGeocodeWeb(position.latitude, position.longitude);
    return { ...approx, ...place, source: 'web-free' };
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new KeepLocationPermissionError();

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const approx = roundKeepCoordinates(latitude, longitude);

  // iOS/Android : le GPS doit rester utilisable même si le reverse geocoding
  // natif échoue momentanément. Dans ce cas on conserve les coordonnées
  // approximatives et l'utilisateur peut compléter ville/pays manuellement.
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    const place = places[0];
    return {
      ...approx,
      city: place?.city || place?.subregion || place?.region || undefined,
      countryCode: place?.isoCountryCode?.toUpperCase() || undefined,
      source: 'native',
    };
  } catch {
    return { ...approx, source: 'native' };
  }
}

export async function searchKeepCity(query: string): Promise<KeepResolvedLocation | null> {
  if (Platform.OS === 'web') {
    try {
      return await geocodeWebCity(query);
    } catch {
      return null;
    }
  }

  const matches = await Location.geocodeAsync(query);
  if (!matches.length) return null;
  const match = matches[0];
  const approx = roundKeepCoordinates(match.latitude, match.longitude);

  try {
    const places = await Location.reverseGeocodeAsync(match);
    const place = places[0];
    return {
      ...approx,
      city: place?.city || place?.subregion || place?.region || query.trim() || undefined,
      countryCode: place?.isoCountryCode?.toUpperCase() || undefined,
      source: 'native',
    };
  } catch {
    return { ...approx, city: query.trim() || undefined, source: 'native' };
  }
}
