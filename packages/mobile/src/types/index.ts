export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  isRecognized: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  songCount: number;
  cover: string;
  isSmartPlaylist: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  bio: string;
  playlistCount: number;
  followerCount: number;
}
