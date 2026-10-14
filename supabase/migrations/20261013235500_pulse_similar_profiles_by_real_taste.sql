-- Loki Pulse: real members with shared declared OR learned music tastes.
-- Public discovery only. Never return private/hidden/blocked/followed accounts.
-- No user data or recommendations are altered by this read-only function.
create or replace function public.keep_pulse_similar_profiles(p_limit integer default 8)
returns table(profile_id uuid, username text, avatar_url text, shared_style text, match_score integer)
language sql stable security definer set search_path to 'public' as $function$
with me as (
  select id, favorite_genres, inferred_genres, favorite_artists, inferred_artists
  from public.profiles where id=auth.uid()
), raw_my_styles as (
  select btrim(x.name) as label
    from me cross join lateral unnest(
      coalesce(me.favorite_genres,'{}'::text[]) || coalesce(me.inferred_genres,'{}'::text[])
    ) x(name)
  union all
  select btrim(learned.genre) as label from public.keep_my_taste_profile() learned where learned.weight > 0
), my_styles as (
  select distinct on (public.keep_music_style_key(label))
    public.keep_music_style_key(label) as style_key, label
  from raw_my_styles
  where nullif(public.keep_music_style_key(label),'') is not null
  order by public.keep_music_style_key(label), label
), my_artists as (
  select distinct lower(btrim(a.name)) as artist
  from me cross join lateral unnest(
    coalesce(me.favorite_artists,'{}'::text[]) || coalesce(me.inferred_artists,'{}'::text[])
  ) a(name)
  where nullif(btrim(a.name),'') is not null
), candidates as (
  select p.id, p.username, p.avatar_url,
    coalesce(p.favorite_genres,'{}'::text[]) || coalesce(p.inferred_genres,'{}'::text[]) as target_styles,
    coalesce(p.favorite_artists,'{}'::text[]) || coalesce(p.inferred_artists,'{}'::text[]) as target_artists
  from public.profiles p join me on true
  where p.id<>me.id
    and coalesce(p.is_public,false)=true
    and coalesce(p.discovery_hidden,false)=false
    and nullif(btrim(p.username),'') is not null
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id=me.id and b.blocked_id=p.id)
         or (b.blocker_id=p.id and b.blocked_id=me.id)
    )
    and not exists (
      select 1 from public.follows f
      where f.follower_id=me.id and f.followee_id=p.id
    )
), matched as (
  select c.id,c.username,c.avatar_url,
    (
      select count(distinct m.style_key)::int from my_styles m
      where exists (
        select 1 from unnest(c.target_styles) t(genre)
        where public.keep_music_style_key(t.genre)=m.style_key
      )
    ) as common_genres,
    (
      select count(distinct a.artist)::int from my_artists a
      where exists (
        select 1 from unnest(c.target_artists) t(artist)
        where lower(btrim(t.artist))=a.artist
      )
    ) as common_artists,
    (
      select min(m.label) from my_styles m
      where exists (
        select 1 from unnest(c.target_styles) t(genre)
        where public.keep_music_style_key(t.genre)=m.style_key
      )
    ) as style_label
  from candidates c
)
select m.id, m.username, m.avatar_url, coalesce(m.style_label,'Artistes en commun'),
  least(100,25*m.common_genres+15*m.common_artists)::int
from matched m
where (m.common_genres+m.common_artists)>0
order by (25*m.common_genres+15*m.common_artists) desc,m.username
limit greatest(1,least(coalesce(p_limit,8),20))
$function$;
revoke all on function public.keep_pulse_similar_profiles(integer) from public,anon;
grant execute on function public.keep_pulse_similar_profiles(integer) to authenticated;
