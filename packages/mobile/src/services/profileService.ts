import { SupabaseClient } from '@supabase/supabase-js';
import { KeepAuthSession } from './authService';
import { SocialLink, User } from '../types';

function fallbackUser(session: KeepAuthSession): User {
  return {
    id: session.userId,
    username: session.email?.split('@')[0] ?? session.userId.slice(0, 8),
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
        id: session.userId,
        username: profile.username,
        email: session.email ?? '',
        avatar: profile.avatar_url ?? '',
        bio: profile.bio ?? '',
        playlistCount: 0,
        followerCount: followersResult.count ?? 0,
        followingCount: followingResult.count ?? 0,
        kind: profile.kind,
        city: profile.city ?? undefined,
        countryCode: profile.country_code ?? undefined,
        website: profile.website ?? undefined,
        favoriteGenres: profile.favorite_genres ?? [],
        favoriteArtists: profile.favorite_artists ?? [],
        socialLinks: (socialLinks ?? []) as SocialLink[],
        isPublic: profile.is_public,
        locationOptIn: profile.location_opt_in,
        privateInfo: {
          birthDate: privateInfo?.birth_date ?? undefined,
          gender: privateInfo?.gender ?? undefined,
        },
      };
    },

    async saveOwnProfile(user: User): Promise<void> {
      const { error: profileError } = await client.from('profiles').upsert({
        id: user.id,
        username: user.username,
        display_name: user.username,
        bio: user.bio || null,
        avatar_url: user.avatar || null,
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

      const hasPrivateInfo = Boolean(user.privateInfo.birthDate || user.privateInfo.gender);
      if (hasPrivateInfo) {
        const { error: privateError } = await client.from('profile_private_info').upsert({
          profile_id: user.id,
          birth_date: user.privateInfo.birthDate || null,
          gender: user.privateInfo.gender || null,
        }, { onConflict: 'profile_id' });
        if (privateError) throw privateError;
      }
    },
  };
}
