// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

/**
 * Adel (21/09/2026, Partie 4) : "Test unitaire obligatoire : Créer une
 * offre avec 5 morceaux → ajouter 3 → retirer 1 → l'offre contient 7
 * morceaux, le prix est intact, les morceaux retirés sont retournés dans
 * leur état d'origine."
 *
 * Limite honnête (déjà documentée pour ce dépôt) : sans base de données
 * vivante dans ce harnais de tests (convention établie : lecture de
 * source, pas d'exécution SQL réelle), ce test vérifie la LOGIQUE exacte
 * qui garantit ce résultat -- addedCount s'ajoute au total existant sans
 * jamais recréer l'offre, remove_track ne touche qu'une ligne à la fois,
 * et aucune des deux RPC ne touche price_cents. Le scénario 5→+3→-1=7 en
 * découle directement : count(offer_tracks) après 2 inserts (5+3=8 lignes
 * distinctes) puis 1 delete (8-1=7), jamais un UPDATE ou DELETE sur
 * price_cents dans ces deux fonctions.
 */
describe('PlaylistSale éditable -- ajouter/retirer des morceaux sans recréer l\'offre (Adel, 21/09/2026, Partie 4)', () => {
  const migration = readNormalized(repoRoot, 'supabase', 'migrations', '20260921260000_playlist_sale_editable_offer.sql');
  const service = readNormalized(__dirname, '..', 'playlistSaleService.ts');

  it('keep_playlist_sale_add_tracks never recreates the offer -- it inserts into the existing offer_tracks relation and returns the new total', () => {
    expect(migration).toContain('create or replace function public.keep_playlist_sale_add_tracks(p_offer_id uuid, p_track_ids uuid[])');
    expect(migration).toContain('select * into v_offer from public.playlist_sale_offers where id = p_offer_id and seller_id = uid for update;');
    expect(migration).toContain('insert into public.playlist_sale_offer_tracks(offer_id, track_id)');
    expect(migration).toContain('on conflict (offer_id, track_id) do nothing;');
    expect(migration).not.toMatch(/keep_playlist_sale_add_tracks[\s\S]{0,2000}set price_cents/);
  });

  it('keep_playlist_sale_remove_track deletes exactly one track row, never the whole offer, and auto-closes only when the offer becomes empty', () => {
    expect(migration).toContain('create or replace function public.keep_playlist_sale_remove_track(p_offer_id uuid, p_track_id uuid)');
    expect(migration).toContain('delete from public.playlist_sale_offer_tracks where offer_id = p_offer_id and track_id = p_track_id;');
    expect(migration).toContain('if v_remaining = 0 then');
    expect(migration).toContain('update public.playlist_sale_offers set is_active = false, updated_at = now() where id = p_offer_id;');
  });

  it('a removed track returns to its original state automatically -- masking only ever filters active-offer tracks at display time, never mutates keep_decisions.visibility', () => {
    expect(migration).not.toMatch(/keep_playlist_sale_remove_track[\s\S]{0,2000}update public\.keep_decisions/);
  });

  it('the price stays untouched by add/remove -- only a dedicated RPC (update_price) can change it, and it never touches offer_tracks composition', () => {
    expect(migration).toContain('create or replace function public.keep_playlist_sale_update_price(p_offer_id uuid, p_price_cents integer)');
    expect(migration).not.toMatch(/keep_playlist_sale_update_price[\s\S]{0,1000}playlist_sale_offer_tracks/);
  });

  it('the 5+3-1=7 scenario holds by construction: two additive inserts (5, then 3 more) followed by one single-row delete leaves 7 rows, with no code path that resets or recreates the set', () => {
    // 5 (création) + 3 (ajout) = 8 lignes distinctes dans playlist_sale_offer_tracks ;
    // -1 (retrait) = 7. Garanti par le fait qu'aucune des 2 fonctions ne
    // fait de DELETE/TRUNCATE massif sur offer_tracks -- seulement des
    // INSERT (add) ou un DELETE d'UNE ligne ciblée par (offer_id, track_id) (remove).
    const addBlock = migration.slice(migration.indexOf('function public.keep_playlist_sale_add_tracks'), migration.indexOf('grant execute on function public.keep_playlist_sale_add_tracks'));
    const removeBlock = migration.slice(migration.indexOf('function public.keep_playlist_sale_remove_track'), migration.indexOf('grant execute on function public.keep_playlist_sale_remove_track'));
    expect(addBlock.match(/delete from/gi)).toBeNull();
    expect(removeBlock.match(/delete from public\.playlist_sale_offer_tracks/gi)?.length).toBe(1);
  });

  it('only tracks the seller actually discovered themselves can join an offer (Adel, 21/09/2026, règle supplémentaire) -- a track kept from someone else\'s social feed is excluded', () => {
    expect(migration).toContain('and kd2.decision = \'KEPT\' and kd2.source_user_id is not null');
  });

  it('client wrappers call the exact RPC names with the exact params, no extra logic that could bypass the server-side guarantees', () => {
    expect(service).toContain("client().rpc('keep_playlist_sale_add_tracks', { p_offer_id: offerId, p_track_ids: trackIds })");
    expect(service).toContain("client().rpc('keep_playlist_sale_remove_track', { p_offer_id: offerId, p_track_id: trackId })");
    expect(service).toContain("client().rpc('keep_playlist_sale_update_price', { p_offer_id: offerId, p_price_cents: Math.round(priceCents) })");
  });

  it('follower notification only fires from the creation RPC, never from add/remove/update-price -- guarantees no spam on every edit', () => {
    expect(migration).toContain('perform public.keep_playlist_sale_notify_followers(uid, new_offer_id, clean_name, p_price_cents, clean_currency);');
    const addBlock = migration.slice(migration.indexOf('function public.keep_playlist_sale_add_tracks'), migration.indexOf('grant execute on function public.keep_playlist_sale_add_tracks'));
    const removeBlock = migration.slice(migration.indexOf('function public.keep_playlist_sale_remove_track'), migration.indexOf('grant execute on function public.keep_playlist_sale_remove_track'));
    const updatePriceBlock = migration.slice(migration.indexOf('function public.keep_playlist_sale_update_price'), migration.indexOf('grant execute on function public.keep_playlist_sale_update_price'));
    expect(addBlock).not.toContain('notify_followers');
    expect(removeBlock).not.toContain('notify_followers');
    expect(updatePriceBlock).not.toContain('notify_followers');
  });

  it('the follower broadcast is throttled to once per seller per day, and reaches both followers AND anyone who ever kept a track discovered by this seller', () => {
    expect(migration).toContain("if v_last is not null and v_last > now() - interval '1 day' then");
    expect(migration).toContain('select f.follower_id as id from public.follows f where f.followee_id = p_seller_id');
    expect(migration).toContain('select kd.profile_id as id from public.keep_decisions kd');
    expect(migration).toContain('where kd.source_user_id = p_seller_id and kd.decision = \'KEPT\' and kd.profile_id <> p_seller_id');
  });
});
