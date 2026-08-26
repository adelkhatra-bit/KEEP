import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

const PENDING_GUEST_PROFILE_KEY = '@keep/pending-guest-profile-upgrade-v1';
const LOCAL_GUEST_ID_KEY = '@keep/local-guest-id-v1';

type StagedGuestProfile = Pick<
  User,
  | 'username'
  | 'avatar'
  | 'bio'
  | 'kind'
  | 'city'
  | 'countryCode'
  | 'website'
  | 'favoriteGenres'
  | 'favoriteArtists'
  | 'socialLinks'
  | 'isPublic'
  | 'locationOptIn'
  | 'privateInfo'
>;

/**
 * Conserve uniquement le profil préparé par l'utilisateur avant la création
 * du compte. L'historique des sessions KEEP est déjà persisté séparément dans
 * AsyncStorage et n'est donc ni dupliqué ni envoyé ici.
 */
export async function stageGuestProfileForUpgrade(user: User): Promise<void> {
  const staged: StagedGuestProfile = {
    username: user.username,
    // Une URL https déjà distante peut être conservée. Un file:// ou blob:
    // appartient à l'appareil et ne doit jamais devenir un avatar public cassé.
    avatar: /^https:\/\//i.test(user.avatar || '') ? user.avatar : '',
    bio: user.bio,
    kind: user.kind,
    city: user.city,
    countryCode: user.countryCode,
    website: user.website,
    favoriteGenres: [...user.favoriteGenres],
    favoriteArtists: [...user.favoriteArtists],
    socialLinks: user.socialLinks.map((link) => ({ ...link })),
    isPublic: user.isPublic,
    locationOptIn: user.locationOptIn,
    privateInfo: { ...user.privateInfo },
  };
  await AsyncStorage.setItem(PENDING_GUEST_PROFILE_KEY, JSON.stringify(staged));
}

export async function loadStagedGuestProfile(): Promise<StagedGuestProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_GUEST_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StagedGuestProfile;
  } catch {
    return null;
  }
}

export async function clearStagedGuestProfile(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_GUEST_PROFILE_KEY).catch(() => {});
}

/** Une fois le compte réel créé, le navigateur ne doit plus réactiver l'ancien essai local. */
export async function clearLocalGuestMarker(): Promise<void> {
  await AsyncStorage.removeItem(LOCAL_GUEST_ID_KEY).catch(() => {});
}

export function mergeStagedGuestProfile(serverUser: User, staged: StagedGuestProfile): User {
  const stagedUsername = staged.username?.trim().replace(/^@+/, '').replace(/\s+/g, '');
  return {
    ...serverUser,
    username: stagedUsername && !/^invite-/i.test(stagedUsername) ? stagedUsername : serverUser.username,
    avatar: staged.avatar || serverUser.avatar,
    bio: staged.bio || serverUser.bio,
    kind: staged.kind || serverUser.kind,
    city: staged.city || serverUser.city,
    countryCode: staged.countryCode || serverUser.countryCode,
    website: staged.website || serverUser.website,
    favoriteGenres: staged.favoriteGenres?.length ? staged.favoriteGenres : serverUser.favoriteGenres,
    favoriteArtists: staged.favoriteArtists?.length ? staged.favoriteArtists : serverUser.favoriteArtists,
    socialLinks: staged.socialLinks?.length ? staged.socialLinks : serverUser.socialLinks,
    isPublic: staged.isPublic,
    locationOptIn: staged.locationOptIn,
    privateInfo: {
      ...serverUser.privateInfo,
      ...staged.privateInfo,
    },
  };
}
