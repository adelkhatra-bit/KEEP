-- Séparation stricte des bibliothèques KEEP entre comptes.
-- Un nouveau compte ne doit jamais hériter de morceaux issus d'un ancien
-- essai local / d'une autre identité sur le même navigateur ou téléphone.

create or replace function public.guard_keep_decision_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_created_at timestamptz;
  v_detected_at timestamptz;
  v_source text;
begin
  -- Les KEEP explicitement récupérés depuis le profil d'un autre utilisateur
  -- sont autorisés et comptés séparément (KEEP utilisateur, zéro crédit écoute).
  if new.source_user_id is not null
     or coalesce(new.context->>'creditPolicy', '') = 'SOCIAL_ZERO_CREDIT' then
    return new;
  end if;

  v_source := coalesce(new.context->>'source', '');

  -- Politique produit 2026-08-27 : le contenu musical de l'essai reste local.
  -- Seuls profil + consommation de crédits peuvent être repris à l'inscription.
  if v_source = 'guest_upgrade' then
    raise exception 'guest_music_cannot_be_imported_into_account'
      using errcode = 'P0001';
  end if;

  select created_at
    into v_profile_created_at
    from public.profiles
   where id = new.profile_id;

  if v_profile_created_at is null then
    raise exception 'profile_not_found_for_keep_decision'
      using errcode = 'P0001';
  end if;

  begin
    if nullif(new.context->>'detectedAt', '') is not null then
      v_detected_at := (new.context->>'detectedAt')::timestamptz;
    end if;
  exception when others then
    v_detected_at := null;
  end;

  -- Défense serveur contre un ancien cache/session locale réinjecté après
  -- connexion à un autre compte. Deux minutes couvrent uniquement un léger
  -- décalage d'horloge appareil/serveur, pas un historique antérieur.
  if v_detected_at is not null
     and v_detected_at < (v_profile_created_at - interval '2 minutes') then
    raise exception 'stale_local_music_cannot_be_attached_to_account'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_keep_decision_owner on public.keep_decisions;
create trigger trg_guard_keep_decision_owner
before insert or update of profile_id, context, source_user_id
on public.keep_decisions
for each row
execute function public.guard_keep_decision_owner();
