-- Ensure chat-targeted single-track offers use the same canonical
-- offer-track lookup path as playlist selections, so FREE/money delivery
-- resolves the track instead of producing OFFER_HAS_NO_TRACKS.

create or replace function public.keep_agora_post_message_v3(
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
  v_currency text := upper(coalesce(nullif(trim(p_currency_code),''),'EUR'));
  v_offer_id uuid;
  v_access jsonb;
  v_owned boolean := false;
  v_seller_username text;
  v_offer_name text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_mode not in ('NONE','FREE','MONEY') then raise exception 'invalid_payment_mode' using errcode='22023'; end if;

  if v_mode<>'NONE' then
    if p_target_profile_id is null then raise exception 'paid_share_requires_recipient' using errcode='22023'; end if;
    if p_shared_track_id is null then raise exception 'paid_share_requires_track' using errcode='22023'; end if;
    if p_target_profile_id=v_uid then raise exception 'cannot_offer_to_self' using errcode='22023'; end if;

    v_access := public.keep_playlist_sale_access();
    if not coalesce((v_access->>'unlocked')::boolean,false) then
      raise exception 'PLAYLIST_SALE_LOCKED:%',coalesce(v_access->>'threshold','0');
    end if;

    select exists(
      select 1
      from public.keep_decisions kd
      where kd.profile_id=v_uid
        and kd.track_id=p_shared_track_id
        and kd.decision='KEPT'
        and kd.source_user_id is null
      union all
      select 1
      from public.playlist_tracks pt
      join public.playlists pl on pl.id=pt.playlist_id
      where pl.owner_id=v_uid and pt.track_id=p_shared_track_id
      limit 1
    ) into v_owned;
    if not v_owned then raise exception 'TRACK_NOT_OWNED_FOR_SALE' using errcode='42501'; end if;

    if v_mode='FREE' then
      if p_free_price is null or p_free_price not in (1,3,5,10,20,50,100) then
        raise exception 'FREE_PRICE_MUST_BE_A_PRESET_AMOUNT' using errcode='22023';
      end if;
    else
      if coalesce(p_price_cents,0) not in (50,100,200,300,500,1000) then
        raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT' using errcode='22023';
      end if;
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
      and exists(
        select 1 from public.playlist_sale_offer_tracks ot
        where ot.offer_id=o.id and ot.track_id=p_shared_track_id
      );
  end if;

  v_message_id := public.keep_agora_post_message_v2(
    p_room_slug,p_body,p_target_profile_id,p_shared_track_id,p_reveal_mode
  );

  if v_mode='NONE' then
    return jsonb_build_object('messageId',v_message_id,'offerId',null,'paymentMode','NONE');
  end if;

  select username into v_seller_username from public.profiles where id=v_uid;
  v_offer_id := gen_random_uuid();
  v_offer_name := 'Pépite Tchat · @'||coalesce(v_seller_username,'Loki');

  insert into public.playlist_sale_offers(
    id,seller_id,playlist_id,playlist_name,price_cents,currency_code,
    is_active,payment_mode,free_price,target_buyer_id
  )
  values(
    v_offer_id,v_uid,'keep-selection:'||v_offer_id::text,v_offer_name,
    case when v_mode='MONEY' then p_price_cents else 0 end,
    v_currency,true,v_mode,case when v_mode='FREE' then p_free_price else null end,
    p_target_profile_id
  );

  insert into public.playlist_sale_offer_tracks(offer_id,track_id)
  values(v_offer_id,p_shared_track_id);

  update public.music_agora_messages
  set sale_offer_id=v_offer_id
  where id=v_message_id and profile_id=v_uid;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values(
    p_target_profile_id,
    'AGORA_MUSIC_OFFER',
    '♫ Une pépite t’attend',
    '@'||coalesce(v_seller_username,'membre')||' te propose une musique '||
      case when v_mode='FREE' then 'pour '||p_free_price||' FREE.'
           else 'pour '||to_char(p_price_cents/100.0,'FM999990D00')||' '||v_currency||'.' end,
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
    'messageId',v_message_id,'offerId',v_offer_id,'paymentMode',v_mode,
    'freePrice',case when v_mode='FREE' then p_free_price else null end,
    'priceCents',case when v_mode='MONEY' then p_price_cents else 0 end,
    'currencyCode',v_currency
  );
end;
$function$;

revoke all on function public.keep_agora_post_message_v3(text,text,uuid,uuid,text,text,integer,integer,text) from public,anon;
grant execute on function public.keep_agora_post_message_v3(text,text,uuid,uuid,text,text,integer,integer,text) to authenticated;
