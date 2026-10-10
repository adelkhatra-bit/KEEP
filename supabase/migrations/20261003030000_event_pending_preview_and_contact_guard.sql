-- Aperçu limité des soirées PENDING + garde anti-contact avant approbation.
-- Les personnes de l'audience potentielle voient uniquement une jaquette et
-- un descriptif nettoyé. Aucun lieu, téléphone, lien, paiement ou RSVP n'est
-- renvoyé avant APPROVED.

create or replace function public.keep_event_description_has_contact(p_text text)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select
    coalesce(p_text,'') ~* '(https?://|www\.)'
    or coalesce(p_text,'') ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
    or coalesce(p_text,'') ~* '(^|[^0-9])\+?[0-9][0-9 .()/-]{7,}[0-9]([^0-9]|$)'
    or coalesce(p_text,'') ~* '(^|[^[:alnum:]-])([[:alnum:]-]+\.)+(com|fr|net|org|io|co|me|app|shop|store|biz)(/|[^[:alnum:]]|$)';
$$;

create or replace function public.keep_event_preview_sanitize(p_text text)
returns text
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  v text := left(coalesce(p_text,''),1200);
begin
  v := regexp_replace(v, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[contact masqué]', 'gi');
  v := regexp_replace(v, 'https?://[^[:space:]]+', '[lien masqué]', 'gi');
  v := regexp_replace(v, 'www\.[^[:space:]]+', '[lien masqué]', 'gi');
  v := regexp_replace(v, '(^|[^0-9])\+?[0-9][0-9 .()/-]{7,}[0-9]([^0-9]|$)', '\1[contact masqué]\2', 'g');
  v := regexp_replace(v, '(^|[^[:alnum:]-])([[:alnum:]-]+\.)+(com|fr|net|org|io|co|me|app|shop|store|biz)(/|[^[:alnum:]]|$)', '\1[lien masqué]\4', 'gi');
  return btrim(v);
end;
$$;

create or replace function public.keep_event_flag_contact_before_moderation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.keep_event_description_has_contact(new.description) then
    new.moderation_flag := true;
    new.moderation_flag_reason := case
      when nullif(btrim(coalesce(new.moderation_flag_reason,'')),'') is null
        then 'Coordonnées ou lien détectés dans le descriptif'
      when new.moderation_flag_reason ilike '%Coordonnées ou lien détectés%'
        then new.moderation_flag_reason
      else new.moderation_flag_reason || ' · Coordonnées ou lien détectés dans le descriptif'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_flag_contact_before_moderation on public.events;
create trigger trg_event_flag_contact_before_moderation
before insert or update of description, moderation_flag, moderation_flag_reason
on public.events
for each row execute function public.keep_event_flag_contact_before_moderation();

create or replace function public.keep_event_block_contact_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.text_status = 'APPROVED' or new.moderation_status = 'APPROVED')
     and public.keep_event_description_has_contact(new.description) then
    raise exception 'event_description_contact_forbidden' using errcode='22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_block_contact_approval on public.events;
create trigger trg_event_block_contact_approval
before update of text_status, moderation_status on public.events
for each row execute function public.keep_event_block_contact_approval();

create or replace function public.keep_pending_event_teasers_for_me(p_limit integer default 50)
returns table(
  id uuid,
  creator_id uuid,
  name text,
  description_preview text,
  image_url text,
  starts_at timestamptz,
  audience_mode text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with viewer as (
    select p.id,p.is_adult
    from public.profiles p
    where p.id=auth.uid()
  )
  select
    e.id,
    e.creator_id,
    e.name,
    public.keep_event_preview_sanitize(e.description),
    e.image_url,
    e.starts_at,
    e.audience_mode
  from public.events e
  join viewer v on true
  where e.creator_id <> v.id
    and coalesce(e.is_disabled,false)=false
    and e.moderation_status='PENDING'
    and e.starts_at >= now()-interval '12 hours'
    and (e.audience_mode <> 'ADULTS_18_PLUS' or coalesce(v.is_adult,false)=true)
    and (
      exists(select 1 from public.follows f where f.follower_id=v.id and f.followee_id=e.creator_id)
      or exists(
        select 1 from public.keep_decisions k
        where k.profile_id=v.id and k.source_user_id=e.creator_id and k.decision='KEPT'
      )
    )
  order by e.starts_at asc
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

revoke all on function public.keep_pending_event_teasers_for_me(integer) from public, anon, authenticated;
grant execute on function public.keep_pending_event_teasers_for_me(integer) to authenticated;
