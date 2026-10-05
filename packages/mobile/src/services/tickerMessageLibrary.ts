/**
 * Bibliothèque intelligente des bandelettes (Adel, 05/10/2026) : messages COMPOSÉS (ornement + intensité + ouverture + règle/défi/communauté/match + clôture),
 * des millions de combinaisons, jamais les mêmes à chaque passage. Les règles importantes du système y sont expliquées une par une.
 * Fonctions pures (aucune dépendance) : testables sans React Native. La mémoire des derniers messages affichés vit dans `tickerMemory.ts`.
 */
export type TickerKind = 'RULE' | 'CHALLENGE' | 'COMMUNITY' | 'MATCH';

const RULE_FACTS = [
  'ta musique gardée en public entre en story pendant 24 h',
  'une musique gardée en privé reste rien que pour toi',
  'GARDER coûte quelques FREE et PASSER est toujours gratuit',
  'le premier qui découvre un morceau reste crédité partout',
  'chaque reprise de ta musique fait grandir ta visibilité',
  'une musique en vente reste masquée jusqu’à l’achat',
  'l’écoute complète s’ouvre seulement après GARDER',
  'tes FREE se rechargent chaque mois',
  'ton quota de trouvailles se renouvelle chaque jour',
  'sans lien avec un membre, tu ne reçois ni story ni notification de sa part',
  'une story disparaît au bout de 24 h',
  'une vente lancée dans le chat dure 24 h',
  'ton style musical affine tes suggestions d’amis',
  'un message éphémère s’efface après 24 h',
  'tu peux effacer une conversation de ton côté',
  'une photo et une ville te font trouver plus vite',
  'tes réseaux reliés aident tes abonnés à te retrouver',
  'une musique mise en story allume ton cercle',
  'ton profil public montre uniquement tes musiques publiques',
  'un morceau déjà dans ta collection n’est jamais gardé deux fois',
  'tu choisis Public ou Privé à chaque GARDER',
  'ta session trie les morceaux entendus, prêts à garder',
  'le Battle se joue à l’oreille : vite et juste',
  'les Pépites sont des collections à écouter avant d’acheter',
  'un souci ? secoue ton téléphone pour le signaler',
  'un compte vérifié débloque les stories et les suggestions',
  'plus tu gardes, mieux Loki te connaît',
  'ta story la plus récente passe toujours en premier',
  'ton compte te sert à retrouver tes goûts sur tous tes appareils',
  'ton FREE ne baisse jamais quand tu écoutes ou que tu passes',
  'l’ordinateur se connecte en scannant un QR code depuis l’app',
  'les membres endormis passent à la suite dans ta ligne de stories',
  'une pépite achetée arrive directement dans ta collection',
  'ta collection est rangée automatiquement par styles',
  'un ami qui te suit voit tes stories sans rien faire',
  'ton mot de passe et ton e-mail protègent tout ton univers musical',
];

const CHALLENGE_FACTS = [
  'défie un ami en Battle ce soir',
  'bats ton record en Solo',
  'trouve la musique avant tout le monde',
  'fais 5 bonnes réponses d’affilée',
  'lance un Battle sur ton style préféré',
  'devine l’artiste en moins de 5 secondes',
  'garde ta première pépite de la journée',
  'mets une musique en story avant minuit',
  'retrouve un tube de ton enfance à l’oreille',
  'surprends un ami avec une musique qu’il ne connaît pas',
  'monte dans le classement Battle cette semaine',
  'découvre un artiste que personne n’a encore gardé',
  'invite un ami à rejoindre Loki',
  'garde trois morceaux de styles différents aujourd’hui',
  'écoute une musique que tu n’aurais jamais choisie',
  'propose une pépite à ton meilleur ami',
  'gagne un duel Battle sans une seule erreur',
  'repère le premier morceau de ta journée',
  'cherche l’intrus parmi quatre artistes',
  'termine une session complète sans en laisser un seul',
];

