-- Mirrors Supabase migration 20261001214638 already applied remotely.
-- Reassert the final lowercase-before-regex normalization order.

create or replace function public.keep_music_style_key(p_value text)
returns text
language sql
immutable
set search_path=public
as $function$
  with normalized as (
    select regexp_replace(
      lower(
        translate(
          trim(coalesce(p_value,'')),
          'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝŸýÿ',
          'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYYyy'
        )
      ),
      '[^a-z0-9]+',
      '',
      'g'
    ) as v
  )
  select case
    when v in ('electronic','electronique','electronica') then 'electronic'
    when v in ('classical','classique','musiqueclassique') then 'classical'
    when v in ('soundtrack','bandeoriginale','originalscore') then 'soundtrack'
    when v in ('world','worldwide','worldmusic','musiquesdumonde') then 'world'
    when v in ('hiphop','hiphoprap','rap') then 'hiphoprap'
    when v in ('rb','rbsoul','rhythmandblues') then 'rbsoul'
    when v in ('urbanlatin','urbanolatino','latin','latinmusic','musiquelatine') then 'latin'
    when v in ('rai','raimaghreb','raidumaghreb','afriquedunord') then 'rai'
    when v in ('afrobeat','afrobeats') then 'afrobeats'
    when v in ('kpop','koreanpop') then 'kpop'
    when v in ('brazilian','bresil','brazil') then 'brazilian'
    else v
  end
  from normalized;
$function$;

revoke all on function public.keep_music_style_key(text) from public,anon;
grant execute on function public.keep_music_style_key(text) to authenticated,service_role;
