create or replace function public.keep_battle_challenge_inbox()
returns table(
  id uuid,
  challenger_id uuid,
  username text,
  avatar_url text,
  theme_code text,
  created_at timestamptz,
  expires_at timestamptz
)
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
  select c.id,c.challenger_id,p.username,p.avatar_url,c.theme_code,c.created_at,c.expires_at
  from public.keep_battle_challenges c
  join public.profiles p on p.id=c.challenger_id
  where c.target_id=auth.uid() and c.status='PENDING' and c.expires_at>now()
  order by c.created_at desc
  limit 5;
end;
$function$;