const COMMUNITY_FACTS = [
  'chaque reprise de ta musique peut te rapporter un abonné',
  'ta communauté grandit quand on te reprend',
  'un abonné de plus, c’est une story de plus à partager',
  'tes amis voient ta story dès qu’elle s’allume',
  'répondre à un ami fait vivre ta communauté',
  'suis un membre pour voir sa bulle sur ton profil',
  'ceux qui te reprennent apparaissent dans tes suggestions',
  'partage ta pépite : on se souviendra que tu l’as trouvée en premier',
  'les membres actifs passent devant dans ta ligne de stories',
  'dis merci à celui qui t’a repris',
  'une bonne musique rapproche des inconnus',
  'ton cercle s’allume dès que tu publies',
  'tes amis te retrouvent grâce à tes styles',
  'chaque membre a sa bulle, la tienne aussi',
  'montre ta photo : on se souvient mieux d’un visage',
  'tes abonnés voient d’abord ta musique la plus récente',
  'un profil complet inspire confiance',
  'tes reprises racontent ton goût aux autres',
];

const MATCH_FACTS = [
  'trouve les membres qui aiment les mêmes sons que toi',
  'tes genres favoris te rapprochent de nouveaux amis',
  'un match musical, c’est des artistes en commun',
  'les suggestions d’amis se basent sur ton style',
  'plus tu gardes, plus tes matchs deviennent précis',
  'un ami du même style, c’est des pépites à partager',
  'ton ADN musical se construit à chaque GARDER',
  'découvre qui écoute les mêmes artistes que toi',
  'ouvre les suggestions pour trouver ton prochain ami musique',
  'ton style compte : fais-le pour être bien associé',
  'tes artistes favoris disent beaucoup de toi',
  'un match solide, c’est trois genres en commun',
  'plus ton profil est complet, plus tes suggestions sont justes',
  'tes suggestions se mettent à jour à chaque nouveau GARDER',
  'cherche des membres de ta ville qui aiment ton style',
];

const OPENERS: Record<TickerKind, string[]> = {
  RULE: ['Astuce :', 'À savoir :', 'Bon à savoir :', 'Le saviez-vous ?', 'Règle d’or :', 'Rappel :', 'Info Loki :', 'En deux mots :', 'Petit rappel :', 'Bonne nouvelle :', 'Retiens ceci :', 'Pour info :', 'Détail utile :', 'Repère :', 'Ici,', 'Chez Loki,', 'Sur Loki,', 'Fonctionnement :', 'Le principe :', 'Simple :', 'Clair et net :', 'Note :', 'Mémo :', 'Dis-toi que'],
  CHALLENGE: ['Défi du jour :', 'Challenge :', 'À toi de jouer :', 'Relève ce défi :', 'Ton défi :', 'Mission :', 'Prêt ? Alors', 'Pari :', 'Objectif :', 'Cap sur ce défi :', 'Ce soir,', 'Aujourd’hui,', 'Et si tu osais :', 'Idée de défi :', 'Allez,', 'Hop,', 'Chiche :', 'Tente ça :', 'Ton prochain défi :', 'Défi :', 'En piste :', 'Encore un défi :', 'Top départ :', 'Va, '],
  COMMUNITY: ['Communauté :', 'Ensemble,', 'Entre membres,', 'Ta tribu :', 'Bonne vibe :', 'Ici,', 'Sur Loki,', 'Dans ta communauté,', 'Savais-tu que', 'Chez nous,', 'Esprit Loki :', 'Les amis d’abord :', 'Partage :', 'Retiens :', 'Petit plus :', 'Ça se passe ainsi :', 'À savoir :', 'Info communauté :', 'En clair :', 'Côté amis :', 'Entre nous :', 'Bonne idée :', 'Résumé :', 'Au fait,'],
  MATCH: ['Match :', 'Affinités :', 'Même style ?', 'Trouve ton binôme :', 'Rencontre :', 'Côté goûts :', 'Tes goûts :', 'Bon plan :', 'Suggestion :', 'Entre mélomanes,', 'Astuce match :', 'Pour tes matchs,', 'Chez Loki,', 'Idée :', 'À savoir :', 'En bref :', 'Petit rappel :', 'Info goûts :', 'Ça matche :', 'Là,', 'Bonne piste :', 'Conseil :', 'Regarde :', 'Pour trouver tes amis,'],
};

