import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SocialLink } from '../types';

/**
 * Couleurs de marque réelles (demande explicite du 26/08/2026 -- "utilise les
 * couleurs des différents réseaux/plateformes"). Une seule source pour tous
 * les écrans (Profil, Services musicaux) -- jamais une palette générique
 * blanche/grise réinventée ailleurs. Couleur officielle unique par marque
 * (pas de dégradé Instagram complet -- complexité inutile pour une icône de
 * cette taille, mais couleur reconnaissable réelle).
 */
export const SOCIAL_BRAND_COLORS: Record<string, string> = {
  instagram: '#E4405F',
  youtube: '#FF0000',
  x: '#000000',
  facebook: '#1877F2',
  snapchat: '#FFFC00',
  tiktok: '#25F4EE',
  spotify: '#1DB954',
  apple_music: '#FA243C',
  deezer: '#A238FF',
  youtube_music: '#FF0000',
  soundcloud: '#FF5500',
  tidal: '#000000',
  website: '#B4A9C2',
};

export default function SocialPlatformIcon({ platform, size = 22, color = '#FFFFFF' }: { platform: SocialLink['platform']; size?: number; color?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24' } as const;
  switch (platform) {
    case 'instagram':
      return <Svg {...common}><Rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke={color} strokeWidth="2"/><Circle cx="12" cy="12" r="4" fill="none" stroke={color} strokeWidth="2"/><Circle cx="17.5" cy="6.5" r="1.2" fill={color}/></Svg>;
    case 'youtube':
      return <Svg {...common}><Rect x="2.5" y="6" width="19" height="12" rx="4" fill="none" stroke={color} strokeWidth="2"/><Path d="M10 9l6 3-6 3z" fill={color}/></Svg>;
    case 'x':
      return <Svg {...common}><Path d="M5 4l14 16M19 4L5 20" stroke={color} strokeWidth="2.3" strokeLinecap="round"/></Svg>;
    case 'facebook':
      return <Svg {...common}><Path d="M14.5 4h3V1h-3C10.9 1 9 3.1 9 6.4V9H6v3h3v11h4V12h3.5l.5-3H13V6.8c0-1.8.6-2.8 1.5-2.8z" fill={color}/></Svg>;
    case 'snapchat':
      return <Svg {...common}><Path d="M12 3c-3 0-5 2.2-5 5.4 0 1-.1 1.9-.5 2.6-.7 1.1-1.8 1.2-2.5 1.4.3 1 .9 1.8 2.2 2.2.2 1.4 1.3 2 2.8 1.9.8 1.1 1.8 1.6 3 1.6s2.2-.5 3-1.6c1.5.1 2.6-.5 2.8-1.9 1.3-.4 1.9-1.2 2.2-2.2-.7-.2-1.8-.3-2.5-1.4-.4-.7-.5-1.6-.5-2.6C17 5.2 15 3 12 3z" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/></Svg>;
    case 'tiktok':
      return <Svg {...common}><Path d="M14 3v10.1a3.6 3.6 0 11-3-3.55V13a1.6 1.6 0 102 1.55V3h1z" fill={color}/><Path d="M14 3c.6 2.2 2 3.5 4 3.9v3c-2-.2-3.5-.9-4.5-2.1" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/></Svg>;
    case 'website':
      return <Svg {...common}><Circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2"/><Path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke={color} strokeWidth="1.6"/></Svg>;
    default:
      return <Svg {...common}><Circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2"/></Svg>;
  }
}
