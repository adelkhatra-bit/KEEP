-- Audit du 06/10/2026 : le défi « Réagir à 20 musiques » ne comptait que les ❤. On y ajoute les 😐 et 👎 (toutes les réactions). Additif.
alter function public.keep_my_ear_report() rename to keep_my_ear_report_base;
create or replace function public.keep_my_ear_report()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select b || jsonb_build_object('given', coalesce((b->>'given')::int, 0) + (select count(*)::int from public.track_dislikes d where d.profile_id = auth.uid()))
  from (select public.keep_my_ear_report_base() as b) q;
$function$;
revoke all on function public.keep_my_ear_report_base() from public, anon;
grant execute on function public.keep_my_ear_report_base() to authenticated;
revoke all on function public.keep_my_ear_report() from public, anon;
grant execute on function public.keep_my_ear_report() to authenticated;
