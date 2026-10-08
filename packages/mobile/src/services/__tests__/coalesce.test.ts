import { coalesced, throttledBeat, __resetCoalesceForTests } from '../coalesce';
import * as fs from 'fs';
import * as path from 'path';
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe('chargement du profil moins lourd (Adel, 06/10/2026)', () => {
  beforeEach(() => __resetCoalesceForTests());
  it('des appels identiques simultanés partagent UNE seule requête, sans cache ensuite', async () => {
    let calls = 0;
    const run = () => new Promise<number>((resolve) => { calls += 1; setTimeout(() => resolve(calls), 5); });
    const results = await Promise.all([coalesced('k', run), coalesced('k', run), coalesced('k', run)]);
    expect(calls).toBe(1);
    expect(results).toEqual([1, 1, 1]);
    expect(await coalesced('k', run)).toBe(2); // nouvelle requête : donnée jamais périmée
  });
  it('des clés différentes ne se mélangent pas', async () => {
    let calls = 0;
    await Promise.all([coalesced('a', async () => { calls += 1; }), coalesced('b', async () => { calls += 1; })]);
    expect(calls).toBe(2);
  });
  it('battement : au plus un envoi par fenêtre, et une erreur permet de réessayer tout de suite', async () => {
    let t = 1_000_000; let sent = 0;
    const now = () => t;
    await throttledBeat('p', 15000, async () => { sent += 1; }, now);
    t += 3000; await throttledBeat('p', 15000, async () => { sent += 1; }, now);
    expect(sent).toBe(1);
    t += 15000; await throttledBeat('p', 15000, async () => { sent += 1; }, now);
    expect(sent).toBe(2);
    await expect(throttledBeat('q', 15000, async () => { throw new Error('x'); }, now)).rejects.toThrow('x');
    await throttledBeat('q', 15000, async () => { sent += 1; }, now);
    expect(sent).toBe(3);
  });
  it('branché sur les lectures répétées du profil et le ping Battle', () => {
    expect(read('../lokiPulseService.ts')).toContain('coalesced(');
    expect(read('../freeWalletService.ts')).toContain('coalesced(');
    expect(read('../keepBattleLiveService.ts')).toContain("throttledBeat('manual-availability-ping', 15000");
  });
});

describe('mise en story sans GARDER, musique libre non certifiée (Adel, 06/10/2026)', () => {
  it('le lecteur propose la mise en story gratuite quand la musique n’a pas de propriétaire, avec anti-doublon', () => {
    const deck = read('../../components/MusicSwipeDeckModal.tsx');
    expect(deck).toContain('shareFreeToStory(toShare)');
    expect(deck).toContain('Libre · à découvrir par toi');
    expect(deck).toContain('Pas de doublon.');
    expect(deck).toContain('firstDiscoveryFreeLabel(current.id, originsConfirmed, firstOrigins)');
    expect(deck).not.toContain("Cette musique n’a pas de source publique à partager.");
  });
  it('le serveur ne crée jamais de doublon et protège les musiques en vente', () => {
    const sql = read('../../../../../supabase/migrations/20261006120000_story_free_pin.sql');
    expect(sql).toContain("raise exception 'SALE_PROTECTED'");
    expect(sql).toContain('alreadyPinned');
    expect(sql).toContain('on conflict (profile_id, track_id)');
    expect(read('../musicStoriesService.ts')).toContain("rpc('keep_pin_free_story_track'");
  });
});
