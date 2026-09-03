-- Adel (03/09/2026) : "arrange-toi que les autres utilisateurs le voient"
-- (le nombre de morceaux choisi) -- keep_battle_challenge_inbox ne renvoyait
-- pas round_count : la personne qui reçoit une invitation n'avait aucun
-- moyen de savoir si le match ferait 8, 15, 20 ou 30 morceaux avant
-- d'accepter.
drop function if exists public.keep_battle_challenge_inbox();

create or replace function public.keep_battle_challenge_inbox()
returns table(id uuid, challenger_id uuid, username text, avatar_url text, theme_code text, round_count integer, created_at timestamp with time zone, expires_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  update public.keep_battle_challenges c
  set status='EXPIRED', updated_at=now()
  where c.status='PENDING' and c.expires_at<=now();

  return query
  select c.id,c.challenger_id,p.username,p.avatar_url,c.theme_code,c.round_count,c.created_at,c.expires_at
  from public.keep_battle_challenges c
  join public.profiles p on p.id=c.challenger_id
  where c.target_id=auth.uid() and c.status='PENDING' and c.expires_at>now()
  order by c.created_at desc
  limit 5;
end;
$function$;
