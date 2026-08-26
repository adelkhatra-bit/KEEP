import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';

export const LOCAL_GUEST_ID_KEY = '@keep/local-guest-id-v1';
const LOCAL_GUEST_PROFILE_KEY = '@keep/local-guest-profile-v1';
const PENDING_GUEST_UPGRADE_KEY = '@keep/pending-guest-upgrade-v1';

export type PendingGuestUpgrade = {
  email: string;
  profile: User;
  createdAt: string;
};

export async function loadLocalGuestProfile(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_GUEST_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    return parsed?.id && parsed?.username ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveLocalGuestProfile(user: User): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_GUEST_PROFILE_KEY, JSON.stringify(user));
  } catch {
    // L'essai gratuit doit rester utilisable même si le stockage local échoue.
  }
}

export async function stageGuestUpgrade(email: string, profile: User): Promise<void> {
  const payload: PendingGuestUpgrade = {
    email: email.trim().toLowerCase(),
    profile,
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(PENDING_GUEST_UPGRADE_KEY, JSON.stringify(payload));
  await saveLocalGuestProfile(profile);
}

export async function loadPendingGuestUpgrade(): Promise<PendingGuestUpgrade | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_GUEST_UPGRADE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingGuestUpgrade;
    return parsed?.profile?.id && parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearGuestUpgradeState(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      PENDING_GUEST_UPGRADE_KEY,
      LOCAL_GUEST_PROFILE_KEY,
      LOCAL_GUEST_ID_KEY,
    ]);
  } catch {
    // Le compte est déjà créé côté Supabase : un nettoyage local raté ne doit
    // jamais annuler la connexion.
  }
}

export function mergeGuestIntoAccount(serverProfile: User, guestProfile: User, accountId: string, email: string): User {
  return {
    ...serverProfile,
    ...guestProfile,
    id: accountId,
    email,
    username: guestProfile.username || serverProfile.username,
    avatar: guestProfile.avatar || serverProfile.avatar,
    bio: guestProfile.bio || serverProfile.bio,
    city: guestProfile.city || serverProfile.city,
    countryCode: guestProfile.countryCode || serverProfile.countryCode,
    website: guestProfile.website || serverProfile.website,
    favoriteGenres: guestProfile.favoriteGenres?.length ? guestProfile.favoriteGenres : serverProfile.favoriteGenres,
    favoriteArtists: guestProfile.favoriteArtists?.length ? guestProfile.favoriteArtists : serverProfile.favoriteArtists,
    socialLinks: guestProfile.socialLinks?.length ? guestProfile.socialLinks : serverProfile.socialLinks,
    privateInfo: {
      ...serverProfile.privateInfo,
      ...guestProfile.privateInfo,
    },
    isPublic: guestProfile.isPublic,
    locationOptIn: guestProfile.locationOptIn,
  };
}
