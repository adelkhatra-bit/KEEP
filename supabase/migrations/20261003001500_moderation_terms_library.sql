-- Adel (02/10/2026) : « une bibliothèque qui bloque tous les mots (insultes,
-- drogue…) dans le tchat privé, les groupes et La Place ; quand un utilisateur
-- signale, le mot inconnu part au Super Admin qui l'approuve ou le refuse ;
-- approuvé, il devient interdit partout ».
--
-- Avant : 20 insultes écrites en dur dans keep_agora_contains_blocked_language,
-- rien sur la drogue, aucun moyen d'en ajouter.
-- Maintenant :
-- - public.moderation_terms : la bibliothèque (terme, catégorie, statut).
--   ACTIVE = bloqué ; PENDING = proposé (signalement), en attente du Super
--   Admin ; REJECTED = refusé (ne sera plus proposé).
-- - keep_agora_contains_blocked_language lit la bibliothèque : UN SEUL filtre
--   pour La Place, les messages privés et les groupes (toutes les fonctions
--   d'envoi l'appellent déjà). Comparaison sans accents, sur mots entiers.
-- - Chaque signalement propose les mots du message au Super Admin (file
--   « Bibliothèque »), sauf ceux déjà ACTIVE ou REJECTED ; il approuve ou refuse
--   d'un clic, ou ajoute un terme à la main.
-- Additif uniquement : aucune donnée utilisateur modifiée ni supprimée.

create table if not exists public.moderation_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  normalized text not null unique,
  category text not null default 'AUTRE'
    check (category in ('INSULTE','HAINE','DROGUE','SEXUEL','ARNAQUE','VIOLENCE','AUTRE')),
  status text not null default 'PENDING' check (status in ('ACTIVE','PENDING','REJECTED')),
  source text not null default 'ADMIN' check (source in ('SYSTEM','REPORT','ADMIN')),
  report_count integer not null default 0,
  example_excerpt text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);
create index if not exists moderation_terms_status_idx on public.moderation_terms(status, report_count desc);
alter table public.moderation_terms enable row level security;
revoke all on public.moderation_terms from anon, authenticated;

