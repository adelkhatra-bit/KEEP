-- Queue Battle challenges while the target is actively playing SOLO.
alter table public.keep_battle_challenges add column if not exists deliver_after_solo boolean not null default false;

create or replace function public.keep_battle_challenge_inbox()
returns table(id uuid, challenger_id uuid, username text, avatar_url text, theme_code text, round_count integer, created_at timestamptz, expires_at timestamptz)
language plpgsql security definer set search_path='public' as $f$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 update public.keep_battle_challenges c set status='EXPIRED',updated_at=now()
 where c.status='PENDING' and c.expires_at<=now() and not c.deliver_after_solo;
 update public.keep_battle_challenges c set deliver_after_solo=false, expires_at=now()+interval '90 seconds', updated_at=now()
 where c.target_id=auth.uid() and c.status='PENDING' and c.deliver_after_solo
   and not exists(select 1 from public.keep_battle_solo_presence sp where sp.profile_id=auth.uid() and sp.status='SOLO' and sp.last_seen_at>now()-interval '20 seconds');
 return query
 select c.id,c.challenger_id,p.username,p.avatar_url,c.theme_code,c.round_count,c.created_at,c.expires_at
 from public.keep_battle_challenges c join public.profiles p on p.id=c.challenger_id
 where c.target_id=auth.uid() and c.status='PENDING' and not c.deliver_after_solo and c.expires_at>now()
 order by c.created_at asc limit 5;
end $f$;
