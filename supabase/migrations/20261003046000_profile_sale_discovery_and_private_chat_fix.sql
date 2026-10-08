-- Loki Music · ventes privées chat distinctes des ventes publiques + découverte vendeurs.
-- 1) Le garde anti-doublon strict s'applique aux offres PUBLIQUES seulement.
-- 2) Les offres privées ciblées du chat/groupe restent indépendantes.
-- 3) La recommandation profil peut découvrir des vendeurs sans lien social préalable.
-- 4) BOTH exige les mêmes garanties PayPal/conditions que MONEY.

create or replace function public.keep_playlist_sale_unique_active_recording_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $guard$
declare
  v_seller uuid;
  v_active boolean;
  v_target uuid;
begin
  select seller_id,is_active,target_buyer_id
  into v_seller,v_active,v_target
  from public.playlist_sale_offers
  where id=new.offer_id;

  if not coalesce(v_active,false) or v_target is not null then return new; end if;

  if exists(
    select 1
    from public.playlist_sale_offer_tracks existing
    join public.playlist_sale_offers offer on offer.id=existing.offer_id
    where offer.seller_id=v_seller
      and offer.is_active=true
      and offer.target_buyer_id is null
      and offer.id<>new.offer_id
      and public.keep_tracks_same_recording(existing.track_id,new.track_id)
  ) then
    raise exception 'TRACK_ALREADY_IN_ACTIVE_OFFER';
  end if;

  return new;
end;
$guard$;

create or replace function public.keep_playlist_sale_offer_activation_unique_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $guard$
begin
  if new.target_buyer_id is not null then return new; end if;

  if new.is_active=true and coalesce(old.is_active,false)=false then
    if exists(
      select 1
      from public.playlist_sale_offer_tracks mine
      join public.playlist_sale_offer_tracks other_tracks
        on public.keep_tracks_same_recording(mine.track_id,other_tracks.track_id)
      join public.playlist_sale_offers other_offer
        on other_offer.id=other_tracks.offer_id
      where mine.offer_id=new.id
        and other_offer.seller_id=new.seller_id
        and other_offer.is_active=true
        and other_offer.target_buyer_id is null
        and other_offer.id<>new.id
    ) then
      raise exception 'TRACK_ALREADY_IN_ACTIVE_OFFER';
    end if;
  end if;
  return new;
end;
$guard$;

create or replace function public.keep_playlist_sale_require_money_payout()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_link text;
  v_qr text;
begin
  if upper(coalesce(new.payment_mode,'')) in ('MONEY','BOTH') and new.is_active then
    select nullif(btrim(p.payout_link),''),nullif(btrim(p.payout_qr_url),'')
    into v_link,v_qr
    from public.profiles p
    where p.id=new.seller_id;

    if v_link is null and v_qr is null then
      raise exception 'SELLER_PAYOUT_NOT_CONFIGURED';
    end if;
    if v_link is not null and v_link !~* '^https://' then
      raise exception 'SELLER_PAYOUT_LINK_INSECURE';
    end if;
    if v_qr is not null and v_qr !~* '^https://' then
      raise exception 'SELLER_PAYOUT_QR_INSECURE';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.keep_playlist_sale_require_seller_terms()
returns trigger
language plpgsql
set search_path='public'
as $function$
declare
  v_terms_version constant text := '2026-10-01-chat-payments-v1';
begin
  if upper(coalesce(new.payment_mode,'')) in ('MONEY','BOTH')
     and coalesce(new.is_active,true)
     and new.seller_id is not null
     and not exists (
       select 1
       from public.marketplace_terms_acceptances a
       where a.profile_id=new.seller_id
         and a.terms_version=v_terms_version
     ) then
    raise exception 'TERMS_ACCEPTANCE_REQUIRED' using errcode='42501';
  end if;
  return new;
end;
$function$;

