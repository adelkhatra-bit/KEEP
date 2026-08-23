/**
 * AIOriginDetector -- MODULE RÉUTILISABLE (voir demande explicite du
 * 23/08/2026 : "chaque fois que tu construis un module réellement
 * réutilisable, dis-le-moi").
 * UTILISABLE DANS : fiche morceau (Découvrir/TikTok), profil artiste, Super Admin.
 * STATUT : experimental -- AUCUN signal fiable n'est branché (voir plus bas).
 *
 * RÈGLE NON NÉGOCIABLE (cf. demande explicite du 23/08/2026) : ne JAMAIS
 * déduire "créé par IA" du simple fait qu'un morceau est absent de
 * Spotify/Apple Music -- une absence de catalogue n'est pas une preuve
 * d'origine. Sans signal réel, le verdict est TOUJOURS 'unknown', jamais une
 * suggestion inventée qui prendrait l'apparence d'un fait.
 *
 * STATUT HONNÊTE : aucun fournisseur d'analyse audio "généré par IA vs
 * humain" fiable n'a été identifié/branché à ce jour. `UnknownAIOriginDetector`
 * ci-dessous est l'implémentation PAR DÉFAUT et actuellement UNIQUE -- elle
 * répond toujours 'unknown', confidence 0. Le jour où un fournisseur
 * suffisamment fiable existe (à évaluer au cas par cas -- precision/recall
 * publiés, faux positifs sur de la musique humaine connue), on branche une
 * VRAIE implémentation ici sans changer l'interface appelante.
 */
export type AIOriginVerdict = 'likely_ai' | 'likely_human' | 'unknown';

export interface AIOriginResult {
  verdict: AIOriginVerdict;
  /** 0-1. Toujours 0 tant qu'aucun signal réel n'existe (voir UnknownAIOriginDetector). */
  confidence: number;
  /** Nom du fournisseur/modèle ayant produit ce verdict -- absent si 'unknown' par défaut (aucun signal interrogé). */
  source?: string;
}

export interface AIOriginDetector {
  analyze(track: { title: string; artist: string; audioSampleUrl?: string }): Promise<AIOriginResult>;
}

/** Implémentation par défaut -- voir STATUT HONNÊTE ci-dessus. Ne fait AUCUN appel réseau, ne devine jamais. */
export class UnknownAIOriginDetector implements AIOriginDetector {
  async analyze(): Promise<AIOriginResult> {
    return { verdict: 'unknown', confidence: 0 };
  }
}
