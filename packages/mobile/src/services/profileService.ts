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

const WEB_LAST_REAL_USER_KEY = '__keep_last_real_user_v1';

function cachedOutageProfile(session: KeepAuthSession): User | null {
  try {
    const storage = (globalThis as any)?.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(WEB_LAST_REAL_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (String(parsed?.id || '') !== session.userId) return null;
    const username = String(parsed?.username || session.username || '').trim().replace(/^@+/, '');
    if (!username) return null;
    return {
      ...fallbackUser(session),
      username,
      avatar: typeof parsed?.avatar === 'string' ? parsed.avatar : '',
      bio: typeof parsed?.bio === 'string' ? parsed.bio : '',
      playlistCount: Number.isFinite(Number(parsed?.playlistCount)) ? Number(parsed.playlistCount) : 0,
      followerCount: Number.isFinite(Number(parsed?.followerCount)) ? Number(parsed.followerCount) : 0,
      followingCount: Number.isFinite(Number(parsed?.followingCount)) ? Number(parsed.followingCount) : 0,
      kind: safeProfileKind(parsed?.kind),
      city: safeOptionalText(parsed?.city),
      countryCode: safeOptionalText(parsed?.countryCode),
      preferredLanguageTag: safeOptionalText(parsed?.preferredLanguageTag),
      musicCountryCodes: normalizeProfileTextList(parsed?.musicCountryCodes, 50).map((code) => code.toUpperCase()),
      website: safeOptionalText(parsed?.website),
      favoriteGenres: normalizeProfileTextList(parsed?.favoriteGenres),
      favoriteArtists: normalizeProfileTextList(parsed?.favoriteArtists),
      socialLinks: Array.isArray(parsed?.socialLinks)
        ? parsed.socialLinks.filter((link: unknown) => Boolean(link && typeof (link as any).platform === 'string' && typeof (link as any).url === 'string'))
        : [],
      isPublic: parsed?.isPublic !== false,
      locationOptIn: Boolean(parsed?.locationOptIn),
      privateInfo: {},
    };
  } catch {
    return null;
  }
}

async function withProfileDeadline<T>(operation: PromiseLike<T>, timeoutMs = 2000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('profile_temporarily_unavailable:timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function normalizeProfileTextList(value: unknown, maxItems = 250): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const clean = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase('fr-FR');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= Math.max(1, maxItems)) break;
  }
  return result;
}

function safeProfileKind(value: unknown): User['kind'] {
  return value === 'USER' || value === 'CREATOR' || value === 'DJ' || value === 'ARTIST' || value === 'PRODUCER' || value === 'VENUE'
    ? value
    : 'USER';
}

function safeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function publicUserFromProfile(profile: any, socialLinks: SocialLink[], followerCount: number, followingCount: number): User {
  return {
    id: String(profile?.id || ''),
    username: typeof profile?.username === 'string' ? profile.username.trim().replace(/^@+/, '') : '',
    email: '',
    avatar: typeof profile?.avatar_url === 'string' ? profile.avatar_url : '',
    bio: typeof profile?.bio === 'string' ? profile.bio : '',
    playlistCount: 0,
    followerCount: Number.isFinite(Number(followerCount)) ? Math.max(0, Number(followerCount)) : 0,
    followingCount: Number.isFinite(Number(followingCount)) ? Math.max(0, Number(followingCount)) : 0,
    kind: safeProfileKind(profile?.kind),
    city: safeOptionalText(profile?.city),
    countryCode: safeOptionalText(profile?.country_code),
    preferredLanguageTag: safeOptionalText(profile?.preferred_language_tag),
    musicCountryCodes: normalizeProfileTextList(profile?.music_country_codes, 50).map((code) => code.toUpperCase()),
    website: safeOptionalText(profile?.website),
    favoriteGenres: normalizeProfileTextList(profile?.favorite_genres),
    favoriteArtists: normalizeProfileTextList(profile?.favorite_artists),
    socialLinks: Array.isArray(socialLinks) ? socialLinks.filter((link) => Boolean(link && typeof link.url === 'string' && typeof link.platform === 'string')) : [],
    isPublic: profile?.is_public !== false,
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

function isMissingSocialLabelColumn(error: any): boolean {
  const value = `${error?.code ?? ''} ${error?.message ?? ''} ${error?.details ?? ''}`;
  return /label/i.test(value) && /(PGRST204|column|schema cache)/i.test(value);
}

async function loadSocialLinks(client: SupabaseClient, profileId: string, publicOnly = false): Promise<SocialLink[]> {
  const run = async (columns: string) => {
    const base = client.from('social_links').select(columns).eq('profile_id', profileId);
    return publicOnly ? await base.eq('visibility', 'PUBLIC') : await base;
  };

  const withLabel = await run('platform, url, visibility, label');
  if (!withLabel.error) return (withLabel.data ?? []) as unknown as SocialLink[];
  if (!isMissingSocialLabelColumn(withLabel.error)) throw withLabel.error;

  // Compatibilité pendant le déploiement : tant que la migration n'est pas
  // appliquée, les anciennes lignes restent lisibles et l'app ne casse pas.
  const legacy = await run('platform, url, visibility');
  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []) as unknown as SocialLink[];
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

      let profile: any = null;
      let profileError: any = null;
      try {
        const profileResult: any = await withProfileDeadline(
          client.from('profiles').select('*').eq('id', session.userId).maybeSingle(),
        );
        profile = profileResult?.data ?? null;
        profileError = profileResult?.error ?? null;
      } catch (error) {
        profileError = error;
      }

      // Incident 02/10/2026 : PostgREST a renvoyé PGRST002/503 alors que les
      // comptes existaient. En cas d'erreur, on récupère le VRAI profil par
      // l'Edge Function SQL directe, authentifiée par la session courante.
      if (profileError) {
        try {
          const bootstrap: any = await withProfileDeadline(
            client.functions.invoke('keep-profile-bootstrap', { body: {} }),
          );
          const payload: any = bootstrap?.data;
          if (!bootstrap?.error && payload?.ok && payload?.profile) {
            profile = payload.profile;
            loadedOwnProfileId = session.userId;
            return {
              ...publicUserFromProfile(
                profile,
                Array.isArray(payload.social_links) ? payload.social_links : [],
                Number(payload.follower_count ?? 0),
                Number(payload.following_count ?? 0),
              ),
              email: session.email ?? '',
              locationOptIn: profile.location_opt_in,
              privateInfo: {
                birthDate: payload.private_info?.birth_date ?? undefined,
                gender: payload.private_info?.gender ?? undefined,
              },
            };
          }
        } catch {
          // Le fallback local ci-dessous est réservé à une indisponibilité distante.
        }

        const cached = cachedOutageProfile(session);
        const safeFallback = cached ?? (session.username ? fallback : null);
        if (safeFallback) {
          // Marque l'identité comme déjà connue afin que les sauvegardes
          // automatiques restent NON destructives au retour de Supabase.
          loadedOwnProfileId = session.userId;
          return safeFallback;
        }
        throw profileError;
      }

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
          preferred_language_tag: null,
          music_country_codes: [],
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

      // Le premier rendu connecté ne doit pas attendre les données secondaires
      // (réseaux, date/genre privés, compteurs followers). Le profil principal
      // contient déjà l'identité, avatar, bio, ville/pays et styles : on le
      // retourne immédiatement puis App hydrate les extras en arrière-plan.
      loadedOwnProfileId = session.userId;
      return {
        ...publicUserFromProfile(profile, [], 0, 0),
        email: session.email ?? '',
        locationOptIn: profile.location_opt_in,
        privateInfo: {},
      };
    },

    async loadOwnProfileExtras(session: KeepAuthSession): Promise<Partial<User>> {
      // Chaque extra est indépendant. Une 503 sur les réseaux ne doit pas
      // empêcher la date/genre ou les compteurs de se charger, et inversement.
      const safePrivate = async () => {
        try {
          const result = await client.from('profile_private_info').select('birth_date, gender').eq('profile_id', session.userId).maybeSingle();
          return result.error ? null : result.data;
        } catch {
          return null;
        }
      };
      const safeSocial = async () => {
        try {
          return await loadSocialLinks(client, session.userId);
        } catch {
          return null;
        }
      };
      const safeFollowers = async () => {
        try {
          const result = await client.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', session.userId);
          return result.error ? null : (result.count ?? 0);
        } catch {
          return null;
        }
      };
      const safeFollowing = async () => {
        try {
          const result = await client.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', session.userId);
          return result.error ? null : (result.count ?? 0);
        } catch {
          return null;
        }
      };

      const [privateInfo, socialLinks, followerCount, followingCount] = await Promise.all([
        safePrivate(),
        safeSocial(),
        safeFollowers(),
        safeFollowing(),
      ]);

      const patch: Partial<User> = {};
      if (privateInfo) {
        patch.privateInfo = {
          birthDate: privateInfo.birth_date ?? undefined,
          gender: privateInfo.gender ?? undefined,
        };
      }
      if (socialLinks) patch.socialLinks = socialLinks as SocialLink[];
      if (followerCount !== null) patch.followerCount = followerCount;
      if (followingCount !== null) patch.followingCount = followingCount;
      return patch;
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

      const [socialLinks, followersResult, followingResult] = await Promise.all([
        loadSocialLinks(client, profile.id, true),
        client.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', profile.id),
        client.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
      ]);

      if (followersResult.error) throw followersResult.error;
      if (followingResult.error) throw followingResult.error;

      // Une visite authentifiée avertit automatiquement le propriétaire, mais
      // cette notification est strictement best-effort : elle ne doit JAMAIS
      // retarder le premier rendu du profil. L'ancien code attendait le RPC
      // notify_profile_view avant de retourner le profil et pouvait donc
      // bloquer l'écran entier si ce RPC ou le réseau ralentissait.
      void client.auth.getUser()
        .then(({ data: authState }) => {
          if (!authState.user?.id || authState.user.id === profile.id) return;
          return client.rpc('notify_profile_view', { target_profile_id: profile.id }).then(() => undefined);
        })
        .catch(() => undefined);

      return publicUserFromProfile(
        profile,
        (socialLinks ?? []) as SocialLink[],
        followersResult.count ?? 0,
        followingResult.count ?? 0
      );
    },

    async saveOwnProfile(user: User, options: SaveProfileOptions = {}): Promise<void> {
      // Ne jamais écrire un profil à partir d'un token local périmé. `getUser()`
      // revalide réellement la session côté Supabase ; un compte supprimé ou
      // un ancien essai local reste alors uniquement sur l'appareil et ne peut
      // plus provoquer une violation profiles_id_fkey.
      const { data: authState, error: authError } = await client.auth.getUser();
      const authenticatedId = authState.user?.id;
      if (authError || !authenticatedId || authenticatedId !== user.id) return;

      const allowClearing = options.allowClearing ?? loadedOwnProfileId !== user.id;

      // Avant toute écriture, relire l'état Supabase. Les sauvegardes automatiques
      // sont déclenchées par plusieurs changements du store (GPS, notifications,
      // refresh de session). Elles ne doivent JAMAIS transformer un profil déjà
      // complet en profil vide après une mise à jour de l'application.
      const [profileResult, privateResult, existingSocialLinks] = await Promise.all([
        client.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        client.from('profile_private_info').select('birth_date, gender').eq('profile_id', user.id).maybeSingle(),
        loadSocialLinks(client, user.id),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (privateResult.error) throw privateResult.error;

      const existingProfile = profileResult.data as any | null;
      const existingPrivate = privateResult.data as any | null;

      // Lors du passage essai local -> vrai compte, l'avatar peut encore être
      // un blob:/file: local. On le transforme ici, sous la session authentifiée
      // et dans le dossier storage de auth.uid(), AVANT d'écrire profiles.
      // Les avatars déjà publics ne sont jamais ré-uploadés.
      const localAvatar = user.avatar || '';
      const uploadedAvatar = localAvatar ? await persistLocalAvatar(client, user.id, localAvatar) : '';
      const persistedAvatar = allowClearing ? uploadedAvatar : (uploadedAvatar || existingProfile?.avatar_url || '');

      const localFavoriteGenres = normalizeProfileTextList(user.favoriteGenres);
      const localFavoriteArtists = normalizeProfileTextList(user.favoriteArtists);
      const favoriteGenres = allowClearing || localFavoriteGenres.length > 0
        ? localFavoriteGenres
        : normalizeProfileTextList(existingProfile?.favorite_genres);
      const favoriteArtists = allowClearing || localFavoriteArtists.length > 0
        ? localFavoriteArtists
        : normalizeProfileTextList(existingProfile?.favorite_artists);

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
        preferred_language_tag: keepTextUnlessExplicitlyCleared(user.preferredLanguageTag, existingProfile?.preferred_language_tag, allowClearing),
        music_country_codes: (user.musicCountryCodes?.length || allowClearing)
          ? normalizeProfileTextList(user.musicCountryCodes ?? [], 50).map((code) => code.toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code))
          : normalizeProfileTextList(existingProfile?.music_country_codes, 50).map((code) => code.toUpperCase()),
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
        const rowsWithLabel = desiredSocialLinks.map((link) => ({
          profile_id: user.id,
          platform: link.platform,
          url: link.url,
          visibility: link.visibility,
          label: link.label ?? null,
        }));
        let { error: socialError } = await client.from('social_links').upsert(
          rowsWithLabel,
          { onConflict: 'profile_id,platform' }
        );

        // Déploiement progressif : si le schéma distant n'a pas encore la
        // colonne label, conserver la sauvegarde URL/visibilité au lieu de
        // faire échouer tout le profil. Après migration, le libellé persiste.
        if (socialError && isMissingSocialLabelColumn(socialError)) {
          const legacy = await client.from('social_links').upsert(
            desiredSocialLinks.map((link) => ({
              profile_id: user.id,
              platform: link.platform,
              url: link.url,
              visibility: link.visibility,
            })),
            { onConflict: 'profile_id,platform' }
          );
          socialError = legacy.error;
        }
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