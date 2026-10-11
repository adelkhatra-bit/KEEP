-- Worldwide Loki Pulse preferences: styles + languages + countries, with a respectful recurring prompt.
alter table public.profiles
  add column if not exists music_language_codes text[] not null default '{}',
  add column if not exists pulse_preferences_completed_at timestamptz,
  add column if not exists pulse_prompt_after timestamptz,
  add column if not exists pulse_prompt_dismiss_count integer not null default 0,
  add column if not exists pulse_preferences_version integer not null default 0;

create table if not exists public.music_language_catalog (
  code text primary key,
  name text not null,
  source text not null default 'RESTCOUNTRIES',
  updated_at timestamptz not null default now()
);
alter table public.music_language_catalog enable row level security;
drop policy if exists music_language_catalog_read on public.music_language_catalog;
create policy music_language_catalog_read on public.music_language_catalog for select using (true);

-- Useful fallback before the worldwide sync has run.
insert into public.music_language_catalog(code,name,source) values
('eng','English','SEED'),('fra','Français','SEED'),('spa','Español','SEED'),('por','Português','SEED'),
('deu','Deutsch','SEED'),('ita','Italiano','SEED'),('ara','العربية','SEED'),('tur','Türkçe','SEED'),
('rus','Русский','SEED'),('zho','中文','SEED'),('jpn','日本語','SEED'),('kor','한국어','SEED'),
('hin','हिन्दी','SEED'),('urd','اردو','SEED'),('ben','বাংলা','SEED'),('pan','ਪੰਜਾਬੀ','SEED'),
('tam','தமிழ்','SEED'),('tel','తెలుగు','SEED'),('mar','मराठी','SEED'),('guj','ગુજરાતી','SEED'),
('ind','Bahasa Indonesia','SEED'),('msa','Bahasa Melayu','SEED'),('tha','ไทย','SEED'),('vie','Tiếng Việt','SEED'),
('fil','Filipino','SEED'),('nld','Nederlands','SEED'),('pol','Polski','SEED'),('ces','Čeština','SEED'),
('ron','Română','SEED'),('ell','Ελληνικά','SEED'),('swe','Svenska','SEED'),('nor','Norsk','SEED'),
('dan','Dansk','SEED'),('fin','Suomi','SEED'),('ukr','Українська','SEED'),('heb','עברית','SEED'),
('fas','فارسی','SEED'),('swa','Kiswahili','SEED'),('amh','አማርኛ','SEED'),('zul','isiZulu','SEED')
on conflict(code) do update set name=excluded.name;

create or replace function public.keep_music_language_search(p_query text default null, p_limit integer default 300)
returns table(code text,name text)
language sql stable security definer set search_path=public
as $function$
  select l.code,l.name
  from public.music_language_catalog l
  where nullif(trim(coalesce(p_query,'')),'') is null
     or l.name ilike '%' || trim(p_query) || '%'
     or l.code ilike '%' || lower(trim(p_query)) || '%'
  order by l.name
  limit greatest(10,least(coalesce(p_limit,300),300));
$function$;
revoke all on function public.keep_music_language_search(text,integer) from public,anon;
grant execute on function public.keep_music_language_search(text,integer) to authenticated,anon;

create or replace function public.keep_pulse_preferences_state()
returns jsonb
language plpgsql stable security definer set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  completed boolean;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into p from public.profiles where id=uid;
  if not found then raise exception 'profile_not_found'; end if;

  completed :=
    coalesce(p.pulse_preferences_version,0) >= 1
    and p.pulse_preferences_completed_at is not null
    and cardinality(coalesce(p.favorite_genres,array[]::text[])) > 0;

  return jsonb_build_object(
    'completed',completed,
    'shouldPrompt',(not completed) and (p.pulse_prompt_after is null or p.pulse_prompt_after <= now()),
    'favoriteGenres',coalesce(p.favorite_genres,array[]::text[]),
    'languageCodes',coalesce(p.music_language_codes,array[]::text[]),
    'countryCodes',coalesce(p.music_country_codes,array[]::text[]),
    'preferredLanguageTag',p.preferred_language_tag,
    'promptAfter',p.pulse_prompt_after,
    'dismissCount',coalesce(p.pulse_prompt_dismiss_count,0),
    'version',coalesce(p.pulse_preferences_version,0)
  );
end;
$function$;
revoke all on function public.keep_pulse_preferences_state() from public,anon;
grant execute on function public.keep_pulse_preferences_state() to authenticated;

create or replace function public.keep_save_pulse_preferences(
  p_genres text[],
  p_language_codes text[] default '{}',
  p_country_codes text[] default '{}',
  p_preferred_language_tag text default null
)
returns jsonb
language plpgsql security definer set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_genres text[];
  v_languages text[];
  v_countries text[];
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select coalesce(array_agg(distinct trim(x)) filter(where nullif(trim(x),'') is not null),array[]::text[])
  into v_genres
  from unnest(coalesce(p_genres,array[]::text[])) x;

  if cardinality(v_genres)=0 then raise exception 'PULSE_STYLE_REQUIRED'; end if;
  if cardinality(v_genres)>30 then raise exception 'PULSE_STYLE_LIMIT'; end if;

  select coalesce(array_agg(distinct lower(trim(x))) filter(where nullif(trim(x),'') is not null),array[]::text[])
  into v_languages
  from unnest(coalesce(p_language_codes,array[]::text[])) x;
  if cardinality(v_languages)>20 then raise exception 'PULSE_LANGUAGE_LIMIT'; end if;

  select coalesce(array_agg(distinct upper(trim(x))) filter(where upper(trim(x)) ~ '^[A-Z]{2}$'),array[]::text[])
  into v_countries
  from unnest(coalesce(p_country_codes,array[]::text[])) x;
  if cardinality(v_countries)>20 then raise exception 'PULSE_COUNTRY_LIMIT'; end if;

  update public.profiles
  set favorite_genres=v_genres,
      music_language_codes=v_languages,
      music_country_codes=v_countries,
      preferred_language_tag=nullif(trim(coalesce(p_preferred_language_tag,'')),''),
      pulse_preferences_completed_at=now(),
      pulse_prompt_after=null,
      pulse_prompt_dismiss_count=0,
      pulse_preferences_version=1
  where id=uid;

  return public.keep_pulse_preferences_state();
end;
$function$;
revoke all on function public.keep_save_pulse_preferences(text[],text[],text[],text) from public,anon;
grant execute on function public.keep_save_pulse_preferences(text[],text[],text[],text) to authenticated;

create or replace function public.keep_snooze_pulse_preferences(p_hours integer default 24)
returns jsonb
language plpgsql security definer set search_path=public,auth
as $function$
declare uid uuid := auth.uid(); v_hours integer;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  v_hours := greatest(6,least(coalesce(p_hours,24),72));
  update public.profiles
  set pulse_prompt_after=now()+make_interval(hours=>v_hours),
      pulse_prompt_dismiss_count=coalesce(pulse_prompt_dismiss_count,0)+1
  where id=uid;
  return public.keep_pulse_preferences_state();
end;
$function$;
revoke all on function public.keep_snooze_pulse_preferences(integer) from public,anon;
grant execute on function public.keep_snooze_pulse_preferences(integer) to authenticated;

create index if not exists idx_profiles_music_language_codes_gin on public.profiles using gin(music_language_codes);
create index if not exists idx_profiles_music_country_codes_gin on public.profiles using gin(music_country_codes);
