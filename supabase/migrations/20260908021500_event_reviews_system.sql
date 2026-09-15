-- Adel 08/09/2026 : "il faut qu'il y ait un retour ... comprendre pourquoi
-- il a eu un flop ... systeme d'etoile ... le pseudo et certif de
-- l'utilisateur et son style musical ... nous le Super Admin, on aura le
-- retour des utilisateurs qui utilisent notre Publicite" -- systeme d'avis
-- post-evenement : uniquement pour qui a repondu "GOING" (event_rsvps),
-- un avis par personne par evenement, visible publiquement avec la
-- certification/le style calcules EN DIRECT (meme regle que partout
-- ailleurs), et une moyenne consultable par l'organisateur ET le Super
-- Admin.

create table if not exists public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, reviewer_id)
);

create index if not exists idx_event_reviews_event on public.event_reviews(event_id);

alter table public.event_reviews enable row level security;
create policy event_reviews_select_all on public.event_reviews for select using (true);

CREATE OR REPLACE FUNCTION public.keep_event_submit_review(p_event_id uuid, p_rating integer, p_comment text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_rsvp text;
  v_comment text := nullif(btrim(coalesce(p_comment,'')), '');
  v_row public.event_reviews%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'INVALID_RATING'; end if;
  if v_comment is not null and length(v_comment) > 500 then v_comment := left(v_comment, 500); end if;

  select status::text into v_rsvp from public.event_rsvps where event_id = p_event_id and profile_id = v_uid;
  if v_rsvp is distinct from 'GOING' then raise exception 'PARTICIPATION_REQUIRED'; end if;

  insert into public.event_reviews(event_id, reviewer_id, rating, comment)
  values (p_event_id, v_uid, p_rating, v_comment)
  on conflict (event_id, reviewer_id) do update
    set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'rating', v_row.rating, 'comment', v_row.comment);
end;
$function$;

revoke all on function public.keep_event_submit_review(uuid, integer, text) from public;
grant execute on function public.keep_event_submit_review(uuid, integer, text) to authenticated;

CREATE OR REPLACE FUNCTION public.keep_event_reviews(p_event_id uuid)
 RETURNS TABLE(
   review_id uuid,
   reviewer_id uuid,
   username text,
   certification_tier text,
   favorite_genres text[],
   rating integer,
   comment text,
   created_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    r.id,
    p.id,
    p.username,
    case
      when coalesce(u.is_anonymous, true) then 'UNVERIFIED'
      when plan.code = 'VENUE_PRO' then 'VENUE_PRO'
      when plan.code = 'CREATOR_PRO' then 'CREATOR_PRO'
      when plan.code = 'PREMIUM' then 'PREMIUM'
      else 'FREE'
    end::text,
    coalesce(p.favorite_genres, array[]::text[]),
    r.rating,
    r.comment,
    r.created_at
  from public.event_reviews r
  join public.profiles p on p.id = r.reviewer_id
  join auth.users u on u.id = p.id
  left join lateral (
    select pl.code::text as code
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.profile_id = p.id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ) plan on true
  where r.event_id = p_event_id
  order by r.created_at desc
  limit 200;
end;
$function$;

revoke all on function public.keep_event_reviews(uuid) from public;
grant execute on function public.keep_event_reviews(uuid) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.keep_event_review_summary(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'averageRating', round(coalesce(avg(rating), 0)::numeric, 2),
    'reviewCount', count(*)
  )
  from public.event_reviews
  where event_id = p_event_id;
$function$;

revoke all on function public.keep_event_review_summary(uuid) from public;
grant execute on function public.keep_event_review_summary(uuid) to anon, authenticated;