create or replace function public.keep_profile_sale_suggestions(p_limit integer default 8)
returns table(
  offer_id uuid,
  seller_id uuid,
  seller_username text,
  seller_avatar_url text,
  playlist_name text,
  track_count integer,
  owned_count integer,
  missing_count integer,
  genres text[],
  payment_mode text,
  price_cents integer,
  free_price integer,
  currency_code character,
  match_score integer
)
language sql
stable
security definer
set search_path='public','auth'
as $function$
with
viewer as (
  select auth.uid() as uid,
         greatest(1,least(coalesce(p_limit,8),20)) as limit_n
),
viewer_genres as (
  select distinct lower(trim(g)) genre
  from (
    select unnest(coalesce(p.favorite_genres,'{}'::text[]) || coalesce(p.inferred_genres,'{}'::text[])) g
    from public.profiles p join viewer v on v.uid=p.id
    union all
    select unnest(coalesce(t.genres,'{}'::text[])) g
    from public.keep_decisions kd join viewer v on v.uid=kd.profile_id
    join public.tracks t on t.id=kd.track_id
    where kd.decision='KEPT'
    union all
    select unnest(coalesce(t.genres,'{}'::text[])) g
    from public.track_likes tl join viewer v on v.uid=tl.profile_id
    join public.tracks t on t.id=tl.track_id
  ) x
  where nullif(trim(g),'') is not null
),
social_signals as (
  select f.followee_id seller_id,70 follow_score,0 like_score,0 reprise_score
  from public.follows f join viewer v on v.uid=f.follower_id
  union all
  select fd.profile_id,0,55,0
  from public.track_likes tl join viewer v on v.uid=tl.profile_id
  join public.keep_track_first_discoveries fd on fd.track_id=tl.track_id
  where fd.profile_id<>v.uid
  union all
  select kd.source_user_id,0,0,85
  from public.keep_decisions kd join viewer v on v.uid=kd.profile_id
  where kd.decision='KEPT' and kd.source_user_id is not null and kd.source_user_id<>v.uid
),
social_scores as (
  select seller_id,max(follow_score)+max(like_score)+max(reprise_score) social_score
  from social_signals where seller_id is not null group by seller_id
),
market_sellers as (
  select distinct o.seller_id
  from public.playlist_sale_offers o
  join public.profiles p on p.id=o.seller_id
  join viewer v on true
  where o.is_active=true
    and o.target_buyer_id is null
    and o.seller_id<>v.uid
    and p.is_public=true
    and coalesce(p.discovery_hidden,false)=false
),
candidate_sellers as (
  select ms.seller_id,10+coalesce(ss.social_score,0) social_score
  from market_sellers ms
  left join social_scores ss on ss.seller_id=ms.seller_id
),
offer_agg as (
  select
    o.id offer_id,o.seller_id,p.username seller_username,p.avatar_url seller_avatar_url,
    o.playlist_name,count(distinct ot.track_id)::integer track_count,
    coalesce(array_agg(distinct lower(trim(g.genre))) filter(where nullif(trim(g.genre),'') is not null),'{}'::text[]) genres,
    o.payment_mode,o.price_cents,o.free_price,o.currency_code,o.updated_at,cs.social_score,
    count(distinct vg.genre) filter(where vg.genre is not null)::integer genre_overlap
  from candidate_sellers cs
  join viewer v on true
  join public.playlist_sale_offers o on o.seller_id=cs.seller_id
    and o.is_active=true and o.target_buyer_id is null and o.seller_id<>v.uid
  join public.profiles p on p.id=o.seller_id
    and p.is_public=true and coalesce(p.discovery_hidden,false)=false
  join public.playlist_sale_offer_tracks ot on ot.offer_id=o.id
  join public.tracks t on t.id=ot.track_id
  left join lateral (select unnest(coalesce(t.genres,'{}'::text[])) genre) g on true
  left join viewer_genres vg
    on vg.genre=lower(trim(g.genre))
    or (
      length(vg.genre)>=4 and length(lower(trim(g.genre)))>=4
      and (position(vg.genre in lower(trim(g.genre)))>0 or position(lower(trim(g.genre)) in vg.genre)>0)
    )
  where not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id=v.uid and b.blocked_id=o.seller_id)
       or (b.blocker_id=o.seller_id and b.blocked_id=v.uid)
  )
    and not exists (
      select 1 from public.playlist_sale_payments pay
      where pay.offer_id=o.id and pay.buyer_id=v.uid and pay.status='COMPLETED'
    )
  group by o.id,o.seller_id,p.username,p.avatar_url,o.playlist_name,
           o.payment_mode,o.price_cents,o.free_price,o.currency_code,o.updated_at,cs.social_score
),
scored as (
  select oa.*,
         (oa.social_score + oa.genre_overlap*30)::integer final_score,
         row_number() over(
           partition by oa.seller_id
           order by (oa.social_score + oa.genre_overlap*30) desc,oa.updated_at desc
         ) seller_rank
  from offer_agg oa
  where oa.track_count>0
),
picked as (
  select s.*
  from scored s
  where s.seller_rank<=2
  order by s.final_score desc,s.updated_at desc
  limit (select limit_n from viewer)
)
select
  p.offer_id,p.seller_id,p.seller_username,p.seller_avatar_url,p.playlist_name,p.track_count,
  coalesce((x.overlap->>'ownedCount')::integer,0) owned_count,
  coalesce((x.overlap->>'missingCount')::integer,p.track_count) missing_count,
  p.genres,p.payment_mode,p.price_cents,p.free_price,p.currency_code,p.final_score match_score
from picked p
cross join lateral (select public.keep_playlist_sale_offer_overlap(p.offer_id) overlap) x
order by p.final_score desc,p.updated_at desc;
$function$;

-- Répare uniquement la fenêtre de désactivation automatique observée le 03/10.
-- Une offre chat annulée sans paiement pending reste inactive.
update public.playlist_sale_offers o
set is_active=true,updated_at=now()
where o.target_buyer_id is not null
  and o.playlist_name like 'Pépite Tchat · %'
  and o.is_active=false
  and o.updated_at >= timestamptz '2026-10-03 04:00:00+00'
  and o.updated_at <  timestamptz '2026-10-03 04:20:00+00'
  and exists(select 1 from public.music_agora_messages m where m.sale_offer_id=o.id)
  and (
    not exists(select 1 from public.playlist_sale_payments p where p.offer_id=o.id)
    or exists(select 1 from public.playlist_sale_payments p where p.offer_id=o.id and p.status='PENDING')
  );

revoke all on function public.keep_playlist_sale_unique_active_recording_guard() from public,anon,authenticated;
revoke all on function public.keep_playlist_sale_offer_activation_unique_guard() from public,anon,authenticated;
