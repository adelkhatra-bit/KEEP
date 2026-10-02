-- Adel (02/10/2026) : vendre un morceau (FREE ou €) dans un groupe privé.
-- Décision : « offre à chaque membre ». Le morceau apparaît MASQUÉ et
-- écoutable dans le groupe ; chaque membre ACTIF qui ne l'a pas encore reçoit
-- sa propre offre privée via keep_agora_post_message_v4 (circuit existant :
-- débit FREE, ou PayPal + QR, notifications PAIEMENT À FAIRE / SIGNALÉ,
-- validation vendeur, déblocage). Les membres qui l'ont déjà ne paient rien.
-- Aucune nouvelle logique de paiement, aucune donnée existante modifiée.

create or replace function public.keep_agora_post_group_offer(
  p_group_id uuid,
  p_body text default '',
  p_shared_track_id uuid default null,
  p_payment_mode text default 'FREE',
  p_free_price integer default null,
  p_price_cents integer default null,
  p_currency_code text default 'EUR',
  p_reply_to_message_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_mode text := upper(coalesce(nullif(trim(p_payment_mode),''),'FREE'));
  v_group_name text;
  v_group_message_id bigint;
  v_access jsonb;
  v_member record;
  v_sent integer := 0;
  v_already integer := 0;
  v_pending integer := 0;
  v_state text;
  v_body text := btrim(coalesce(p_body,''));
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_mode not in ('FREE','MONEY') then raise exception 'invalid_payment_mode' using errcode='22023'; end if;
  if p_shared_track_id is null then raise exception 'paid_share_requires_track' using errcode='22023'; end if;

  select g.name into v_group_name
  from public.music_agora_groups g
  join public.music_agora_group_members m on m.group_id=g.id
  where g.id=p_group_id and m.profile_id=v_uid and m.status='ACTIVE';
  if v_group_name is null then raise exception 'group_membership_required' using errcode='42501'; end if;

  -- Mêmes garde-fous que la vente privée, vérifiés une seule fois.
  if not public.keep_profile_can_resell_track(v_uid,p_shared_track_id) then
    raise exception 'CHAT_TRACK_RESALE_FORBIDDEN' using errcode='42501';
  end if;
  v_access := public.keep_playlist_sale_access();
  if not coalesce((v_access->>'unlocked')::boolean,false) then
    raise exception 'PLAYLIST_SALE_LOCKED:%',coalesce(v_access->>'threshold','0');
  end if;
  if v_mode='FREE' and (coalesce(p_free_price,0) < 1 or p_free_price > 1000) then
    raise exception 'FREE_PRICE_OUT_OF_RANGE' using errcode='22023';
  end if;
  if v_mode='MONEY' and (coalesce(p_price_cents,0) < 50 or p_price_cents > 10000000) then
    raise exception 'MONEY_PRICE_OUT_OF_RANGE' using errcode='22023';
  end if;

  -- 1. Le morceau dans le groupe : masqué, écoutable.
  v_group_message_id := public.keep_agora_post_group_message_v2(
    p_group_id, v_body, p_shared_track_id, 'MASKED', p_reply_to_message_id
  );

  -- 2. Une offre privée par membre actif (hors vendeur).
  for v_member in
    select m.profile_id
    from public.music_agora_group_members m
    where m.group_id=p_group_id and m.status='ACTIVE' and m.profile_id<>v_uid
  loop
    begin
      perform public.keep_agora_post_message_v4(
        'place',
        '🎁 Pépite du groupe « ' || v_group_name || ' »',
        v_member.profile_id,
        p_shared_track_id,
        'MASKED',
        v_mode,
        p_free_price,
        p_price_cents,
        coalesce(p_currency_code,'EUR')
      );
      v_sent := v_sent + 1;
    exception when others then
      v_state := sqlerrm;
      if v_state like '%RECIPIENT_ALREADY_OWNS_TRACK%' then
        v_already := v_already + 1;
      elsif v_state like '%CHAT_TRACK_OFFER_ALREADY_PENDING%' then
        v_pending := v_pending + 1;
      else
        raise;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'groupMessageId', v_group_message_id,
    'offersSent', v_sent,
    'alreadyOwned', v_already,
    'alreadyPending', v_pending,
    'paymentMode', v_mode
  );
end;
$function$;
revoke all on function public.keep_agora_post_group_offer(uuid,text,uuid,text,integer,integer,text,bigint) from public, anon;
grant execute on function public.keep_agora_post_group_offer(uuid,text,uuid,text,integer,integer,text,bigint) to authenticated;
