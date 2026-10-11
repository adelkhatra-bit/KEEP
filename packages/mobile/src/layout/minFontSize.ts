import { Platform, StyleSheet, Text, Dimensions } from 'react-native';
import { MIN_READABLE_FONT_SIZE, PHONE_MAX_WIDTH } from './layoutMode';

/**
 * Textes >= 11 px sur tablette et ordinateur (Adel, 11/10/2026 : libellés d'onglets
 * à 10 px, TCHAT à 8 px, LOKI à 6,5 px). Un seul garde-fou central au lieu de
 * modifier 487 styles : tout <Text> web plus petit que 11 px est relevé à 11 px dès
 * que la fenêtre dépasse le téléphone. Le téléphone (< 900 px, design verrouillé)
 * n'est jamais touché.
 */
let installed = false;
export function installMinReadableFontSize() {
  if (installed || Platform.OS !== 'web') return;
  const anyText = Text as any;
  if (typeof anyText?.render !== 'function') return;
  installed = true;
  const original = anyText.render;
  anyText.render = function patchedRender(props: any, ref: any) {
    if (props && Dimensions.get('window').width >= PHONE_MAX_WIDTH) {
      const flat = StyleSheet.flatten(props.style) as any;
      const size = flat?.fontSize;
      if (typeof size === 'number' && size > 0 && size < MIN_READABLE_FONT_SIZE) {
        return original.call(this, { ...props, style: [props.style, { fontSize: MIN_READABLE_FONT_SIZE }] }, ref);
      }
    }
    return original.call(this, props, ref);
  };
}
