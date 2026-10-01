-- Chat share UX contract:
-- - paid offers are always masked server-side;
-- - any positive FREE price is allowed up to a safe ceiling;
-- - money offers accept normal cent amounts on web;
-- - shareable library includes social tracks for listening/sharing but resale rights remain separate.

create or replace function public.keep_agora_my_shareable_tracks(p_limit integer default 120)
returns table(
  id uuid,isrc text,title text,artist text,album text,artwork_url text,preview_url text,
  genres text[],provider_ids jsonb,external_urls jsonb,available_on text[],release_year smallint,
  source_profile_id uuid,source_username text,can_sell boolean
)
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,120),250));
begin
  if uid is null then return; end if;

  return query
  with ranked as (
    select
      t.id,t.isrc,t.title,t.artist,t.album,t.artwork_url,t.preview_url,
      coalesce(t.genres,array[]::text[]) genres,
      coalesce(t.provider_ids,'{}'::jsonb) provider_ids,
      coalesce(t.external_urls,'{}'::jsonb) external_urls,
      coalesce(t.available_on,array[]::text[]) available_on,
      t.release_year,
      kd.source_user_id,
      sp.username as source_username,
      public.keep_profile_can_resell_track(uid,t.id) as can_sell,
      kd.created_at,
      row_number() over (
        partition by public.keep_track_identity(t.title,t.artist)
        order by kd.created_at desc,t.id
      ) as rn
    from public.keep_decisions kd
    join public.tracks t on t.id=kd.track_id
    left join public.profiles sp on sp.id=kd.source_user_id
    where kd.profile_id=uid and kd.decision='KEPT'
  )
  select
    r.id,r.isrc,r.title,r.artist,r.album,r.artwork_url,r.preview_url,
    r.genres,r.provider_ids,r.external_urls,r.available_on,r.release_year,
    r.source_user_id,r.source_username,r.can_sell
  from ranked r
  where r.rn=1
  order by r.created_at desc
  limit v_limit;
end;
$function$;

revoke all on function public.keep_agora_my_shareable_tracks(integer) from public,anon;
grant execute on function public.keep_agora_my_shareable_tracks(integer) to authenticated;

