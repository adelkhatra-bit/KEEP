import { SupabaseClient } from '@supabase/supabase-js';
import { KeepAuthSession } from './authService';
import { SocialLink, User } from '../types';

export interface SaveProfileOptions {
  /**
   * Les sauvegardes automatiques sont volontairement non destructives : une
   * ancienne version de l'app ou un store incomplet ne doit jamais remplacer
   * des champs Supabase déjà renseignés par des valeurs vides.
   *
   * Les écrans où l'utilisateur appuie explicitement sur Enregistrer/Supprimer
   * utilisent une nouvelle instance du service et restent destructifs afin
   * qu'un effacement volontaire soit toujours possible.
   */
  allowClearing?: boolean;
}

function fallbackUser(session: KeepAuthSession): User {
  return {
    id: session.userId,
    username: session.username ?? '',
    email: session.email ?? '',
    avatar: '',
    bio: '',
    playlistCount: 0,
    followerCount: 0,
    followingCount: 0,
    kind: 'USER',
    favoriteGenres: [],
    favoriteArtists: [],
    socialLinks: [],
    isPublic: true,
    locationOptIn: false,
    privateInfo: {},
  };
}

function publicUserFromProfile(profile: any, socialLinks: SocialLink[], followerCount: number, followingCount: number): User {
  return {
    id: profile.id,
    username: profile.username,
    email: '',
    avatar: profile.avatar_url ?? '',
    bio: profile.bio ?? '',
    playlistCount: 0,
    followerCount,
    followingCount,
    kind: profile.kind,
    city: profile.city ?? undefined,
    countryCode: profile.country_code ?? undefined,
    website: profile.website ?? undefined,
    favoriteGenres: profile.favorite_genres ?? [],
    favoriteArtists: profile.favorite_artists ?? [],
    socialLinks,
    isPublic: profile.is_public,
    locationOptIn: false,
    privateInfo: {},
  };
}

function isRemoteAvatar(value: string | undefined): boolean {
  return !value || /^https?:\/\//i.test(value);
}

function keepTextUnlessExplicitlyCleared(
  localValue: string | undefined,
  remoteValue: string | null | undefined,
  allowClearing: boolean,
): string | null {
  const local = localValue?.trim() ?? '';
  if (allowClearing) return local || null;
  return local || remoteValue || null;
}

function mergeSocialLinks(remote: SocialLink[], local: SocialLink[], allowClearing: boolean): SocialLink[] {
  if (allowClearing) return local.map((link) => ({ ...link }));
  const byPlatform = new Map<SocialLink['platform'], SocialLink>();
  for (const link of remote) byPlatform.set(link.platform, { ...link });
  for (const link of local) byPlatform.set(link.platform, { ...link });
  return Array.from(byPlatform.values());
}

