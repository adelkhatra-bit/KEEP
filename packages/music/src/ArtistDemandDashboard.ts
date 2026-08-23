import { ReleaseRequestSummary } from './ReleaseRequestEngine';

/**
 * ArtistDemandDashboard -- MODULE RÉUTILISABLE (types uniquement).
 * UTILISABLE DANS : profil artiste (vue publique agrégée), Super Admin.
 * STATUT : not implemented -- dépend entièrement de ReleaseRequestEngine
 * (persisté, PLANNED) et ArtistClaim (vérification, PLANNED). Ceci décrit
 * uniquement la FORME des données qu'un futur écran consommerait, aucune
 * requête ni composant UI n'existe encore.
 */
export interface ArtistDemandSummary {
  artistProfileId: string;
  trackId: string;
  trackTitle: string;
  /** Nombre d'utilisateurs KEEP distincts ayant gardé ce morceau, toutes plateformes de demande confondues. */
  totalKeepers: number;
  /** Par plateforme demandée -- ex. { spotify: 76, apple_music: 54 } en pourcentage des totalKeepers. */
  demandByPlatformPercent: Record<string, number>;
  perPlatform: ReleaseRequestSummary[];
}
