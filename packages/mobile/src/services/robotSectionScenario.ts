// Scénario du robot par rubrique (Adel, 10/10/2026, IDEA-205) : « chaque fois qu'il est sur une rubrique, je le secoue, il connaît toute la
// rubrique et me conseille ; sur mon profil il me propose une soirée, une playlist… ». Module PUR, ton jeune, jamais « prise de tête ».
import { SHAKE_ACTIONS, type HelpActionKey, type RobotAction } from './robotHelp';

export type RobotSection = 'PULSE' | 'DISCOVER' | 'PLAYLISTS' | 'PARTIES' | 'PROFILE' | 'OTHER';

const SECTION_BY_ROUTE: Record<string, RobotSection> = {
  Listen: 'PULSE', Discover: 'DISCOVER', MyMusic: 'PLAYLISTS', Parties: 'PARTIES', Profile: 'PROFILE',
};

export function sectionOfRoute(routeName?: string | null): RobotSection {
  return SECTION_BY_ROUTE[String(routeName ?? '')] ?? 'OTHER';
}

type Scenario = {
  /** Phrase d'ouverture : elle dit où l'on est et ce qu'on peut y faire (une idée par fonction de la rubrique). */
  intro: string;
  /** Propositions dans l'ordre : d'abord ce qui fait avancer dans la rubrique, puis les rubriques voisines. */
  keys: HelpActionKey[];
  /** Conseils détaillés, un par fonction de la rubrique (le robot en dit un à chaque fois, un autre la fois suivante). */
  tips: string[];
};

export const SECTION_SCENARIOS: Record<Exclude<RobotSection, 'OTHER'>, Scenario> = {
  PULSE: {
    intro: 'Ici c’est Loki Pulse : tu touches une bulle pour écouter, tu gardes ce qui te plaît, et le gros bouton rond trouve n’importe quel son.',
    keys: ['PLAYLISTS', 'SOLO', 'STORY'],
    tips: [
      'Le gros bouton rond écoute autour de toi et trouve le morceau. T’inquiète, un son raté ne te coûte rien.',
      'Une bulle te plaît ? Touche-la, écoute, puis garde-la : elle file direct dans ta musique.',
      'Tu veux que tes potes voient ce que t’écoutes ? Mets-le en story, ça dure 24 h.',
    ],
  },
  DISCOVER: {
    intro: 'Ici tu trouves du monde : choisis une distance, touche RECHERCHER et vois qui écoute la même zik que toi, ou les soirées qui bougent.',
    keys: ['SEARCH', 'PLAYLISTS', 'COMMUNITY'],
    tips: [
      'Règle la distance (5 km à Monde), puis touche RECHERCHER : aucun profil n’apparaît tant que tu n’as pas lancé la recherche.',
      'Tu connais déjà un pseudo ? Tape-le dans la barre du haut, puis abonne-toi.',
      'Onglet ÉVÉNEMENTS : les soirées autour de toi. Touche-en une pour voir le détail et t’y inscrire.',
    ],
  },
  PLAYLISTS: {
    intro: 'Ici c’est toute ta musique : écouter tes morceaux, choisir ce qui est visible, trier par style ou artiste, et connecter Spotify ou Apple Music.',
    keys: ['SOLO', 'COMMUNITY', 'PULSE'],
    tips: [
      '« Écouter mes morceaux » lance toute ta zik d’un coup, sans te prendre la tête.',
      '« Choisir ce qui est visible » : tu décides ce que les autres voient, Public ou Privé. Rien ne change sans que tu le valides.',
      'Tu as une belle playlist ? Va dans Soirées, crée une soirée et mets-la dessus : ça claque pour l’ambiance.',
    ],
  },
  PARTIES: {
    intro: 'Ici ce sont les soirées et le Battle : Créer une soirée, voir Mes soirées, répondre aux Invitations, ou te mesurer en Solo.',
    keys: ['PLAYLISTS', 'SOLO', 'COMMUNITY'],
    tips: [
      'Pour une soirée, touche Créer : nom, date, lieu, et ta playlist pour l’ambiance. Tu invites ensuite tes potes.',
      'Le Solo, c’est écouter, deviner, gagner des FREE. Tu t’arrêtes quand tu veux.',
      'Des Invitations t’attendent ? Elles sont dans l’onglet du même nom, un tap pour accepter ou refuser.',
    ],
  },
  PROFILE: {
    intro: 'Ici c’est ton profil : tes abonnés, ta boutique, ta story. Et si tu me dis oui, je te propose direct une soirée ou une playlist à partager.',
    keys: ['PLAYLISTS', 'SOLO', 'STORY'],
    tips: [
      'Envie de remplir ton profil ? Crée une playlist, puis monte-la en soirée : tes abonnés la verront.',
      'Ta story : touche ta photo en haut puis ＋. Elle reste 24 h, avec le chrono.',
      'Tu veux Loki sur ton ordi ? Va dans les réglages : « Partager sur mon PC », 24 h, QR à scanner.',
    ],
  },
};

