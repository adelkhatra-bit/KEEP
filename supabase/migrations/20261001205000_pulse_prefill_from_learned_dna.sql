-- Prefill the Pulse questionnaire from Loki's learned music DNA without
-- marking the questionnaire complete until the user explicitly validates it.
create or replace function public.keep_pulse_preferences_state()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
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
    'suggestedGenres',case
      when cardinality(coalesce(p.favorite_genres,array[]::text[])) > 0 then coalesce(p.favorite_genres,array[]::text[])
      else coalesce(p.inferred_genres,array[]::text[])
    end,
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
