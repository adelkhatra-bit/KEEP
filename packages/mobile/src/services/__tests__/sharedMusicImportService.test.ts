const mockInvoke = jest.fn();
const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
let mockAccount: any;
jest.mock('../supabaseClient', () => ({
  supabase: { functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    auth: { getUser: () => mockGetUser() }, rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args) },
}));
jest.mock('../../store/useUserStore', () => ({ useUserStore: { getState: () => mockAccount } }));

import { loadMyMusicStats, loadSharedMusicLibrary, musicLinkFromText, resolveSharedMusicLink, useSharedMusicImportStore } from '../sharedMusicImportService';
const url = 'https://open.spotify.com/track/abc';
const track = { title: 'Titre', artist: 'Artiste', isrc: 'FR123', platformLinks: { spotify: url } };

describe('Import partagé musique — compte, aperçu, idempotence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccount = { user: { id: 'owner' }, isDemoMode: false, isLocalGuest: false };
    mockGetUser.mockResolvedValue({ data: { user: { id: 'owner', is_anonymous: false } }, error: null });
    mockInvoke.mockResolvedValue({ data: { track, imported: true }, error: null });
    useSharedMusicImportStore.setState({ revision: 0, ownerId: null, message: null });
  });
  it.each([
    { user: null, isDemoMode: false, isLocalGuest: false },
    { user: { id: 'demo' }, isDemoMode: true, isLocalGuest: false },
    { user: { id: 'guest' }, isDemoMode: false, isLocalGuest: true },
  ])('refuse démo/invité avant toute requête', async (account) => {
    mockAccount = account;
    await expect(resolveSharedMusicLink(url)).rejects.toThrow('Connecte-toi');
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
  it('refuse une identité anonyme ou différente', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'owner', is_anonymous: true } } });
    await expect(resolveSharedMusicLink(url)).rejects.toThrow('Connecte-toi');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other' } } });
    await expect(resolveSharedMusicLink(url)).rejects.toThrow('Connecte-toi');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
  it('revérifie la démo juste avant invoke', async () => {
    mockGetUser.mockImplementation(async () => {
      mockAccount.isDemoMode = true;
      return { data: { user: { id: 'owner' } } };
    });
    await expect(resolveSharedMusicLink(url)).rejects.toThrow('Démo');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
  it('aperçu sans écriture ni toast/refresh', async () => {
    mockInvoke.mockResolvedValue({ data: { track }, error: null });
    await expect(resolveSharedMusicLink(url, true)).resolves.toEqual({ track });
    expect(mockInvoke).toHaveBeenCalledWith('keep-resolve-music-link', { body: { url, preview: true } });
    expect(useSharedMusicImportStore.getState().revision).toBe(0);
  });
  it('import confirmé déclenche toast et refresh propriétaire', async () => {
    await resolveSharedMusicLink(url);
    expect(mockInvoke).toHaveBeenCalledWith('keep-resolve-music-link', { body: { url } });
    expect(useSharedMusicImportStore.getState()).toMatchObject({ revision: 1, ownerId: 'owner', message: 'Ajouté à ton profil' });
  });
  it('doublon confirmé ne fabrique pas un nouveau GARDER', async () => {
    mockInvoke.mockResolvedValue({ data: { track, imported: false, alreadyImported: true } });
    await resolveSharedMusicLink(url);
    expect(useSharedMusicImportStore.getState().message).toBe('Déjà dans ton profil');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('erreur reste rejouable sans annoncer un ajout', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('network') });
    await expect(resolveSharedMusicLink(url)).rejects.toThrow('Réessaie');
    expect(useSharedMusicImportStore.getState().revision).toBe(0);
    await resolveSharedMusicLink(url);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(useSharedMusicImportStore.getState().message).toBe('Ajouté à ton profil');
  });
  it('refuse un succès sans confirmation persistée', async () => {
    mockInvoke.mockResolvedValue({ data: { track }, error: null });
    await expect(resolveSharedMusicLink(url)).rejects.toThrow('n’a pas été ajoutée');
    expect(useSharedMusicImportStore.getState().revision).toBe(0);
  });
  it('extrait le lien du presse-papiers sans clavier', () => {
    expect(musicLinkFromText(`Écoute ça ${url}`)).toBe(url);
    expect(() => musicLinkFromText('pas de lien')).toThrow('Copie un lien');
  });
  it('lit uniquement la bibliothèque propriétaire active', async () => {
    const query: any = {};
    for (const method of ['select', 'eq', 'is', 'order']) query[method] = jest.fn(() => query);
    query.limit = jest.fn(async () => ({ data: [{ id: 'import-1', title: 'Titre' }] }));
    mockFrom.mockReturnValue(query);
    const rows = await loadSharedMusicLibrary();
    expect(rows).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith('music_library_items');
    expect(query.eq).toHaveBeenCalledWith('profile_id', 'owner');
    expect(query.is).toHaveBeenCalledWith('removed_at', null);
  });
  it('statistiques exactes serveur sans déductions locales', async () => {
    const stats = { genres: [{ name: 'House', count: 7 }], artists: [{ name: 'Artiste', count: 4 }],
      hearts: 9, dislikes: 2, keeps: 12, imported: { spotify: 8, deezer: 3 } };
    mockRpc.mockResolvedValue({ data: stats, error: null });
    await expect(loadMyMusicStats()).resolves.toEqual({
      topGenres: stats.genres, topArtists: stats.artists, hearts: 9, dislikes: 2, keeps: 12, importedByPlatform: stats.imported,
    });
    expect(mockRpc).toHaveBeenCalledWith('keep_my_music_stats');
    expect(mockFrom).not.toHaveBeenCalled();
  });
  it('normalise les libellés et scores documentés sans inventer de compteurs', async () => {
    mockRpc.mockResolvedValue({ data: {
      genres: [{ taste_key: 'house', score: 0.75 }, { label: 'Jazz', count: 0 }],
      artists: [{ label: 'Artiste', score: 4 }], hearts: 0, dislikes: 0, keeps: 0, imported: { spotify: 0 },
    }, error: null });
    await expect(loadMyMusicStats()).resolves.toEqual({
      topGenres: [{ name: 'house', count: 0.75 }, { name: 'Jazz', count: 0 }],
      topArtists: [{ name: 'Artiste', count: 4 }], hearts: 0, dislikes: 0, keeps: 0, importedByPlatform: { spotify: 0 },
    });
  });
  it('accepte la réponse canonique du parcours navigateur CI', async () => {
    mockRpc.mockResolvedValue({ data: {
      genres: [{ name: 'Pop', score: 2 }], artists: [{ name: 'Artiste CI', score: 2 }],
      hearts: 3, dislikes: 1, keeps: 4, imported: { youtube: 1 },
    }, error: null });
    await expect(loadMyMusicStats()).resolves.toEqual({
      topGenres: [{ name: 'Pop', count: 2 }], topArtists: [{ name: 'Artiste CI', count: 2 }],
      hearts: 3, dislikes: 1, keeps: 4, importedByPlatform: { youtube: 1 },
    });
  });
  it.each([
    { genres: [{ name: 'House' }], artists: [], hearts: 0, dislikes: 0, keeps: 0, imported: {} },
    { genres: [], artists: [{}], hearts: 0, dislikes: 0, keeps: 0, imported: {} },
    { genres: [], artists: [], hearts: null, dislikes: 0, keeps: 0, imported: {} },
    { genres: [], artists: [], hearts: 0, dislikes: 0, keeps: 0, imported: { spotify: null } },
    { genres: [], artists: [], hearts: 0, dislikes: 0, keeps: 0 },
    { topGenres: [], topArtists: [], hearts: 0, dislikes: 0, keeps: 0, importedByPlatform: {} },
  ])('refuse une réponse stats incomplète au lieu de fabriquer des zéros', async (data) => {
    mockRpc.mockResolvedValue({ data, error: null });
    await expect(loadMyMusicStats()).rejects.toThrow('indisponibles');
  });
  it('statistiques manquantes ne deviennent jamais zéro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('unavailable') });
    await expect(loadMyMusicStats()).rejects.toThrow('indisponibles');
    mockRpc.mockResolvedValue({ data: {}, error: null });
    await expect(loadMyMusicStats()).rejects.toThrow('indisponibles');
  });
});
