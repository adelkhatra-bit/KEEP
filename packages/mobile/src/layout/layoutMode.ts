import { Platform, useWindowDimensions } from 'react-native';
import { layoutModeFor, isCompactDesktopWidth } from './layoutModeCore';

export * from './layoutModeCore';

export function hasFinePointer(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try { return window.matchMedia('(pointer: fine)').matches || window.matchMedia('(any-pointer: fine)').matches; } catch { return false; }
}

export function useLayoutMode() {
  const { width, height } = useWindowDimensions();
  const mode = layoutModeFor(width, hasFinePointer(), Platform.OS === 'web');
  return {
    mode,
    width,
    height,
    isPhone: mode === 'phone',
    isTablet: mode === 'tablet',
    isDesktop: mode === 'desktop',
    /** bureau, fenêtre étroite (640–1023 px) : barre latérale compacte, une colonne. */
    isCompactDesktop: mode === 'desktop' && isCompactDesktopWidth(width),
    /** bureau, fenêtre large (>= 1024 px) : barre latérale complète, mises en page en colonnes. */
    isWideDesktop: mode === 'desktop' && !isCompactDesktopWidth(width),
    /** tablette ou bureau : tout ce qui n'est pas le téléphone verrouillé. */
    isWide: mode !== 'phone',
  };
}
