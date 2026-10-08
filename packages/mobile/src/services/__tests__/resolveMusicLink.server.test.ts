// Runtime loading keeps Deno's .ts imports out of the Expo typecheck graph.
const { parseMusicUrl, parseOdesli, resolveMusicLink, CACHE_TTL_MS, fetchOdesli, readBoundedJson, isRealMusicUser, normalizeIdentity } = require('../../../../../supabase/functions/keep-resolve-music-link/resolver');
const { createMusicLinkStore } = require('../../../../../supabase/functions/keep-resolve-music-link/store');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const url = 'https://open.spotify.com/track/abc';
const payload = {
  entityUniqueId: 'SPOTIFY_SONG::abc',
  entitiesByUniqueId: {
    'SPOTIFY_SONG::abc': {
      type: 'song', id: 'abc', title: 'Été', artistName: 'Artiste', isrc: 'FRABC2600001',
      thumbnailUrl: 'https://i.scdn.co/image/abc', genres: ['Pop'],
    },
  },
  linksByPlatform: { spotify: { url, entityUniqueId: 'SPOTIFY_SONG::abc' } },
};
const fetcher = jest.fn(async () => new Response(JSON.stringify(payload)));

function memoryDatabase(atomicAvailable = false) {
  const tracks: any[] = [];
  const library: any[] = [];
  const rpc = jest.fn(async (name: string, args: any) => {
    if (name === 'service_catalog_track_from_shared_link' && !atomicAvailable) {
      return { data: null, error: { code: 'PGRST202' } };
    }
    expect(['service_catalog_track_from_recognition', 'service_catalog_track_from_shared_link']).toContain(name);
    let track = tracks.find((row) => (args.p_isrc && row.isrc === args.p_isrc)
      || ['spotify', 'appleMusic', 'deezer'].some((key) => args.p_provider_ids?.[key]
        && row.providerIds?.[key] === args.p_provider_ids[key]));
    if (!track && name === 'service_catalog_track_from_shared_link') {
      track = tracks.find((row) => normalizeIdentity(row.title) === normalizeIdentity(args.p_title)
        && normalizeIdentity(row.artist) === normalizeIdentity(args.p_artist)
        && (!args.p_isrc || !row.isrc || row.isrc === args.p_isrc));
    }
    if (!track) {
      track = { id: `track-${tracks.length + 1}`, isrc: args.p_isrc, title: args.p_title, artist: args.p_artist, providerIds: args.p_provider_ids };
      tracks.push(track);
    }

    return { data: track.id, error: null };
  });
  const from = jest.fn((table: string) => {
    const rows = table === 'tracks' ? tracks : library;
    const filters: ((row: any) => boolean)[] = [];
    let insert: any;
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: any) => { filters.push((row) => row[key] === value); return chain; },
      is: (key: string, value: any) => { filters.push((row) => (row[key] ?? null) === value); return chain; },
      contains: (_key: string, value: any) => {
        filters.push((row) => row.metadata?.musicLinkResolution?.requestUrl === value.musicLinkResolution.requestUrl);
        return chain;
      },
      ilike: (key: string, value: string) => { filters.push((row) => row[key]?.toLowerCase() === value.toLowerCase()); return chain; },
      limit: () => chain,
      maybeSingle: async () => ({ data: rows.find((row) => filters.every((f) => f(row))) || null, error: null }),
      upsert: (item: any, options: any) => {
        expect(options).toEqual({ onConflict: 'profile_id,provider,provider_track_id', ignoreDuplicates: true });
        insert = item;
        return chain;
      },
      then: (resolve: any) => {
        if (insert) {
          const duplicate = rows.some((row) => row.profile_id === insert.profile_id
            && row.provider === insert.provider && row.provider_track_id === insert.provider_track_id);
          if (!duplicate) rows.push({ id: `library-${rows.length + 1}`, ...insert });
          return Promise.resolve(resolve({ data: duplicate ? [] : [rows[rows.length - 1]], error: null }));
        }
        return Promise.resolve(resolve({ data: rows.filter((row) => filters.every((f) => f(row))), error: null }));
      },
    };
    return chain;
  });
  return { tracks, library, rpc, from };
}