async function persistLocalAvatar(client: SupabaseClient, profileId: string, avatar: string): Promise<string> {
  if (isRemoteAvatar(avatar)) return avatar || '';

  const response = await fetch(avatar);
  if (!response.ok && !avatar.startsWith('blob:') && !avatar.startsWith('file:')) {
    throw new Error('Impossible de lire la photo locale avant sa sauvegarde.');
  }
  const blob = await response.blob();
  const mime = blob.type || 'image/jpeg';
  const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const path = `${profileId}/avatar.${extension}`;

  const { error } = await client.storage.from('avatars').upload(path, blob, {
    upsert: true,
    contentType: mime,
    cacheControl: '3600',
  });
  if (error) throw error;

  const { data } = client.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export function createProfileService(client: SupabaseClient) {
  // L'instance longue durée créée au bootstrap appelle d'abord loadOrCreate...
  // puis reçoit les changements automatiques du store. Les instances créées
  // directement par les écrans de réglages n'ont pas fait ce chargement : leur
  // save correspond donc à une action utilisateur explicite (effacement permis).
  let loadedOwnProfileId: string | null = null;

  return {
    async loadOrCreateOwnProfile(session: KeepAuthSession): Promise<User> {
      const fallback = fallbackUser(session);

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('*')
        .eq('id', session.userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        // Un nouveau profil doit toujours utiliser le pseudo explicitement
        // choisi lors de l'inscription. On ne fabrique jamais un pseudo depuis
        // l'adresse e-mail ou l'UUID : si la métadonnée manque, on refuse la
        // création au lieu de publier une identité inventée.
        if (!fallback.username) throw new Error('missing_keep_username');
        const { error: insertError } = await client.from('profiles').insert({
          id: session.userId,
          username: fallback.username,
          display_name: fallback.username,
          bio: '',
          avatar_url: null,
          country_code: null,
          city: null,
          kind: 'USER',
          language_code: 'fr',
          is_public: true,
          location_opt_in: false,
          website: null,
          favorite_genres: [],
          favorite_artists: [],
        });
        if (insertError) throw insertError;
        loadedOwnProfileId = session.userId;
        return fallback;
      }

      const [{ data: privateInfo, error: privateError }, { data: socialLinks, error: socialError }, followersResult, followingResult] = await Promise.all([
        client.from('profile_private_info').select('birth_date, gender').eq('profile_id', session.userId).maybeSingle(),
        client.from('social_links').select('platform, url, visibility').eq('profile_id', session.userId),
        client.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', session.userId),
        client.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', session.userId),
      ]);

      if (privateError) throw privateError;
      if (socialError) throw socialError;
      if (followersResult.error) throw followersResult.error;
      if (followingResult.error) throw followingResult.error;

      loadedOwnProfileId = session.userId;
      return {
        ...publicUserFromProfile(
          profile,
          (socialLinks ?? []) as SocialLink[],
          followersResult.count ?? 0,
          followingResult.count ?? 0
        ),
        email: session.email ?? '',
        locationOptIn: profile.location_opt_in,
        privateInfo: {
          birthDate: privateInfo?.birth_date ?? undefined,
          gender: privateInfo?.gender ?? undefined,
        },
      };
    },

    async loadPublicProfileByUsername(username: string): Promise<User | null> {
      const cleanUsername = username.trim().replace(/^@/, '');
      let { data: profile, error: profileError } = await client
        .from('profiles')
        .select('*')
        .ilike('username', cleanUsername)
        .eq('is_public', true)
        .maybeSingle();

      if (profileError) throw profileError;

      // Un ancien lien reste valable après changement de pseudo : la base garde
      // chaque ancien pseudo réservé et le résout vers le même profile_id.
      if (!profile) {
        const { data: alias, error: aliasError } = await client
          .from('profile_username_aliases')
          .select('profile_id')
          .ilike('alias', cleanUsername)
          .maybeSingle();
        if (aliasError) throw aliasError;
        if (alias?.profile_id) {
          const resolved = await client
            .from('profiles')
            .select('*')
            .eq('id', alias.profile_id)
            .eq('is_public', true)
            .maybeSingle();
          if (resolved.error) throw resolved.error;
          profile = resolved.data;
        }
      }

      if (!profile) return null;

      const [{ data: socialLinks, error: socialError }, followersResult, followingResult] = await Promise.all([
        client
          .from('social_links')
          .select('platform, url, visibility')
          .eq('profile_id', profile.id)
          .eq('visibility', 'PUBLIC'),
        client.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', profile.id),
        client.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
      ]);

      if (socialError) throw socialError;
      if (followersResult.error) throw followersResult.error;
      if (followingResult.error) throw followingResult.error;

      return publicUserFromProfile(
        profile,
        (socialLinks ?? []) as SocialLink[],
        followersResult.count ?? 0,
        followingResult.count ?? 0
      );
    },

    async saveOwnProfile(user: User, options: SaveProfileOptions = {}): Promise<void> {
      // Un essai gratuit local possède volontairement un UUID local mais PAS
      // de session Supabase. Dans ce cas on ne tente aucune écriture distante :
      // le store garde les changements sur l'appareil et ils seront migrés à
      // la création du compte. Cela évite les erreurs RLS et les faux profils.
      const { data: authState } = await client.auth.getSession();
      const authenticatedId = authState.session?.user?.id;
      if (!authenticatedId || authenticatedId !== user.id) return;

      const allowClearing = options.allowClearing ?? loadedOwnProfileId !== user.id;

      // Avant toute écriture, relire l'état Supabase. Les sauvegardes automatiques
      // sont déclenchées par plusieurs changements du store (GPS, notifications,
      // refresh de session). Elles ne doivent JAMAIS transformer un profil déjà
      // complet en profil vide après une mise à jour de l'application.
      const [profileResult, privateResult, socialResult] = await Promise.all([
        client.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        client.from('profile_private_info').select('birth_date, gender').eq('profile_id', user.id).maybeSingle(),
        client.from('social_links').select('platform, url, visibility').eq('profile_id', user.id),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (privateResult.error) throw privateResult.error;
      if (socialResult.error) throw socialResult.error;

      const existingProfile = profileResult.data as any | null;
      const existingPrivate = privateResult.data as any | null;
      const existingSocialLinks = (socialResult.data ?? []) as SocialLink[];

      // Lors du passage essai local -> vrai compte, l'avatar peut encore être
      // un blob:/file: local. On le transforme ici, sous la session authentifiée
      // et dans le dossier storage de auth.uid(), AVANT d'écrire profiles.
      // Les avatars déjà publics ne sont jamais ré-uploadés.
      const localAvatar = user.avatar || '';
      const uploadedAvatar = localAvatar ? await persistLocalAvatar(client, user.id, localAvatar) : '';
      const persistedAvatar = allowClearing ? uploadedAvatar : (uploadedAvatar || existingProfile?.avatar_url || '');

      const favoriteGenres = allowClearing || user.favoriteGenres.length > 0
        ? user.favoriteGenres
        : (existingProfile?.favorite_genres ?? []);
      const favoriteArtists = allowClearing || user.favoriteArtists.length > 0
        ? user.favoriteArtists
        : (existingProfile?.favorite_artists ?? []);

      const safeUsername = user.username.trim() || existingProfile?.username;
      if (!safeUsername) throw new Error('missing_keep_username');

      const { error: profileError } = await client.from('profiles').upsert({
        id: user.id,
        username: safeUsername,
        display_name: safeUsername,
        bio: keepTextUnlessExplicitlyCleared(user.bio, existingProfile?.bio, allowClearing),
        avatar_url: persistedAvatar || null,
        country_code: keepTextUnlessExplicitlyCleared(user.countryCode, existingProfile?.country_code, allowClearing),
        city: keepTextUnlessExplicitlyCleared(user.city, existingProfile?.city, allowClearing),
        kind: user.kind || existingProfile?.kind || 'USER',
        is_public: user.isPublic,
        location_opt_in: user.locationOptIn,
        website: keepTextUnlessExplicitlyCleared(user.website, existingProfile?.website, allowClearing),
        favorite_genres: favoriteGenres,
        favorite_artists: favoriteArtists,
      }, { onConflict: 'id' });
      if (profileError) throw profileError;

      // IMPORTANT : ne plus faire DELETE ALL puis INSERT. Une erreur réseau entre
      // les deux opérations effaçait tous les réseaux sociaux. On upsert d'abord
      // chaque lien, puis on ne supprime les liens absents que lors d'une action
      // utilisateur explicitement destructive.
      const desiredSocialLinks = mergeSocialLinks(existingSocialLinks, user.socialLinks, allowClearing);
      if (desiredSocialLinks.length > 0) {
        const { error: socialError } = await client.from('social_links').upsert(
          desiredSocialLinks.map((link) => ({
            profile_id: user.id,
            platform: link.platform,
            url: link.url,
            visibility: link.visibility,
          })),
          { onConflict: 'profile_id,platform' }
        );
        if (socialError) throw socialError;
      }

      if (allowClearing) {
        const desiredPlatforms = new Set(desiredSocialLinks.map((link) => link.platform));
        for (const existing of existingSocialLinks) {
          if (desiredPlatforms.has(existing.platform)) continue;
          const { error: deleteError } = await client
            .from('social_links')
            .delete()
            .eq('profile_id', user.id)
            .eq('platform', existing.platform);
          if (deleteError) throw deleteError;
        }
      }

      const birthDate = allowClearing
        ? (user.privateInfo.birthDate || null)
        : (user.privateInfo.birthDate || existingPrivate?.birth_date || null);
      const gender = allowClearing
        ? (user.privateInfo.gender || null)
        : (user.privateInfo.gender || existingPrivate?.gender || null);

      const { error: privateError } = await client.from('profile_private_info').upsert({
        profile_id: user.id,
        birth_date: birthDate,
        gender,
      }, { onConflict: 'profile_id' });
      if (privateError) throw privateError;
    },
  };
}