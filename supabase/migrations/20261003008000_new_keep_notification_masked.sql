-- Adel (02/10/2026) : « la notification donne le titre complet de la musique
-- ajoutée à son profil — l'utilisateur écoute puis l'ajoute de son côté ».
--
-- Notification NEW_PUBLIC_KEEP (et donc le push, qui reprend title/body) :
-- plus aucun titre, artiste ni pochette. L'abonné écoute un extrait masqué
-- et GARDE depuis la notification ; le titre se révèle après l'ajout (app).
-- data garde trackId (extrait + GARDER) et le profil d'origine.
--
-- Seule la fonction de déclenchement change. Les notifications déjà envoyées
-- ne sont pas modifiées : l'application masque leur texte à l'affichage.

create or replace function public.notify_followers_on_public_keep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_follower record;
begin
  if new.decision <> 'KEPT' or new.visibility <> 'PUBLIC' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.decision = 'KEPT'
     and old.visibility = 'PUBLIC' then
    return new;
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = new.profile_id;

  for v_follower in
    select f.follower_id
    from public.follows f
    left join public.notification_preferences np
      on np.profile_id = f.follower_id
    where f.followee_id = new.profile_id
      and coalesce(np.social_enabled, true) = true
  loop
    insert into public.profile_music_notification_sends(decision_id, follower_id)
    values (new.id, v_follower.follower_id)
    on conflict do nothing;

    if found then
      insert into public.notifications(profile_id, type, title, body, data)
      values (
        v_follower.follower_id,
        'NEW_PUBLIC_KEEP',
        'Nouveau morceau chez @' || coalesce(v_username, 'Loki'),
        'Titre masqué · écoute l’extrait et garde-le pour découvrir le titre.',
        jsonb_build_object(
          'ownerProfileId', new.profile_id,
          'username', v_username,
          'trackId', new.track_id,
          'decisionId', new.id,
          'masked', true,
          'kind', 'new_public_keep'
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_followers_on_public_keep() from public, anon, authenticated;
grant execute on function public.notify_followers_on_public_keep() to service_role;


-- Branding visible Loki Music :
-- tout texte présenté à l'utilisateur dit Loki / Loki Music.
-- Les identifiants techniques keep_* / KEEP (décisions), NEW_PUBLIC_KEEP,
-- marqueurs [[KEEP_*]], URLs /KEEP et codes internes restent inchangés.

update public.notifications
set
  title = case
    when coalesce(data->>'username','') <> '' then 'Nouveau morceau chez @' || (data->>'username')
    else 'Nouveau morceau'
  end,
  body = 'Titre masqué · écoute l’extrait et garde-le pour découvrir le titre.',
  data = coalesce(data,'{}'::jsonb) || '{"masked":true}'::jsonb
where type = 'NEW_PUBLIC_KEEP'
  and (
    title ilike '%KEEP%'
    or body not ilike 'Titre masqué%'
    or coalesce(data->>'masked','false') <> 'true'
  );

update public.notifications
set
  title = replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(title,
                      'Victoire KEEP BATTLE','Victoire Loki Music Battle'),
                    'KEEP BATTLE','Loki Music Battle'),
                  'KEEP Battle','Loki Music Battle'),
                'Battle KEEP','Loki Music Battle'),
              'parrainage KEEP','parrainage Loki Music'),
            'avantage KEEP','avantage Loki Music'),
  body = replace(
           replace(
             replace(
               replace(
                 replace(
                   replace(
                     replace(
                       replace(
                         replace(body,
                           'groupe KEEP Battle','groupe Loki Music Battle'),
                         'dans KEEP Battle','dans Loki Music Battle'),
                       'partage KEEP à un ami','partage Loki Music à un ami'),
                     'profil KEEP','profil Loki Music'),
                   'sur KEEP','sur Loki Music'),
                 'rejoint KEEP','rejoint Loki Music'),
               'membre KEEP','membre Loki Music'),
             'utilisateur KEEP','utilisateur Loki Music'),
           'KEEP BATTLE','Loki Music Battle')
where (title ilike '%KEEP%' or body ilike '%KEEP%')
  and coalesce(body,'') not like '%[[KEEP_%';

update public.notifications
set title='Nouvel abonné'
where title='Nouvel abonnÃ©';

do $branding$
declare
  r record;
  original_def text;
  new_def text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
  loop
    original_def := pg_get_functiondef(r.oid);
    if original_def not ilike '%KEEP%' then
      continue;
    end if;

    new_def := original_def;
    new_def := replace(new_def, 'Nouveau KEEP de @', 'Nouveau morceau chez @');
    new_def := replace(new_def, 'Victoire KEEP BATTLE', 'Victoire Loki Music Battle');
    new_def := replace(new_def, 'KEEP BATTLE', 'Loki Music Battle');
    new_def := replace(new_def, 'KEEP Battle', 'Loki Music Battle');
    new_def := replace(new_def, 'Battle KEEP', 'Loki Music Battle');
    new_def := replace(new_def, 'profil KEEP.', 'profil Loki Music.');
    new_def := replace(new_def, 'profil KEEP', 'profil Loki Music');
    new_def := replace(new_def, ' » grâce à ton KEEP.', ' » grâce à ton ajout sur Loki Music.');
    new_def := replace(new_def, '🎁 Nouveau parrainage KEEP', '🎁 Nouveau parrainage Loki Music');
    new_def := replace(new_def, 'a rejoint KEEP grâce à toi', 'a rejoint Loki Music grâce à toi');
    new_def := replace(new_def, 'création du compte KEEP.', 'création du compte Loki Music.');
    new_def := replace(new_def, 'Un abonnement KEEP', 'Un abonnement Loki Music');
    new_def := replace(new_def, 'Un avantage KEEP pour toi', 'Un avantage Loki Music pour toi');
    new_def := replace(new_def, 'un membre KEEP', 'un membre Loki Music');
    new_def := replace(new_def, 'Un utilisateur KEEP', 'Un utilisateur Loki Music');
    new_def := replace(new_def, 'partage KEEP à un ami', 'partage Loki Music à un ami');
    new_def := replace(new_def, 'coalesce(v_username, ''KEEP'')', 'coalesce(v_username, ''Loki'')');
    new_def := replace(new_def, 'coalesce(nullif(username,''''),''KEEP'')', 'coalesce(nullif(username,''''),''Loki'')');

    if new_def <> original_def then
      execute new_def;
    end if;
  end loop;
end
$branding$;
