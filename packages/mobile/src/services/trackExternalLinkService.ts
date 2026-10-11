import type { CanonicalTrack } from '@keep/music';

export type TrackExternalDestination = {
  url: string;
  label: string;
  provider: 'SPOTIFY' | 'APPLE MUSIC' | 'DEEZER' | 'YOUTUBE' | 'PLATEFORMES';
  exact: boolean;
};

function httpUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return null;
  try { return new URL(value.trim()); } catch { return null; }
}
function cleanHost(url: URL): string { return url.hostname.toLowerCase().replace(/^www\./, ''); }

function exactSpotify(track: CanonicalTrack): TrackExternalDestination | null {
  const url = httpUrl(track.externalUrls?.spotify);
  if (!url || cleanHost(url) !== 'open.spotify.com') return null;
  const match = url.pathname.match(/\/track\/([A-Za-z0-9]+)/);
  if (!match) return null;
  const expected = String(track.providerIds?.spotify || '').trim();
  if (expected && match[1] !== expected) return null;
  return { url: url.toString(), label: 'ÉCOUTER SUR SPOTIFY', provider: 'SPOTIFY', exact: true };
}
function exactApple(track: CanonicalTrack): TrackExternalDestination | null {
  const url = httpUrl(track.externalUrls?.appleMusic);
  if (!url || cleanHost(url) !== 'music.apple.com') return null;
  const expected = String(track.providerIds?.appleMusic || '').trim();
  const queryId = url.searchParams.get('i') || '';
  const parts = url.pathname.split('/').filter(Boolean);
  const lastPathId = parts[parts.length - 1] || '';
  if (expected) {
    if (queryId !== expected && lastPathId !== expected) return null;
  } else if (!queryId) return null;
  return { url: url.toString(), label: 'ÉCOUTER SUR APPLE MUSIC', provider: 'APPLE MUSIC', exact: true };
}
function exactDeezer(track: CanonicalTrack): TrackExternalDestination | null {
  const url = httpUrl(track.externalUrls?.deezer);
  if (!url || !cleanHost(url).endsWith('deezer.com')) return null;
  const match = url.pathname.match(/\/track\/(\d+)/);
  if (!match) return null;
  const expected = String(track.providerIds?.deezer || '').trim();
  if (expected && match[1] !== expected) return null;
  return { url: url.toString(), label: 'ÉCOUTER SUR DEEZER', provider: 'DEEZER', exact: true };
}
function exactYoutube(track: CanonicalTrack): TrackExternalDestination | null {
  const url = httpUrl(track.externalUrls?.youtube);
  if (!url) return null;
  const host = cleanHost(url);
  let videoId = '';
  if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || '';
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) videoId = url.searchParams.get('v') || '';
  if (!videoId) return null;
  const expected = String(track.providerIds?.youtubeMusic || track.providerIds?.youtube || '').trim();
  if (expected && videoId !== expected) return null;
  return { url: url.toString(), label: 'ÉCOUTER SUR YOUTUBE', provider: 'YOUTUBE', exact: true };
}

export function resolveTrackExternalDestination(track: CanonicalTrack): TrackExternalDestination | null {
  const exact = exactSpotify(track) || exactApple(track) || exactDeezer(track) || exactYoutube(track);
  if (exact) return exact;
  const universal = httpUrl(track.externalUrls?.universal);
  if (universal) return { url: universal.toString(), label: 'CHOISIR UNE PLATEFORME', provider: 'PLATEFORMES', exact: false };
  const youtubeSearch = httpUrl(track.externalUrls?.youtubeSearch);
  if (youtubeSearch) return { url: youtubeSearch.toString(), label: 'CHERCHER CE TITRE SUR YOUTUBE', provider: 'YOUTUBE', exact: false };
  return null;
}
