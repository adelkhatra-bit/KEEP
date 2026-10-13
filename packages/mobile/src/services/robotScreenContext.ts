/**
 * Contexte d'écran du robot Lia (Lot 6, 12/10/2026) : le robot ne connaissait que le nom de la route.
 * Chaque écran peut maintenant déclarer {route, état, actions possibles} ; le robot en tire des conseils
 * par RÈGLES PURES (aucun LLM), chacune avec une action « un clic = navigation avec paramètres ».
 *
 * Module sans import natif : testable. Réutilise reportSurface.ts pour la fenêtre posée par-dessus (story, swipe…).
 * Respect du silence : ce module ne parle jamais, il fournit seulement texte + actions ; robotSay() applique
 * robotQuietService (silence 2 h), le jeu en cours et la fréquence.
 */
import { currentReportSurface } from './reportSurface';
import { sectionOfRoute, type RobotSection } from './robotSectionScenario';
import type { RobotAction } from './robotHelp';

export type RobotScreenState = {
  /** Profil affiché = celui de l'utilisateur. */
  isOwnerProfile?: boolean;
  /** Nombre d'offres actives de la boutique affichée. */
  offerCount?: number;
  followers?: number;
  /** Seuil d'abonnés pour vendre (réglage Super Admin, 100 par défaut). */
  saleThreshold?: number;
  /** Vente sans seuil autorisée (réglage Super Admin). */
  freeWithoutThreshold?: boolean;
  /** Solde FREE connu (null/undefined = inconnu : aucune règle FREE ne se déclenche). */
  freeBalance?: number | null;
  /** Morceaux en attente de tri (Mes Sessions). */
  pendingTracks?: number;
};

export type RobotScreenContext = {
  route: string;
  section: RobotSection;
  /** Fenêtre posée par-dessus l'écran (story, swipe…), si elle s'est déclarée via reportSurface. */
  surface: string | null;
  state: RobotScreenState;
  /** Actions possibles ici (clés), déduites des règles : utile aux tests et au débogage. */
  actions: RobotAction[];
};

// Les actions « un clic » : route + params directement utilisables par navigationRef.navigate().
export const CONTEXT_ACTIONS = {
  CREATE_SHOP: { key: 'SELL', label: '🛍️ Créer ma boutique', route: 'PlaylistSale' },
  SHARE_PROFILE: { key: 'SHARE', label: '↗ Partager mon profil', route: 'Main', params: { screen: 'Profile' } },
  RECHARGE: { key: 'RECHARGE', label: '⚡ Recharger', route: 'Offers', params: { sourceFeature: 'ROBOT_NO_FREE' } },
  SOLO: { key: 'SOLO', label: '🎮 Faire un Solo', route: 'Main', params: { screen: 'Parties', params: { openBattle: true, source: 'ROBOT' } } },
  SORT: { key: 'SORT', label: '🗂️ Les trier', route: 'SessionHistory' },
} as const satisfies Record<string, RobotAction>;

export type ContextRule = { id: string; text: string; actions: RobotAction[] };

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/**
 * Règles pures, par ordre de priorité. Un état inconnu (undefined/null) ne déclenche JAMAIS une règle :
 * le robot ne devine pas.
 */
export function contextRules(ctx: Pick<RobotScreenContext, 'section' | 'state'>): ContextRule[] {
  const { section, state } = ctx;
  const rules: ContextRule[] = [];

  if (state.freeBalance != null && state.freeBalance <= 0) {
    rules.push({ id: 'FREE_ZERO', text: 'Tu n’as plus de FREE. Recharge, ou fais un Solo pour en gagner.', actions: [CONTEXT_ACTIONS.RECHARGE, CONTEXT_ACTIONS.SOLO] });
  }

  if (section === 'PROFILE' && state.isOwnerProfile && state.offerCount === 0) {
    const followers = Math.max(0, state.followers ?? 0);
    const threshold = Math.max(0, state.saleThreshold ?? 100);
    const unlocked = Boolean(state.freeWithoutThreshold) || followers >= threshold;
    if (state.followers != null) {
      if (unlocked) {
        rules.push({ id: 'SHOP_EMPTY', text: 'Ta boutique est vide. Crée ta boutique : une collection suffit.', actions: [CONTEXT_ACTIONS.CREATE_SHOP] });
      } else {
        const missing = threshold - followers;
        rules.push({ id: 'SHOP_LOCKED', text: `Il te manque ${missing} abonné${plural(missing, '', 's')} pour ouvrir ta boutique.`, actions: [CONTEXT_ACTIONS.SHARE_PROFILE] });
      }
    }
  }

  if (typeof state.pendingTracks === 'number' && state.pendingTracks > 0) {
    const n = state.pendingTracks;
    rules.push({ id: 'PENDING_TRACKS', text: `${n} morceau${plural(n, '', 'x')} t’attend${plural(n, '', 'ent')}. Trie-${plural(n, 'le', 'les')} !`, actions: [CONTEXT_ACTIONS.SORT] });
  }

  return rules;
}

// ── Déclaration d'état par les écrans ──
let published: Record<string, RobotScreenState> = {};

/** Un écran déclare (ou met à jour) son état ; renvoie la fonction qui le retire au démontage. */
export function publishRobotScreenState(source: string, state: RobotScreenState): () => void {
  published = { ...published, [source]: state };
  return () => {
    const { [source]: _removed, ...rest } = published;
    published = rest;
  };
}

function mergedState(extra: RobotScreenState = {}): RobotScreenState {
  const merged: RobotScreenState = {};
  for (const part of [...Object.values(published), extra]) {
    for (const [key, value] of Object.entries(part)) if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/** Contexte complet de l'écran courant. `extra` permet au service d'ajouter ce qu'il lit dans les stores. */
export function buildRobotScreenContext(routeName: string | null | undefined, extra: RobotScreenState = {}): RobotScreenContext {
  const route = String(routeName ?? '');
  const section = sectionOfRoute(route);
  const state = mergedState(extra);
  const surface = currentReportSurface()?.label ?? null;
  const rules = contextRules({ section, state });
  const actions: RobotAction[] = [];
  for (const rule of rules) for (const action of rule.actions) if (!actions.some((a) => a.key === action.key)) actions.push(action);
  return { route, section, surface, state, actions };
}

export function __resetRobotScreenContextForTests(): void { published = {}; }
