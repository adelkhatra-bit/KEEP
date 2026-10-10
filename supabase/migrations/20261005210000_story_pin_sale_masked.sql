-- Une musique EN VENTE peut être mise en story : elle est toujours masquée (jaquette, artiste). Additif.
alter table public.story_pins add column if not exists masked boolean not null default false;

create or replace function public.keep_pin_story_track(p_track_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_offered boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select exists (
    select 1 from public.playlist_sale_offer_tracks pst
    join public.playlist_sale_offers pso on pso.id = pst.offer_id
    where pso.seller_id = auth.uid() and pso.is_active = true and pst.track_id = p_track_id
  ) into v_offered;
  if not v_offered and not exists (
    select 1 from public.keep_decisions d
    where d.profile_id = auth.uid() and d.track_id = p_track_id and d.decision = 'KEPT' and d.visibility = 'PUBLIC'
  ) then
    raise exception 'STORY_PIN_REQUIRES_PUBLIC_KEEP';
  end if;
  insert into public.story_pins (profile_id, track_id, masked) values (auth.uid(), p_track_id, v_offered)
  on conflict (profile_id, track_id) do update set pinned_at = now(), masked = excluded.masked;
  return true;
end;
$function$;
