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


-- Branding visible Loki Music : nettoie les anciennes notifications visibles
-- et remplace les derniers libellés KEEP dans les générateurs Battle existants.
-- Les identifiants techniques keep_* / NEW_PUBLIC_KEEP restent inchangés.
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
  title = replace(replace(title, 'KEEP Battle', 'Loki Music Battle'), 'Battle KEEP', 'Loki Music Battle'),
  body = replace(
           replace(
             replace(body, 'groupe KEEP Battle', 'groupe Loki Music Battle'),
             'partage KEEP à un ami', 'partage Loki Music à un ami'
           ),
           'Battle KEEP', 'Loki Music Battle'
         )
where type like 'BATTLE_%'
  and (title ilike '%KEEP%' or body ilike '%KEEP%');

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
      and p.proname in (
        'keep_apply_battle_free_credit_result',
        'keep_battle_arena_challenge_send',
        'keep_battle_challenge_respond',
        'keep_battle_challenge_send',
        'keep_battle_matchmake',
        'keep_battle_matchmake_v2',
        'notify_followers_on_public_keep'
      )
  loop
    original_def := pg_get_functiondef(r.oid);
    new_def := original_def;
    new_def := replace(new_def, 'Nouveau KEEP de @', 'Nouveau morceau chez @');
    new_def := replace(new_def, 'groupe KEEP Battle', 'groupe Loki Music Battle');
    new_def := replace(new_def, 'KEEP Battle', 'Loki Music Battle');
    new_def := replace(new_def, 'Battle KEEP', 'Loki Music Battle');
    new_def := replace(new_def, 'partage KEEP à un ami', 'partage Loki Music à un ami');
    new_def := replace(new_def, 'coalesce(v_username, ''KEEP'')', 'coalesce(v_username, ''Loki'')');
    new_def := replace(new_def, 'coalesce(nullif(username,''''),''KEEP'')', 'coalesce(nullif(username,''''),''Loki'')');
    if new_def <> original_def then
      execute new_def;
    end if;
  end loop;
end
$branding$;
