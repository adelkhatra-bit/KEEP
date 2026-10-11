-- Copie dans le dépôt de ce qui est DÉJÀ appliqué en production (07/10/2026).
-- Cœur = +3 au goût, pouce bas = -4, neutre (MEH) = rien ; jamais bloquant.
-- Profils de test séparés des vrais ; catalogue mondial agrandi toutes les 5 min.

CREATE OR REPLACE FUNCTION public.keep_is_test_profile(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select p.test_mode_enabled from public.profiles p where p.id = p_id), false)
      or exists (
        select 1 from auth.users u
         where u.id = p_id
           and (u.email is null
             or u.email ilike '%@keep.local'
             or u.email ilike '%@mailinator.com'
             or u.email ilike '%@example.com'
             or u.email ilike 'claude-%')
      );
$function$;
revoke all on function public.keep_is_test_profile(uuid) from public, anon, authenticated;
grant execute on function public.keep_is_test_profile(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.keep_taste_from_like_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  begin
    perform public.keep_apply_track_taste_signal(new.profile_id, new.track_id, 3, true);
  exception when others then
    null; -- le cœur reste enregistré quoi qu'il arrive
  end;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.keep_taste_from_dislike_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(new.reaction, 'DISLIKE') <> 'DISLIKE' then return new; end if; -- neutre : rien
  if tg_op = 'UPDATE' and coalesce(old.reaction, 'DISLIKE') = 'DISLIKE' then return new; end if;
  if new.track_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return new; end if;
  begin
    perform public.keep_apply_track_taste_signal(new.profile_id, new.track_id::uuid, -4, false);
  exception when others then
    null; -- le pouce bas reste enregistré quoi qu'il arrive
  end;
  return new;
end;
$function$;

drop trigger if exists keep_taste_from_like on public.track_likes;
create trigger keep_taste_from_like after insert on public.track_likes
  for each row execute function public.keep_taste_from_like_trigger();

drop trigger if exists keep_taste_from_dislike on public.track_dislikes;
create trigger keep_taste_from_dislike after insert or update of reaction on public.track_dislikes
  for each row execute function public.keep_taste_from_dislike_trigger();

do $$
begin
  if exists (select 1 from cron.job where jobname = 'keep-world-catalog-expand-every-five-minutes') then
    perform cron.unschedule('keep-world-catalog-expand-every-five-minutes');
  end if;
  perform cron.schedule('keep-world-catalog-expand-every-five-minutes', '*/5 * * * *',
    'select public.keep_enqueue_world_catalog_expansion()');
end $$;
