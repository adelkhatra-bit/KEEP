-- Compatibilité des binaires déjà installés avec le fanout ciblé/batché.
-- v5 ne doit plus envoyer directement les notifications FREE dans la transaction.

create or replace function public.keep_playlist_sale_set_offer_for_selection_v6(
  p_track_ids uuid[],
  p_name text,
  p_payment_mode text,
  p_price_cents integer default null,
  p_free_price integer default null,
  p_currency_code text default 'EUR',
  p_cover_url text default null,
  p_allow_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  access jsonb;
  clean_name text := coalesce(nullif(trim(p_name),''),'Sélection Loki');
  clean_mode text := upper(coalesce(nullif(trim(p_payment_mode),''),'MONEY'));
  clean_currency text := upper(coalesce(nullif(trim(p_currency_code),''),'EUR'));
  clean_cover text := nullif(trim(coalesce(p_cover_url,'')),'');
  clean_money integer := coalesce(p_price_cents,0);
  clean_free integer := p_free_price;
  new_offer_id uuid := gen_random_uuid();
  clean_ids uuid[];
  conflict_track_ids uuid[] := array[]::uuid[];
  row_result public.playlist_sale_offers%rowtype;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_ids is null or array_length(p_track_ids,1) is null then raise exception 'TRACK_SELECTION_REQUIRED'; end if;
  if array_length(p_track_ids,1)>200 then raise exception 'TRACK_SELECTION_TOO_LARGE'; end if;
  if clean_mode not in ('MONEY','FREE') then raise exception 'PAYMENT_MODE_INVALID'; end if;

  if clean_mode='MONEY' then
    if clean_money not in (50,100,200,300,500,1000) then raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    clean_free := null;
  else
    if clean_free is null or clean_free not in (1,3,5,10,20,50,100) then raise exception 'FREE_PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    clean_money := 0;
  end if;

  if length(clean_name)>100 then raise exception 'PLAYLIST_NAME_TOO_LONG'; end if;
  if clean_cover is not null and clean_cover !~* '^https://' then raise exception 'COVER_URL_MUST_BE_HTTPS'; end if;

  access := public.keep_playlist_sale_access();
  if not (access->>'unlocked')::boolean then raise exception 'PLAYLIST_SALE_LOCKED:%',(access->>'threshold'); end if;

  select coalesce(array_agg(distinct candidate.track_id),array[]::uuid[])
  into clean_ids
  from (
    select pt.track_id
    from public.playlist_tracks pt
    join public.playlists pl on pl.id=pt.playlist_id
    where pl.owner_id=uid and pt.track_id=any(p_track_ids)
    union
    select kd.track_id
    from public.keep_decisions kd
    where kd.profile_id=uid and kd.decision='KEPT' and kd.track_id=any(p_track_ids)
  ) candidate
  where not exists (
    select 1
    from public.keep_decisions kd2
    where kd2.profile_id=uid
      and kd2.track_id=candidate.track_id
      and kd2.decision='KEPT'
      and kd2.source_user_id is not null
  );

  if array_length(clean_ids,1) is null
     or array_length(clean_ids,1) <> array_length((select array_agg(distinct x) from unnest(p_track_ids) x),1)
  then
    raise exception 'TRACK_SELECTION_NOT_OWNED';
  end if;
  if cardinality(clean_ids)<2 then raise exception 'COLLECTION_MIN_TWO_TRACKS'; end if;

  select coalesce(array_agg(distinct ot.track_id),array[]::uuid[])
  into conflict_track_ids
  from public.playlist_sale_offer_tracks ot
  join public.playlist_sale_offers o on o.id=ot.offer_id
  where o.seller_id=uid
    and o.is_active=true
    and ot.track_id=any(clean_ids);

  if cardinality(conflict_track_ids)>0 and not p_allow_existing then
    raise exception 'TRACK_ALREADY_IN_ACTIVE_OFFER:%',cardinality(conflict_track_ids);
  end if;

  insert into public.playlist_sale_offers(
    id,seller_id,playlist_id,playlist_name,price_cents,currency_code,cover_url,payment_mode,free_price
  )
  values(
    new_offer_id,uid,'keep-selection:'||new_offer_id::text,clean_name,clean_money,clean_currency,clean_cover,clean_mode,clean_free
  )
  returning * into row_result;

  insert into public.playlist_sale_offer_tracks(offer_id,track_id)
  select new_offer_id,t from unnest(clean_ids) t;

  perform public.keep_enqueue_playlist_sale_fanout(new_offer_id);

  return jsonb_build_object(
    'id',row_result.id,
    'offerId',row_result.id,
    'playlistId',row_result.playlist_id,
    'playlistName',row_result.playlist_name,
    'paymentMode',row_result.payment_mode,
    'priceCents',row_result.price_cents,
    'freePrice',row_result.free_price,
    'currencyCode',row_result.currency_code,
    'trackCount',array_length(clean_ids,1),
    'reusedTrackCount',cardinality(conflict_track_ids)
  );
end;
$$;

revoke all on function public.keep_playlist_sale_set_offer_for_selection_v6(uuid[],text,text,integer,integer,text,text,boolean) from public, anon;
grant execute on function public.keep_playlist_sale_set_offer_for_selection_v6(uuid[],text,text,integer,integer,text,text,boolean) to authenticated;

create or replace function public.keep_playlist_sale_set_offer_for_selection_v5(
  p_track_ids uuid[],
  p_name text,
  p_payment_mode text,
  p_price_cents integer default null,
  p_free_price integer default null,
  p_currency_code text default 'EUR',
  p_cover_url text default null,
  p_allow_existing boolean default false
)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select public.keep_playlist_sale_set_offer_for_selection_v6(
    p_track_ids,p_name,p_payment_mode,p_price_cents,p_free_price,
    p_currency_code,p_cover_url,p_allow_existing
  );
$$;

revoke all on function public.keep_playlist_sale_set_offer_for_selection_v5(uuid[],text,text,integer,integer,text,text,boolean) from public, anon;
grant execute on function public.keep_playlist_sale_set_offer_for_selection_v5(uuid[],text,text,integer,integer,text,text,boolean) to authenticated;
