-- Chat payment UX hardening:
-- - 2,000-char messages while the client panel stays fixed-height
-- - versioned marketplace/payment terms acceptance
-- - dedicated PayPal QR sharing (no generic image upload in chat)
-- - seller/buyer payment state lookup for in-chat delivery confirmation

create or replace function public.keep_agora_post_message_v2(
  p_room_slug text,
  p_body text default ''::text,
  p_target_profile_id uuid default null::uuid,
  p_shared_track_id uuid default null::uuid,
  p_reveal_mode text default 'NONE'::text
)
returns bigint
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body,''));
  v_mode text := upper(coalesce(p_reveal_mode,'NONE'));
  v_id bigint;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and p.is_public=true) then
    raise exception 'public_profile_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.music_agora_rooms r where r.slug=p_room_slug and r.is_active=true) then
    raise exception 'room_unavailable' using errcode='22023';
  end if;

  if p_shared_track_id is null and (char_length(v_body)<2 or char_length(v_body)>2000) then
    raise exception 'message_length' using errcode='22023';
  end if;
  if p_shared_track_id is not null and char_length(v_body)>2000 then
    raise exception 'message_length' using errcode='22023';
  end if;
  if v_body<>'' and public.keep_agora_contains_blocked_language(v_body) then
    raise exception 'message_blocked_language' using errcode='22023';
  end if;
  if v_mode not in ('NONE','MASKED','FULL') then raise exception 'invalid_reveal_mode' using errcode='22023'; end if;
  if p_shared_track_id is null then v_mode := 'NONE'; end if;
  if p_shared_track_id is not null and not exists(select 1 from public.tracks where id=p_shared_track_id) then
    raise exception 'track_not_found' using errcode='P0002';
  end if;

  if p_target_profile_id is not null then
    if p_target_profile_id=v_uid then raise exception 'cannot_message_self' using errcode='22023'; end if;
    if not exists(select 1 from public.profiles where id=p_target_profile_id and is_public=true) then
      raise exception 'target_unavailable' using errcode='P0002';
    end if;
    if exists(
      select 1 from public.user_blocks b
      where (b.blocker_id=v_uid and b.blocked_id=p_target_profile_id)
         or (b.blocker_id=p_target_profile_id and b.blocked_id=v_uid)
    ) then raise exception 'blocked_relationship' using errcode='42501'; end if;
  end if;

  if (select count(*) from public.music_agora_messages m where m.profile_id=v_uid and m.created_at>now()-interval '1 minute')>=4 then
    raise exception 'rate_limited' using errcode='57014';
  end if;
  if (select count(*) from public.music_agora_messages m where m.profile_id=v_uid and m.created_at>now()-interval '1 hour')>=30 then
    raise exception 'rate_limited' using errcode='57014';
  end if;

  insert into public.music_agora_messages(
    room_slug,profile_id,body,target_profile_id,shared_track_id,music_reveal_mode
  ) values(
    p_room_slug,v_uid,coalesce(nullif(v_body,''),'♫ Partage musical'),p_target_profile_id,p_shared_track_id,v_mode
  ) returning id into v_id;

  return v_id;
end;
$$;

create table if not exists public.marketplace_terms_acceptances(
  profile_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  source text not null default 'marketplace',
  accepted_at timestamptz not null default now(),
  primary key(profile_id,terms_version)
);

alter table public.marketplace_terms_acceptances enable row level security;

drop policy if exists marketplace_terms_acceptances_select_own on public.marketplace_terms_acceptances;
create policy marketplace_terms_acceptances_select_own
on public.marketplace_terms_acceptances
for select
to authenticated
using (profile_id=auth.uid());

create or replace function public.keep_marketplace_terms_status(p_version text)
returns boolean
language sql
stable
security definer
set search_path to 'public','auth'
as $$
  select exists(
    select 1 from public.marketplace_terms_acceptances
    where profile_id=auth.uid() and terms_version=trim(p_version)
  );
$$;

create or replace function public.keep_marketplace_accept_terms(p_version text,p_source text default 'marketplace')
returns timestamptz
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid:=auth.uid();
  v_version text:=nullif(trim(p_version),'');
  v_source text:=coalesce(nullif(trim(p_source),''),'marketplace');
  v_at timestamptz;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_version is null or char_length(v_version)>120 then raise exception 'invalid_terms_version' using errcode='22023'; end if;
  insert into public.marketplace_terms_acceptances(profile_id,terms_version,source,accepted_at)
  values(v_uid,v_version,left(v_source,80),now())
  on conflict(profile_id,terms_version) do update
    set accepted_at=excluded.accepted_at,source=excluded.source
  returning accepted_at into v_at;
  return v_at;
end;
$$;

revoke all on function public.keep_marketplace_terms_status(text) from public,anon;
revoke all on function public.keep_marketplace_accept_terms(text,text) from public,anon;
grant execute on function public.keep_marketplace_terms_status(text) to authenticated;
grant execute on function public.keep_marketplace_accept_terms(text,text) to authenticated;

create or replace function public.keep_agora_share_my_payout_qr(p_room_slug text,p_target_profile_id uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid:=auth.uid();
  v_qr text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_target_profile_id is null then raise exception 'qr_share_requires_recipient' using errcode='22023'; end if;
  select nullif(trim(payout_qr_url),'') into v_qr from public.profiles where id=v_uid;
  if v_qr is null then raise exception 'PAYOUT_QR_NOT_CONFIGURED'; end if;
  if v_qr !~* '^https://' then raise exception 'PAYOUT_QR_INSECURE'; end if;
  return public.keep_agora_post_message_v2(
    p_room_slug,
    '[[KEEP_PAYPAL_QR]]'||v_qr,
    p_target_profile_id,
    null,
    'NONE'
  );
end;
$$;

revoke all on function public.keep_agora_share_my_payout_qr(text,uuid) from public,anon;
grant execute on function public.keep_agora_share_my_payout_qr(text,uuid) to authenticated;

create or replace function public.keep_agora_offer_payment_states(p_offer_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid:=auth.uid();
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if coalesce(cardinality(p_offer_ids),0)=0 then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  into v_rows
  from (
    select distinct on (pay.offer_id)
      pay.offer_id as "offerId",
      pay.id as "paymentId",
      pay.status as "status",
      pay.buyer_marked_paid_at as "buyerMarkedPaidAt",
      pay.buyer_id as "buyerId",
      pay.seller_id as "sellerId"
    from public.playlist_sale_payments pay
    where pay.offer_id=any(p_offer_ids)
      and (pay.seller_id=v_uid or pay.buyer_id=v_uid)
    order by pay.offer_id,pay.created_at desc
  ) x;

  return v_rows;
end;
$$;

revoke all on function public.keep_agora_offer_payment_states(uuid[]) from public,anon;
grant execute on function public.keep_agora_offer_payment_states(uuid[]) to authenticated;