const CLOSERS = ['', '— garanti.', '— sans engagement.', '— à ta façon.', '— comme les grands.', '— juste ce qu’il faut.', '— vraiment.', '— on compte sur toi.', '— à partager.', '— une habitude à prendre.', '— bien vu.', '— c’est noté.', '— avec plaisir.', '— motus.', '— sans stress.', '— c’est la règle.', '— simple comme bonjour.', '— à toi de voir.', '— fais-en profiter tes amis.', '— on te l’avait dit.', '— c’est automatique.', '— rien à faire de plus.', '— et c’est gratuit.', '— promis.', '— à retenir.', '— bien joué d’avance.', '— facile.', '— vas-y, essaie.', '— c’est parti.', '— sans prise de tête.', '— tout le monde y gagne.', '— profites-en.', '— c’est le jeu.', '— rien de plus simple.', '— garde-le en tête.', '— tu verras.', '— on y croit.', '— et ça change tout.', '— voilà.'];
const INTENSIFIERS = ['', '', 'Franchement,', 'Vraiment,', 'Sérieusement,', 'En vrai,', 'Au passage,', 'Dès maintenant,', 'Dès aujourd’hui,', 'Tout de suite,', 'Pour de bon,', 'Tranquillement,'];
const ORNAMENTS = ['✦', '♪', '★', '◆', '♫', '✧', '●', '➤', '▶', '❖'];

const TYPE_FACTS: Record<TickerKind, string[]> = { RULE: RULE_FACTS, CHALLENGE: CHALLENGE_FACTS, COMMUNITY: COMMUNITY_FACTS, MATCH: MATCH_FACTS };
const TYPE_WEIGHTS: Array<[TickerKind, number]> = [['RULE', 45], ['CHALLENGE', 20], ['COMMUNITY', 20], ['MATCH', 15]];

// Générateur pseudo-aléatoire graine -> suite stable (mulberry32), graine dérivée d'un texte.
function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string): () => number {
  let a = hashSeed(seed) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashMessage(message: string): string { return hashSeed(message).toString(36); }

/** Nombre total de messages différents que la bibliothèque sait composer. */
export function tickerCombinationCount(): number {
  return (Object.keys(TYPE_FACTS) as TickerKind[]).reduce((sum, kind) => sum + (OPENERS[kind].length + INTENSIFIERS.filter(Boolean).length) * TYPE_FACTS[kind].length * CLOSERS.length * ORNAMENTS.length, 0);
}

export function composeTickerMessage(kind: TickerKind, seed: string): string {
  const next = rng(`${kind}:${seed}`);
  const pick = <T,>(list: T[]): T => list[Math.floor(next() * list.length)];
  const ornament = pick(ORNAMENTS);
  // Une seule introduction : soit une ouverture propre au type de message, soit une intensité (jamais les deux, ça sonnerait faux).
  const leads = [...OPENERS[kind], ...INTENSIFIERS.filter(Boolean)];
  const lead = pick(leads).trim();
  const fact = pick(TYPE_FACTS[kind]);
  const closer = pick(CLOSERS);
  const body = `${lead} ${fact}`;
  const sentence = body.charAt(0).toUpperCase() + body.slice(1);
  return `${ornament} ${sentence}${closer ? ` ${closer}` : ''}`.replace(/\s+/g, ' ').trim();
}

/**
 * Un lot de `count` messages TOUS différents, qui évite ceux déjà montrés récemment (`avoid` = empreintes).
 * Un lot mélange les règles (fréquentes), les défis, la communauté et les matchs.
 */
export function composeTickerBatch(count: number, seed: string, avoid: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const used = new Set<string>(avoid);
  const next = rng(`batch:${seed}`);
  let guard = 0;
  while (out.length < count && guard < count * 60) {
    guard += 1;
    let roll = next() * TYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let kind: TickerKind = 'RULE';
    for (const [candidate, weight] of TYPE_WEIGHTS) { roll -= weight; if (roll <= 0) { kind = candidate; break; } }
    const message = composeTickerMessage(kind, `${seed}:${guard}:${Math.floor(next() * 1e9)}`);
    const key = hashMessage(message);
    if (used.has(key)) continue;
    used.add(key);
    out.push(message);
  }
  return out;
}
