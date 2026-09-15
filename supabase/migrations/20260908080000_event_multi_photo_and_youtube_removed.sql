-- Adel (08/09/2026) : "il puisse ajouter plusieurs photos ... 2 ou 3 photos"
-- -- galerie (jusqu'a 3), image_url reste en synchro (= premiere photo) pour
-- ne rien casser cote lecture existante (admin_event_moderation_queue,
-- notifications, etc.) qui continuent de lire image_url comme couverture.

alter table public.events
  add column if not exists image_urls text[] not null default '{}';

update public.events
set image_urls = array[image_url]
where image_url is not null and image_urls = '{}';

create or replace function public.admin_event_moderation_queue()
returns table(
  id uuid,
  name text,
  description text,
  image_url text,
  image_urls text[],
  starts_at timestamptz,
  venue_name text,
  creator_id uuid,
  creator_username text,
  created_at timestamptz,
  moderation_status text,
  photo_status text,
  photo_note text,
  text_status text,
  text_note text,
  moderation_flag boolean,
  moderation_flag_reason text,
  require_qr_code boolean,
  include_rsvp_buttons boolean
)
language sql
stable security definer
set search_path = 'public'
as $$
  select e.id, e.name, e.description, e.image_url, e.image_urls, e.starts_at, e.venue_name, e.creator_id, p.username, e.created_at,
         e.moderation_status::text, e.photo_status::text, e.photo_note, e.text_status::text, e.text_note,
         e.moderation_flag, e.moderation_flag_reason, e.require_qr_code, e.include_rsvp_buttons
  from public.events e
  join public.profiles p on p.id = e.creator_id
  where e.moderation_status = 'PENDING' and e.is_disabled = false
  order by e.moderation_flag desc, e.created_at asc
  limit 200;
$$;
revoke all on function public.admin_event_moderation_queue() from public, anon, authenticated;
grant execute on function public.admin_event_moderation_queue() to service_role;
