-- Complément : le fichier complet doit pouvoir être ouvert (createSignedUrl
-- cote client, deja protege par la policy storage "buyer_read") depuis
-- "Mes achats" -- il fallait donc le master_storage_path dans la liste des
-- achats de l'acheteur. Colonne en plus => DROP necessaire (Postgres
-- refuse un CREATE OR REPLACE qui change les colonnes d'un RETURNS TABLE).
drop function if exists public.keep_artist_track_my_purchases();

create or replace function public.keep_artist_track_my_purchases()
returns table(id uuid, seller_username text, track_title text, amount_cents integer, currency_code text, status text, created_at timestamptz, track_id uuid, master_storage_path text)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select o.id, s.username, t.title, o.amount_cents, o.currency_code, o.status, o.created_at, o.track_id,
         case when o.status = 'COMPLETED' then t.master_storage_path else null end
  from public.artist_track_orders o
  join public.artist_original_tracks t on t.id = o.track_id
  join public.profiles s on s.id = o.seller_id
  where o.buyer_id = auth.uid()
  order by o.created_at desc;
$function$;
grant execute on function public.keep_artist_track_my_purchases() to authenticated;
