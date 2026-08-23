/**
 * ArtistClaim -- MODULE RÉUTILISABLE (cf. demande explicite du 23/08/2026 :
 * "le créateur pourrait revendiquer son profil KEEP").
 * UTILISABLE DANS : profil artiste public, ArtistDemandDashboard,
 * notifications ("1 842 personnes ont KEEP ce morceau").
 * STATUT : not implemented -- interface/types uniquement, AUCUNE
 * implémentation fournie ici (voir pourquoi ci-dessous).
 *
 * PAS D'IMPLÉMENTATION PAR DÉFAUT VOLONTAIREMENT (contrairement aux autres
 * modules de cette session, ex. InMemoryReleaseRequestEngine) : contrairement
 * à un compteur de demandes, une revendication d'identité mal vérifiée serait
 * un vrai risque (n'importe qui prétendant être l'artiste X, accès aux
 * statistiques de X, voire aux futures notifications). Fournir un
 * "InMemoryArtistClaimStore" qui approuverait par défaut créerait un piège
 * de sécurité si jamais branché tel quel par erreur -- mieux vaut une
 * interface vide qu'un faux sentiment de sécurité.
 *
 * VOIES DE VÉRIFICATION RÉELLEMENT VALABLES (à choisir/combiner lors de
 * l'implémentation, aucune n'est câblée) :
 *  1. OAuth du réseau source (ex. "Se connecter avec TikTok/Instagram") --
 *     preuve forte, l'utilisateur prouve qu'il contrôle le compte créateur
 *     lui-même. Nécessite que la plateforme expose ce login (à vérifier par
 *     réseau, voir PlatformAvailabilityResolver.ts pour le même type de
 *     limite selon les APIs disponibles).
 *  2. Vérification manuelle Super Admin (preuve type lien dans la bio du
 *     profil source pointant vers KEEP, ou email officiel du domaine de
 *     l'artiste) -- plus lent, mais ne dépend d'aucune API tierce.
 * Ne jamais approuver automatiquement sur simple déclaration ("je suis
 * l'artiste X") sans l'une de ces deux preuves.
 */
export type ArtistClaimStatus = 'pending' | 'verified' | 'rejected';

export interface ArtistClaimRequest {
  id: string;
  /** Profil artiste KEEP visé (auto-généré depuis une détection TikTok/etc., voir ReleaseRequestEngine). */
  artistProfileId: string;
  claimantUserId: string;
  status: ArtistClaimStatus;
  /** 'oauth_tiktok' | 'oauth_instagram' | 'manual_admin_review' | ... -- jamais vide pour un claim 'verified'. */
  verificationMethod?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface ArtistClaimStore {
  submitClaim(artistProfileId: string, claimantUserId: string): Promise<ArtistClaimRequest>;
  getClaimForArtist(artistProfileId: string): Promise<ArtistClaimRequest | null>;
  /** Réservé Super Admin -- voir garde-fous ci-dessus, aucune approbation automatique. */
  reviewClaim(claimId: string, decision: 'verified' | 'rejected', verificationMethod?: string): Promise<ArtistClaimRequest>;
}