-- Normalisation unique : minuscules, sans accents, séparateurs -> espaces.
create or replace function public.keep_moderation_normalize(p_text text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  -- Sans extension : accents convertis par translate (même résultat).
  select btrim(regexp_replace(
    -- Contournements courants : c0nnard, s@lope, 3nculé… (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s).
    translate(lower(coalesce(p_text,'')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ013457@$', 'aaaaaaceeeeiiiinooooouuuuyyoaoieastas'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- Le filtre unique de tout le tchat, désormais alimenté par la bibliothèque.
create or replace function public.keep_agora_contains_blocked_language(p_body text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v text := ' ' || public.keep_moderation_normalize(p_body) || ' ';
begin
  if v = '  ' then return false; end if;
  return exists (
    select 1 from public.moderation_terms t
    where t.status = 'ACTIVE'
      and position(' ' || t.normalized || ' ' in v) > 0
  );
end;
$function$;
revoke all on function public.keep_agora_contains_blocked_language(text) from public, anon;
grant execute on function public.keep_agora_contains_blocked_language(text) to authenticated, service_role;

-- Bibliothèque de départ : les 20 insultes existantes + haine + drogue
-- (expressions choisies pour éviter les faux positifs : « joint » seul ou
-- « héroïne » seule ne sont pas bloqués).
insert into public.moderation_terms(term, normalized, category, status, source)
select term, public.keep_moderation_normalize(term), category, 'ACTIVE', 'SYSTEM'
from (values
  ('connard','INSULTE'),('connasse','INSULTE'),('salope','INSULTE'),('enculé','INSULTE'),('fils de pute','INSULTE'),
  ('va te faire foutre','INSULTE'),('ferme ta gueule','INSULTE'),('nique ta','INSULTE'),('nique ton','INSULTE'),
  ('fuck you','INSULTE'),('fucking idiot','INSULTE'),('bitch','INSULTE'),('batard','INSULTE'),('pd','INSULTE'),('tapette','INSULTE'),
  ('sale arabe','HAINE'),('sale noir','HAINE'),('sale juif','HAINE'),('sale musulman','HAINE'),('sale gay','HAINE'),
  ('faggot','HAINE'),('nigger','HAINE'),('bougnoule','HAINE'),
  ('cocaine','DROGUE'),('cocaïne','DROGUE'),('vends de la coke','DROGUE'),('plan coke','DROGUE'),
  ('beuh','DROGUE'),('weed','DROGUE'),('cannabis','DROGUE'),('haschich','DROGUE'),('haschisch','DROGUE'),
  ('barrette de shit','DROGUE'),('plan shit','DROGUE'),('pochon','DROGUE'),('fais tourner le joint','DROGUE'),
  ('rouler un joint','DROGUE'),('fumer un joint','DROGUE'),('ecstasy','DROGUE'),('mdma','DROGUE'),('lsd','DROGUE'),
  ('ketamine','DROGUE'),('kétamine','DROGUE'),('methamphetamine','DROGUE'),('fentanyl','DROGUE'),('crack a vendre','DROGUE')
) as seed(term, category)
on conflict (normalized) do nothing;

-- Mots « vides » jamais proposés au Super Admin (trop courants).
create or replace function public.keep_moderation_is_stopword(p_word text)
returns boolean
language sql
immutable
as $$
  select p_word = any(array[
    'le','la','les','un','une','des','de','du','et','ou','a','au','aux','en','je','tu','il','elle','on','nous','vous','ils',
    'elles','me','te','se','ce','ca','cette','ces','mon','ton','son','ma','ta','sa','mes','tes','ses','que','qui','quoi',
    'est','es','suis','sont','pas','ne','plus','pour','par','sur','dans','avec','sans','mais','donc','oui','non','the','and',
    'you','to','of','is','it','in','on','for','moi','toi','lui','leur','y','si','tres','bien','fait','faire','va','vas'
  ]) or length(p_word) < 3;
$$;

-- Chaque signalement propose ses mots (inconnus) au Super Admin.
create or replace function public.keep_moderation_propose_from_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_excerpt text := coalesce(new.context->>'excerpt', new.details, '');
  v_word text;
begin
  if btrim(v_excerpt) = '' then return new; end if;
  for v_word in
    select distinct w from unnest(string_to_array(public.keep_moderation_normalize(v_excerpt), ' ')) as w
    where w <> '' and not public.keep_moderation_is_stopword(w)
    limit 25
  loop
    insert into public.moderation_terms(term, normalized, category, status, source, report_count, example_excerpt)
    values (v_word, v_word, 'AUTRE', 'PENDING', 'REPORT', 1, left(v_excerpt, 200))
    on conflict (normalized) do update
      set report_count = public.moderation_terms.report_count + 1,
          example_excerpt = coalesce(public.moderation_terms.example_excerpt, excluded.example_excerpt)
      where public.moderation_terms.status = 'PENDING';
  end loop;
  return new;
end;
$function$;
revoke all on function public.keep_moderation_propose_from_report() from public, anon, authenticated;

drop trigger if exists user_reports_propose_moderation_terms on public.user_reports;
create trigger user_reports_propose_moderation_terms
  after insert on public.user_reports
  for each row execute function public.keep_moderation_propose_from_report();

-- Super Admin : file, décision, ajout manuel.
create or replace function public.admin_moderation_terms(p_status text default 'PENDING', p_limit integer default 200)
returns table(id uuid, term text, category text, status text, source text, report_count integer, example_excerpt text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not exists(select 1 from public.admin_users a where a.id=auth.uid() and a.is_active=true and a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return query
  select t.id, t.term, t.category, t.status, t.source, t.report_count, t.example_excerpt, t.created_at
  from public.moderation_terms t
  where p_status is null or t.status = upper(p_status)
  order by t.report_count desc, t.created_at desc
  limit greatest(1, least(coalesce(p_limit,200), 500));
end;
$function$;
revoke all on function public.admin_moderation_terms(text,integer) from public, anon;
grant execute on function public.admin_moderation_terms(text,integer) to authenticated;

create or replace function public.admin_moderation_decide_term(p_term_id uuid, p_status text, p_category text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_status text := upper(coalesce(p_status,''));
begin
  if not exists(select 1 from public.admin_users a where a.id=auth.uid() and a.is_active=true and a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if v_status not in ('ACTIVE','PENDING','REJECTED') then raise exception 'invalid_status' using errcode='22023'; end if;
  update public.moderation_terms
  set status = v_status,
      category = coalesce(upper(p_category), category),
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_term_id;
  if not found then raise exception 'term_not_found' using errcode='P0002'; end if;
end;
$function$;
revoke all on function public.admin_moderation_decide_term(uuid,text,text) from public, anon;
grant execute on function public.admin_moderation_decide_term(uuid,text,text) to authenticated;

create or replace function public.admin_moderation_add_term(p_term text, p_category text default 'AUTRE')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_norm text := public.keep_moderation_normalize(p_term);
  v_id uuid;
begin
  if not exists(select 1 from public.admin_users a where a.id=auth.uid() and a.is_active=true and a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if length(v_norm) < 2 then raise exception 'term_too_short' using errcode='22023'; end if;
  insert into public.moderation_terms(term, normalized, category, status, source, reviewed_at, reviewed_by)
  values (btrim(p_term), v_norm, upper(coalesce(p_category,'AUTRE')), 'ACTIVE', 'ADMIN', now(), auth.uid())
  on conflict (normalized) do update set status='ACTIVE', category=excluded.category, reviewed_at=now(), reviewed_by=auth.uid()
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.admin_moderation_add_term(text,text) from public, anon;
grant execute on function public.admin_moderation_add_term(text,text) to authenticated;
