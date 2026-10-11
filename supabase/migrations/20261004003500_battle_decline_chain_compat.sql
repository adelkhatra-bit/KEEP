-- Compatibilité de chaîne avant 20261004003600.
-- Certaines bases reconstruites depuis zéro arrivent ici avec l'ancienne
-- variante qui créait une notification BATTLE_CHALLENGE_DECLINED.
-- On normalise uniquement le corps de la fonction ; aucune ligne utilisateur
-- n'est modifiée par cette migration.

do $migration$
declare
  ddl text;
  old_block text := $old$
  if not p_accept then
    update public.keep_battle_challenges set status='DECLINED',updated_at=now() where id=c.id;
    insert into public.notifications(profile_id,type,title,body,data)
    values(c.challenger_id,'BATTLE_CHALLENGE_DECLINED','Battle refusé',format('@%s a refusé le Battle. Invite un autre joueur ou partage KEEP à un ami.',my_name),jsonb_build_object('challengeId',c.id,'targetId',uid,'suggestShare',true));
    return jsonb_build_object('id',c.id,'status','DECLINED');
  end if;
$old$;
  normalized_block text := $new$
  if not p_accept then
    update public.keep_battle_challenges set status='DECLINED',updated_at=now() where id=c.id;
    -- Pas de notification externe/inbox pour un refus : le challenger voit
    -- simplement que le bouton redevient disponible. Évite le doublon avec
    -- le feedback local et le bruit push.
    return jsonb_build_object('id',c.id,'status','DECLINED');
  end if;
$new$;
  confirmed_block text := $confirmed$
  if not p_accept then
    raise exception 'BATTLE_CHALLENGE_DECLINE_REQUIRES_CONFIRMED_ACTION';
  end if;
$confirmed$;
begin
  select pg_get_functiondef('public.keep_battle_challenge_respond(uuid,boolean)'::regprocedure)
  into ddl;

  if strpos(ddl,normalized_block)>0 or strpos(ddl,confirmed_block)>0 then
    return;
  end if;

  if strpos(ddl,old_block)=0 then
    raise exception 'BATTLE_DECLINE_COMPAT_BLOCK_NOT_FOUND';
  end if;

  ddl := replace(ddl,old_block,normalized_block);
  execute ddl;
end;
$migration$;