create or replace function public.keep_agora_post_message_v4(
  p_room_slug text,
  p_body text default '',
  p_target_profile_id uuid default null,
  p_shared_track_id uuid default null,
  p_reveal_mode text default 'NONE',
  p_payment_mode text default 'NONE',
  p_free_price integer default null,
  p_price_cents integer default null,
  p_currency_code text default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_message_id bigint;
  v_mode text := upper(coalesce(nullif(trim(p_payment_mode),''),'NONE'));
  v_reveal text := upper(coalesce(nullif(trim(p_reveal_mode),''),'NONE'));
  v_currency text := upper(coalesce(nullif(trim(p_currency_code),''),'EUR'));
  v_offer_id uuid;
  v_access jsonb;
  v_seller_username text;
  v_offer_name text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_mode not in ('NONE','FREE','MONEY') then raise exception 'invalid_payment_mode' using errcode='22023'; end if;
  if v_reveal not in ('NONE','MASKED','FULL') then v_reveal := 'MASKED'; end if;

  if v_mode<>'NONE' then
    if p_target_profile_id is null then raise exception 'paid_share_requires_recipient' using errcode='22023'; end if;
    if p_shared_track_id is null then raise exception 'paid_share_requires_track' using errcode='22023'; end if;
    if p_target_profile_id=v_uid then raise exception 'cannot_offer_to_self' using errcode='22023'; end if;
    if not public.keep_profile_can_resell_track(v_uid,p_shared_track_id) then
      raise exception 'CHAT_TRACK_RESALE_FORBIDDEN' using errcode='42501';
    end if;

    -- A paid proposition can always be listened to, but identity stays hidden until unlock.
    v_reveal := 'MASKED';

    v_access := public.keep_playlist_sale_access();
    if not coalesce((v_access->>'unlocked')::boolean,false) then
      raise exception 'PLAYLIST_SALE_LOCKED:%',coalesce(v_access->>'threshold','0');
    end if;

    if v_mode='FREE' then
      if coalesce(p_free_price,0) < 1 or p_free_price > 1000 then
        raise exception 'FREE_PRICE_OUT_OF_RANGE' using errcode='22023';
      end if;
    else
      if coalesce(p_price_cents,0) < 50 or p_price_cents > 10000000 then
        raise exception 'MONEY_PRICE_OUT_OF_RANGE' using errcode='22023';
      end if;
    end if;

    if exists(
      select 1
      from public.playlist_sale_payments pay
      join public.playlist_sale_offers o on o.id=pay.offer_id
      join public.playlist_sale_offer_tracks ot on ot.offer_id=o.id
      where o.seller_id=v_uid
        and o.target_buyer_id=p_target_profile_id
        and public.keep_profile_has_track(p_target_profile_id,p_shared_track_id)
        and ot.track_id=p_shared_track_id
        and pay.status='COMPLETED'
    ) then
      raise exception 'RECIPIENT_ALREADY_OWNS_TRACK' using errcode='23505';
    end if;

    if public.keep_profile_has_track(p_target_profile_id,p_shared_track_id) then
      raise exception 'RECIPIENT_ALREADY_OWNS_TRACK' using errcode='23505';
    end if;

    if exists(
      select 1
      from public.playlist_sale_payments pay
      join public.playlist_sale_offers o on o.id=pay.offer_id
      join public.playlist_sale_offer_tracks ot on ot.offer_id=o.id
      where o.seller_id=v_uid
        and o.target_buyer_id=p_target_profile_id
        and ot.track_id=p_shared_track_id
        and pay.status='PENDING'
    ) then
      raise exception 'CHAT_TRACK_OFFER_ALREADY_PENDING' using errcode='23505';
    end if;

    update public.playlist_sale_offers o
    set is_active=false,updated_at=now()
    where o.seller_id=v_uid
      and o.target_buyer_id=p_target_profile_id
      and o.is_active=true
      and exists(select 1 from public.playlist_sale_offer_tracks ot where ot.offer_id=o.id and ot.track_id=p_shared_track_id);
  end if;

  v_message_id := public.keep_agora_post_message_v2(
    p_room_slug,p_body,p_target_profile_id,p_shared_track_id,v_reveal
  );

  if v_mode='NONE' then
    return jsonb_build_object('messageId',v_message_id,'offerId',null,'paymentMode','NONE','revealMode',v_reveal);
  end if;

  select username into v_seller_username from public.profiles where id=v_uid;
  v_offer_id := gen_random_uuid();
  v_offer_name := 'Pépite Tchat · @'||coalesce(v_seller_username,'Loki');

  insert into public.playlist_sale_offers(
    id,seller_id,playlist_id,playlist_name,price_cents,currency_code,
    is_active,payment_mode,free_price,target_buyer_id
  ) values(
    v_offer_id,v_uid,'keep-chat:'||v_message_id::text,v_offer_name,
    case when v_mode='MONEY' then p_price_cents else 0 end,
    v_currency,true,v_mode,case when v_mode='FREE' then p_free_price else null end,p_target_profile_id
  );

  insert into public.playlist_sale_offer_tracks(offer_id,track_id)
  values(v_offer_id,p_shared_track_id);

  update public.music_agora_messages
  set sale_offer_id=v_offer_id,music_reveal_mode='MASKED'
  where id=v_message_id and profile_id=v_uid;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values(
    p_target_profile_id,'AGORA_MUSIC_OFFER','♫ Une pépite t’attend',
    '@'||coalesce(v_seller_username,'membre')||' te propose une musique '||
      case when v_mode='FREE' then 'pour '||p_free_price||' FREE.'
           else 'pour '||to_char(p_price_cents/100.0,'FM999999990D00')||' '||v_currency||'.' end,
    jsonb_build_object(
      'event','AGORA_MUSIC_OFFER','roomSlug',p_room_slug,'messageId',v_message_id,
      'offerId',v_offer_id,'senderId',v_uid,'senderUsername',v_seller_username,
      'sharedTrackId',p_shared_track_id,'paymentMode',v_mode,
      'freePrice',case when v_mode='FREE' then p_free_price else null end,
      'priceCents',case when v_mode='MONEY' then p_price_cents else 0 end,
      'currencyCode',v_currency,'soundKind','social'
    ),
    'CREATED',0
  );

  return jsonb_build_object(
    'messageId',v_message_id,'offerId',v_offer_id,'paymentMode',v_mode,'revealMode','MASKED',
    'freePrice',case when v_mode='FREE' then p_free_price else null end,
    'priceCents',case when v_mode='MONEY' then p_price_cents else 0 end,'currencyCode',v_currency
  );
end;
$function$;

revoke all on function public.keep_agora_post_message_v4(text,text,uuid,uuid,text,text,integer,integer,text) from public,anon;
grant execute on function public.keep_agora_post_message_v4(text,text,uuid,uuid,text,text,integer,integer,text) to authenticated;
