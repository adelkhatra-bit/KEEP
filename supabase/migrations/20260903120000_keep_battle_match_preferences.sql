-- Adel (03/09/2026) : "je puisse sélectionner plusieurs styles, Rap US et
-- Jazz etc., et que ça reste enregistré, visible par les autres quand je
-- suis disponible pour faire un Battle" -- nouvelle préférence DURABLE
-- (styles multiples + nombre de morceaux), séparée du style choisi au
-- moment précis d'envoyer une invite (qui reste un seul thème -- l'arène
-- n'a qu'une seule colonne theme_code, changer ça casserait tout le
-- système de manches). Cette préférence est affichée aux autres joueurs
-- sur "Joueurs disponibles" pour qu'ils sachent quoi proposer.
create table if not exists public.keep_battle_match_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  theme_codes text[] not null default array['MIX'],
  round_count integer not null default 8 check (round_count between 5 and 30),
  updated_at timestamptz not null default now()
);
alter table public.keep_battle_match_preferences enable row level security;
drop policy if exists "keep_battle_match_preferences_read_all" on public.keep_battle_match_preferences;
create policy "keep_battle_match_preferences_read_all" on public.keep_battle_match_preferences for select using (true);
drop policy if exists "keep_battle_match_preferences_manage_own" on public.keep_battle_match_preferences;
create policy "keep_battle_match_preferences_manage_own" on public.keep_battle_match_preferences for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create or replace function public.keep_battle_save_match_preferences(p_theme_codes text[], p_round_count integer default 8)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_codes text[];
  v_round integer := greatest(5, least(coalesce(p_round_count, 8), 30));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select coalesce(array_agg(distinct upper(trim(c))), array['MIX']::text[]) into v_codes
  from unnest(coalesce(p_theme_codes, array['MIX']::text[])) c
  where trim(coalesce(c,'')) <> '';
  if v_codes is null or array_length(v_codes,1) is null then v_codes := array['MIX']; end if;
  insert into public.keep_battle_match_preferences(profile_id, theme_codes, round_count, updated_at)
  values(uid, v_codes, v_round, now())
  on conflict(profile_id) do update set theme_codes=excluded.theme_codes, round_count=excluded.round_count, updated_at=now();
  return jsonb_build_object('themeCodes', to_jsonb(v_codes), 'roundCount', v_round);
end;
$function$;

create or replace function public.keep_battle_load_match_preferences()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); row public.keep_battle_match_preferences%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into row from public.keep_battle_match_preferences where profile_id = uid;
  if not found then return jsonb_build_object('themeCodes', jsonb_build_array('MIX'), 'roundCount', 8); end if;
  return jsonb_build_object('themeCodes', to_jsonb(row.theme_codes), 'roundCount', row.round_count);
end;
$function$;

drop function if exists public.keep_battle_solo_available(integer);
create or replace function public.keep_battle_solo_available(p_limit integer default 12)
returns table(profile_id uuid, username text, avatar_url text, theme_code text, last_seen_at timestamptz, skill_tier text, preferred_theme_codes text[], preferred_round_count integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select sp.profile_id, p.username, p.avatar_url, sp.theme_code, sp.last_seen_at, public.keep_battle_skill_tier(sp.profile_id),
    coalesce(mp.theme_codes, array['MIX']), coalesce(mp.round_count, 8)
  from public.keep_battle_solo_presence sp
  join public.profiles p on p.id = sp.profile_id
  left join public.keep_battle_match_preferences mp on mp.profile_id = sp.profile_id
  where sp.profile_id <> auth.uid()
    and (
      (sp.status='AVAILABLE' and sp.last_seen_at > now() - interval '20 seconds')
      or (sp.manual_available = true and sp.last_seen_at > now() - interval '30 minutes')
    )
  order by sp.last_seen_at desc
  limit greatest(1, p_limit);
$function$;