function edgeHandler(user: any) {
  const db = { auth: { getUser: jest.fn(async () => ({ data: { user }, error: null })) }, rpc: jest.fn(), from: jest.fn() };
  let handler: (request: Request) => Promise<Response>;
  const source = fs.readFileSync(path.resolve(__dirname, '../../../../../supabase/functions/keep-resolve-music-link/index.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, {
    exports: {}, Request, Response, TextEncoder, crypto: require('crypto').webcrypto,
    Deno: { env: { get: () => 'test-only' }, serve: (fn: any) => { handler = fn; } },
    require: (name: string) => {
      if (name === 'npm:@supabase/supabase-js@2') return { createClient: () => db };
      if (name === './resolver.ts') return require('../../../../../supabase/functions/keep-resolve-music-link/resolver');
      if (name === './store.ts') return { createMusicLinkStore };
      return {};
    },
  });
  return { handler: handler!, db };
}

describe('keep-resolve-music-link serveur', () => {
  beforeEach(() => fetcher.mockClear());

  it.each([
    ['https://youtu.be/abc', 'youtube'],
    ['https://music.youtube.com/watch?v=abc', 'youtube_music'],
    [url, 'spotify'],
    ['https://music.apple.com/fr/album/song/123?i=456', 'apple_music'],
    ['https://deezer.page.link/abc', 'deezer'],
    ['https://soundcloud.com/artist/song', 'soundcloud'],
    ['https://vm.tiktok.com/abc/', 'tiktok'],
    ['https://www.shazam.com/track/123/song', 'shazam'],
    ['https://music.amazon.fr/albums/abc', 'amazon_music'],
    ['https://tidal.com/browse/track/123', 'tidal'],
  ])('détecte %s comme %s', (input, provider) => {
    expect(parseMusicUrl(input).provider).toBe(provider);
  });

  it.each([
    'http://open.spotify.com/track/abc', 'https://localhost/song', 'https://127.0.0.1/song',
    'https://169.254.169.254/song', 'https://[::1]/song', 'https://open.spotify.com.evil.test/song',
    'https://open.spotify.com@evil.test/song', '******open.spotify.com/song',
    'https://open.spotify.com:8443/song', 'https://open.spotify.com\\@evil.test/song',
  ])('refuse une URL non sûre %s', (input) => {
    expect(() => parseMusicUrl(input)).toThrow();
  });

  it('nettoie les paramètres de suivi et conserve l’identité musicale', () => {
    expect(parseMusicUrl(`${url}?utm_source=x&si=test#fragment`).url).toBe(url);
  });

  it('retourne tous les liens sûrs et rejette les liens malveillants du fournisseur', () => {
    const result = parseOdesli({
      ...payload,
      linksByPlatform: {
        ...payload.linksByPlatform,
        youtube: { url: 'https://youtu.be/abc' },
        deezer: { url: 'http://127.0.0.1/secret' },
        appleMusic: { url: 'https://evil.test/song' },
        tidal: { url },
        bandcamp: { url: 'https://artist.bandcamp.com/track/song' },
      },
    }, parseMusicUrl(url));
    expect(result.track).toMatchObject({ title: 'Été', artist: 'Artiste', isrc: 'FRABC2600001', genres: ['Pop'] });
    expect(result.track.platformLinks).toEqual({ spotify: url, youtube: 'https://youtu.be/abc', bandcamp: 'https://artist.bandcamp.com/track/song' });
  });

  it('ne crée ni morceau ni import en aperçu', async () => {
    const db = memoryDatabase();
    const result = await resolveMusicLink({ url, mode: 'preview' }, 'user-a', createMusicLinkStore(db), fetcher);
    expect(result.track.title).toBe('Été');
    expect(db.tracks).toHaveLength(0);
    expect(db.library).toHaveLength(0);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('preview:true mobile reste un aperçu sans écriture, et refuse une intention contradictoire', async () => {
    const db = memoryDatabase();
    const result = await resolveMusicLink({ url, preview: true }, 'user-a', createMusicLinkStore(db), fetcher);
    expect(result.track.title).toBe('Été');
    expect(db.tracks).toHaveLength(0);
    expect(db.library).toHaveLength(0);
    await expect(resolveMusicLink({ url, preview: true, mode: 'import' }, 'user-a', createMusicLinkStore(db), fetcher))
      .rejects.toMatchObject({ code: 'invalid_mode' });
  });

  it('même ISRC partagé deux fois : un tracks et un music_library_items, avec cache persistant', async () => {
    const db = memoryDatabase();
    const store = createMusicLinkStore(db);
    const first = await resolveMusicLink({ url }, 'user-a', store, fetcher);
    const second = await resolveMusicLink({ url }, 'user-a', store, fetcher);
    expect(first).toMatchObject({ imported: true, alreadyImported: false });
    expect(second).toMatchObject({ imported: false, alreadyImported: true });
    expect(first.track.id).toBe(second.track.id);
    expect(db.tracks).toHaveLength(1);
    expect(db.library).toHaveLength(1);
    expect(db.library[0]).toMatchObject({ provider: 'spotify', source_kind: 'shared_link', visibility: 'PRIVATE', profile_id: 'user-a' });
    expect(db.library[0].metadata.platformLinks).toEqual({ spotify: url });
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Une nouvelle instance (nouvel isolate Edge) réutilise le cache en base.
    await resolveMusicLink({ url, mode: 'preview' }, 'user-a', createMusicLinkStore(db), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('deux imports concurrents restent idempotents via RPC et contrainte unique', async () => {
    const db = memoryDatabase();
    const results = await Promise.all([
      resolveMusicLink({ url }, 'user-a', createMusicLinkStore(db), fetcher),
      resolveMusicLink({ url }, 'user-a', createMusicLinkStore(db), fetcher),
    ]);
    expect(db.tracks).toHaveLength(1);
    expect(db.library).toHaveLength(1);
    expect(results.filter((result: any) => result.imported)).toHaveLength(1);
  });

  it('deux variantes d’URL du même provider/ISRC ne créent pas une deuxième ligne', async () => {
    const db = memoryDatabase();
    await resolveMusicLink({ url }, 'user-a', createMusicLinkStore(db), fetcher);
    const result = await resolveMusicLink({ url: 'https://open.spotify.com/intl-fr/track/abc' }, 'user-a', createMusicLinkStore(db), fetcher);
    expect(result.alreadyImported).toBe(true);
    expect(db.tracks).toHaveLength(1);
    expect(db.library).toHaveLength(1);
  });

  it('ne partage ni le cache ni les imports entre comptes', async () => {
    const db = memoryDatabase();
    await resolveMusicLink({ url }, 'user-a', createMusicLinkStore(db), fetcher);
    await resolveMusicLink({ url }, 'user-b', createMusicLinkStore(db), fetcher);
    expect(db.tracks).toHaveLength(1);
    expect(db.library).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('expire le cache après 30 jours', async () => {
    const db = memoryDatabase();
    const start = Date.now();
    await resolveMusicLink({ url }, 'user-a', createMusicLinkStore(db, () => start), fetcher);
    await resolveMusicLink({ url, mode: 'preview' }, 'user-a', createMusicLinkStore(db, () => start + CACHE_TTL_MS), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('revalide le cache modifiable par l’utilisateur et retire ses liens dangereux', async () => {
    const db = memoryDatabase();
    await resolveMusicLink({ url }, 'user-a', createMusicLinkStore(db), fetcher);
    const cached = db.library[0].metadata.musicLinkResolution.resolution;
    cached.track.platformLinks.youtube = 'https://127.0.0.1/secret';
    cached.track.artworkUrl = 'javascript:alert(1)';
    cached.providerIds.unknown = 'untrusted';
    const result = await resolveMusicLink({ url, mode: 'preview' }, 'user-a', createMusicLinkStore(db), fetcher);
    expect(result.track.platformLinks).toEqual({ spotify: url });
    expect(result.track.artworkUrl).toBeUndefined();
  });

  it.each([null, {}, { id: 'guest', is_anonymous: true }, { id: 'demo', user_metadata: { is_demo: true } },
    { id: 'demo', app_metadata: { is_demo: true } }])('refuse les identités invitées et Démo %j', (user) => {
    expect(isRealMusicUser(user)).toBe(false);
  });

  it('accepte une identité réelle vérifiée par Supabase Auth', () => {
    expect(isRealMusicUser({ id: 'user-a', is_anonymous: false })).toBe(true);
  });

  it.each([null, { id: 'guest', is_anonymous: true }, { id: 'demo', user_metadata: { is_demo: true } }])
  ('handler réel : compte invalide %j ne lance aucune écriture', async (user) => {
    const { handler, db } = edgeHandler(user);
    const result = await handler(new Request('https://edge.test/keep-resolve-music-link', {
      method: 'POST', headers: { authorization: ['Bearer', 'test-only'].join(' ') }, body: JSON.stringify({ url }),
    }));
    expect(result.status).toBe(401);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('handler réel : Démo explicite refuse même avec token réel, avant limite ou bibliothèque', async () => {
    const { handler, db } = edgeHandler({ id: 'user-a', is_anonymous: false });
    const result = await handler(new Request('https://edge.test/keep-resolve-music-link', {
      method: 'POST', headers: { authorization: ['Bearer', 'test-only'].join(' ') }, body: JSON.stringify({ url, demo: true }),
    }));
    expect(result.status).toBe(403);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('handler réel : limite persistante impose 10 requêtes par minute et refuse si épuisée', async () => {
    const { handler, db } = edgeHandler({ id: 'user-a', is_anonymous: false });
    db.rpc.mockResolvedValue({ data: false, error: null });
    const result = await handler(new Request('https://edge.test/keep-resolve-music-link', {
      method: 'POST', headers: { authorization: ['Bearer', 'test-only'].join(' ') }, body: JSON.stringify({ url }),
    }));
    expect(result.status).toBe(429);
    expect(db.rpc).toHaveBeenCalledWith('service_allow_recognition', {
      p_identity_hash: expect.stringMatching(/^[a-f0-9]{64}$/), p_limit: 10, p_window_seconds: 60,
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('borne les réponses et requêtes même sans Content-Length', async () => {
    await expect(readBoundedJson(new Response('{"large":"123456789"}'), 10))
      .rejects.toMatchObject({ code: 'payload_too_large' });
    await expect(readBoundedJson(new Response('not json'), 4096)).rejects.toMatchObject({ code: 'invalid_json' });
  });

  it('sans ISRC réutilise un morceau existant sans ingestion concurrente', async () => {
    const db = memoryDatabase();
    db.tracks.push({ id: 'existing', title: 'Été', artist: 'Artiste' });
    const noIsrc = parseOdesli(payload, parseMusicUrl(url));
    delete noIsrc.track.isrc;
    const result = await createMusicLinkStore(db).import('user-a', parseMusicUrl(url), noIsrc);
    expect(result.id).toBe('existing');
    expect(db.rpc).not.toHaveBeenCalledWith('service_catalog_track_from_recognition', expect.anything());
    expect(db.tracks).toHaveLength(1);
    expect(db.library).toHaveLength(1);
  });

  it('ISRC nouveau réutilise le titre/artiste existant avant de créer un autre morceau', async () => {
    const db = memoryDatabase();
    db.tracks.push({ id: 'existing', title: 'Été', artist: 'Artiste' });
    const result = await resolveMusicLink({ url }, 'user-a', createMusicLinkStore(db), fetcher);
    expect(result.track.id).toBe('existing');
    expect(db.rpc).not.toHaveBeenCalledWith('service_catalog_track_from_recognition', expect.anything());
    expect(db.tracks).toHaveLength(1);
  });

  it('sans ISRC refuse une création non atomique plutôt que créer un doublon', async () => {
    const db = memoryDatabase();
    const noIsrc = parseOdesli(payload, parseMusicUrl(url));
    delete noIsrc.track.isrc;
    noIsrc.providerIds = {};
    await expect(createMusicLinkStore(db).import('user-a', parseMusicUrl(url), noIsrc))
      .rejects.toMatchObject({ code: 'atomic_track_identity_required' });
    expect(db.rpc).not.toHaveBeenCalledWith('service_catalog_track_from_recognition', expect.anything());
    expect(db.library).toHaveLength(0);
  });

  it('sans ISRC utilise les index uniques fournisseurs pour deux imports concurrents', async () => {
    const db = memoryDatabase();
    const noIsrc = parseOdesli(payload, parseMusicUrl(url));
    delete noIsrc.track.isrc;
    const store = createMusicLinkStore(db);
    const results = await Promise.all([
      store.import('user-a', parseMusicUrl(url), noIsrc),
      store.import('user-a', parseMusicUrl(url), noIsrc),
    ]);
    expect(db.rpc).toHaveBeenCalledWith('service_catalog_track_from_recognition',
      expect.objectContaining({ p_isrc: null, p_provider_ids: { spotify: 'abc' } }));
    expect(db.tracks).toHaveLength(1);
    expect(db.library).toHaveLength(1);
    expect(results.filter((result: any) => !result.alreadyImported)).toHaveLength(1);
  });

  it('RPC additive : titre/artiste normalisés sont atomiques sans ISRC ni ID fournisseur', async () => {
    const db = memoryDatabase(true);
    const first = parseOdesli(payload, parseMusicUrl(url));
    delete first.track.isrc;
    first.providerIds = {};
    const second = { ...first, track: { ...first.track, title: '  ETE  ', artist: 'ARTISTE' } };
    const results = await Promise.all([
      createMusicLinkStore(db).import('user-a', parseMusicUrl(url), first),
      createMusicLinkStore(db).import('user-a', parseMusicUrl(url), second),
    ]);
    expect(db.tracks).toHaveLength(1);
    expect(db.library).toHaveLength(1);
    expect(results[0].id).toBe(results[1].id);
    expect(db.rpc).toHaveBeenCalledWith('service_catalog_track_from_shared_link', expect.anything());
    expect(db.rpc).not.toHaveBeenCalledWith('service_catalog_track_from_recognition', expect.anything());
  });

  it('migration additive conserve les tables et sérialise l’identité normalisée, service-only', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../../../supabase/migrations/20261008110000_shared_music_link_atomic_catalog.sql'), 'utf8');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('normalize(v_title, NFKD)');
    expect(sql).toContain('public.keep_track_identity');
    expect(sql).toContain('public.service_catalog_track_from_recognition');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain('to service_role');
    expect(sql).not.toMatch(/create\s+table|delete\s+from|truncate|drop\s+table/i);
  });

  it('utilise uniquement l’API Odesli fixe et refuse ses redirections', async () => {
    await fetchOdesli(parseMusicUrl(url), fetcher);
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/api\.song\.link\/v1-alpha\.1\/links\?url=/),
      expect.objectContaining({ redirect: 'error' }));
  });

  it('refuse albums et mode invalide avant écriture', async () => {
    expect(() => parseOdesli({ ...payload, entitiesByUniqueId: {
      'SPOTIFY_SONG::abc': { ...payload.entitiesByUniqueId['SPOTIFY_SONG::abc'], type: 'album' },
    } }, parseMusicUrl(url))).toThrow('music_track_not_found');
    const db = memoryDatabase();
    await expect(resolveMusicLink({ url, mode: 'invalid' }, 'user-a', createMusicLinkStore(db), fetcher)).rejects.toThrow('invalid_mode');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
