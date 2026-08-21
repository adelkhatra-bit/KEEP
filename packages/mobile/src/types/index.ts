/**
 * Types locaux à l'app mobile (profil affiché, etc.).
 * Les types musicaux (morceau, playlist, recommandation) viennent de
 * @keep/music — pas de duplication ici (cf. règle anti-doublon).
 */
export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  bio: string;
  playlistCount: number;
  followerCount: number;
}
