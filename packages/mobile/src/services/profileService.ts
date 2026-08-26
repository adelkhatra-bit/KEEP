import { SupabaseClient } from '@supabase/supabase-js';
import { KeepAuthSession } from './authService';
import { SocialLink, User } from '../types';

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
      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('*')
        .ilike('username', cleanUsername)
        .eq('is_public', true)
        .maybeSingle();

      if (profileError) throw profileError;
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

    async saveOwnProfile(user: User): Promise<void> {
      // Un essai gratuit local possède volontairement un UUID local mais PAS
      // de session Supabase. Dans ce cas on ne tente aucune écriture distante :
      // le store garde les changements sur l'appareil et ils seront migrés à
      // la création du compte. Cela évite les erreurs RLS et les faux profils.
      const { data: authState } = await client.auth.getSession();
      const authenticatedId = authState.session?.user?.id;
      if (!authenticatedId || authenticatedId !== user.id) return;

      // Lors du passage essai local -> vrai compte, l'avatar peut encore être
      // un blob:/file: local. On le transforme ici, sous la session authentifiée
      // et dans le dossier storage de auth.uid(), AVANT d'écrire profiles.
      // Les avatars déjà publics ne sont jamais ré-uploadés.
      const persistedAvatar = await persistLocalAvatar(client, user.id, user.avatar || '');

      const { error: profileError } = await client.from('profiles').upsert({
        id: user.id,
        username: user.username,
        display_name: user.username,
        bio: user.bio || null,
        avatar_url: persistedAvatar || null,
        country_code: user.countryCode || null,
        city: user.city || null,
        kind: user.kind,
        is_public: user.isPublic,
        location_opt_in: user.locationOptIn,
        website: user.website || null,
        favorite_genres: user.favoriteGenres,
        favorite_artists: user.favoriteArtists,
      }, { onConflict: 'id' });
      if (profileError) throw profileError;

      const { error: deleteLinksError } = await client
        .from('social_links')
        .delete()
        .eq('profile_id', user.id);
      if (deleteLinksError) throw deleteLinksError;

      if (user.socialLinks.length > 0) {
        const { error: socialError } = await client.from('social_links').insert(
          user.socialLinks.map((link) => ({
            profile_id: user.id,
            platform: link.platform,
            url: link.url,
            visibility: link.visibility,
          }))
        );
        if (socialError) throw socialError;
      }

      // Toujours écrire la ligne privée, même lorsque les deux champs viennent
      // d'être effacés. Sinon une ancienne date/genre restait en base après que
      // l'utilisateur l'avait supprimé dans l'interface.
      const { error: privateError } = await client.from('profile_private_info').upsert({
        profile_id: user.id,
        birth_date: user.privateInfo.birthDate || null,
        gender: user.privateInfo.gender || null,
      }, { onConflict: 'profile_id' });
      if (privateError) throw privateError;
    },
  };
}
