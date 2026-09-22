import { Platform } from 'react-native';

/**
 * Correctif remplissage automatique — écrans d'authentification Loki (web).
 *
 * Sur le web (react-native-web), les <input> générés par les TextInput
 * reçoivent le fond jaune du remplissage automatique de Chrome/Safari,
 * illisible sur le thème sombre Loki. On force ici la couleur de fond
 * (#1A1A2E) et la couleur du texte (#F5F5F7) de l'autofill.
 *
 * Source de vérité unique : appelée par les composants d'auth (formulaire de
 * connexion/inscription et modale de récupération) pour éviter toute
 * duplication de CSS. Sans effet hors web ; injectée une seule fois.
 */
const KEEP_AUTOFILL_STYLE_ID = 'keep-autofill-fix';

export function ensureAuthAutofillStyleInjected(): void {
  if (Platform.OS !== 'web') return;
  const doc = (globalThis as any)?.document;
  if (!doc?.head || doc.getElementById(KEEP_AUTOFILL_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = KEEP_AUTOFILL_STYLE_ID;
  style.textContent = `
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus,
    input:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 1000px #1A1A2E inset !important;
      box-shadow: 0 0 0 1000px #1A1A2E inset !important;
      -webkit-text-fill-color: #F5F5F7 !important;
      caret-color: #F5F5F7 !important;
      transition: background-color 9999s ease-in-out 0s !important;
    }
  `;
  doc.head.appendChild(style);
}