// Action de menu qui renvoie vers la rubrique où l'on est déjà : inutile de la proposer.
const OWN_ACTION_BY_SECTION: Partial<Record<RobotSection, HelpActionKey>> = { PULSE: 'PULSE', DISCOVER: 'SEARCH', PLAYLISTS: 'PLAYLISTS', PARTIES: 'PARTIES', PROFILE: 'COMMUNITY' };
export const MAX_ROBOT_MENU_ACTIONS = 9;

/** Conseil de rubrique (SECTION_SCENARIOS) : un différent à chaque secousse successive. */
export function sectionTip(routeName: string | null | undefined, index: number): string | null {
  const section = sectionOfRoute(routeName);
  if (section === 'OTHER') return null;
  const tips = SECTION_SCENARIOS[section].tips;
  return tips[Math.abs(Math.floor(index)) % tips.length];
}

export type ScenarioOptions = {
  /** Règles déclenchées par le contexte d'écran (robotScreenContext.contextRules) : passées déjà calculées. */
  rules?: Array<{ id: string; text: string; actions: RobotAction[] }>;
  /** Nombre de secousses déjà faites récemment sur cette rubrique (0 = première). */
  shakeCount?: number;
};

/**
 * Message et propositions du robot quand on le secoue (ou qu'on le touche 5 fois) sur une rubrique donnée.
 * Priorité : 1) conseil contextuel (règles pures) ; 2) conseil de rubrique à partir de la 2e secousse ; 3) question courte.
 * Les actions contextuelles passent en premier (un clic = navigation), puis le menu général sans la rubrique actuelle ; « Un souci » reste dernier.
 */
export function scenarioForRoute(routeName: string | null | undefined, username: string, seed = 0, options: ScenarioOptions = {}): { text: string; actions: RobotAction[] } {
  const name = String(username || '').trim().replace(/^@+/, '');
  const compactText = `Qu'est-ce que je peux faire pour toi${name ? `, ${name}` : ''} ?`;
  const rules = options.rules ?? [];
  const section = sectionOfRoute(routeName);
  const contextual: RobotAction[] = [];
  for (const rule of rules) for (const action of rule.actions) if (!contextual.some((a) => a.key === action.key)) contextual.push(action);
  const own = OWN_ACTION_BY_SECTION[section];
  const base = SHAKE_ACTIONS.filter((a) => a.key !== own && !contextual.some((c) => c.key === a.key));
  const report = base.filter((a) => a.key === 'REPORT');
  const menu = base.filter((a) => a.key !== 'REPORT');
  const room = Math.max(0, MAX_ROBOT_MENU_ACTIONS - contextual.length - report.length);
  const actions = [...contextual, ...menu.slice(0, room), ...report];
  const tip = (options.shakeCount ?? 0) >= 1 ? sectionTip(routeName, (options.shakeCount ?? 1) - 1) : null;
  const text = rules[0]?.text ?? tip ?? compactText;
  void seed;
  return { text, actions };
}
