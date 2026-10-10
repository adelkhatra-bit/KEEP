// Séparation du DESIGN téléphone / ordinateur (Adel, 10/10/2026, IDEA-206) : les fonctions sont identiques, seul le design diffère.
// UNE seule source des mesures propres à l'appareil (aucun écran dupliqué, aucun fichier .web/.native : contrat platform-parity).
// Le zoom global reste à 1 sur PC : la largeur est exploitée par les layouts (grilles/colonnes), jamais par une version mobile agrandie.
import { useWindowDimensions } from 'react-native';

export type DesignProfileKind = 'mobile' | 'desktop' | 'wide';

export type DesignProfile = {
  kind: DesignProfileKind;
  /** Zoom CSS global de l'application (web seulement ; 1 = aucune mise à l'échelle). */
  pageZoom: number;
  /** Échelle du robot (bouton Tchat/robot) en plus du zoom global. */
  botScale: number;
};

export const DESKTOP_MIN_WIDTH = 1100;
export const WIDE_MIN_WIDTH = 1700;

export const DESIGN_PROFILES: Record<DesignProfileKind, DesignProfile> = {
  mobile: { kind: 'mobile', pageZoom: 1, botScale: 1.15 },
  desktop: { kind: 'desktop', pageZoom: 1, botScale: 1.2 },
  wide: { kind: 'wide', pageZoom: 1, botScale: 1.2 },
};

export function designProfileForWidth(width: number): DesignProfile {
  if (width >= WIDE_MIN_WIDTH) return DESIGN_PROFILES.wide;
  if (width >= DESKTOP_MIN_WIDTH) return DESIGN_PROFILES.desktop;
  return DESIGN_PROFILES.mobile;
}

export function useDesignProfile(): DesignProfile {
  return designProfileForWidth(useWindowDimensions().width);
}
