-- Messages éphémères + effacer une conversation (Adel 05/10/2026). Additif uniquement : aucune donnée de message supprimée.
create table if not exists public.music_agora_conversation_prefs (
  profile_id uuid not null default auth.uid(),
  conv_key text not null check (char_length(conv_key) between 4 and 80),
  ephemeral boolean not null default false,
  cleared_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, conv_key)
);
alter table public.music_agora_conversation_prefs enable row level security;
drop policy if exists agora_conv_prefs_own_select on public.music_agora_conversation_prefs;
create policy agora_conv_prefs_own_select on public.music_agora_conversation_prefs for select to authenticated using (profile_id = auth.uid());
drop policy if exists agora_conv_prefs_own_insert on public.music_agora_conversation_prefs;
create policy agora_conv_prefs_own_insert on public.music_agora_conversation_prefs for insert to authenticated with check (profile_id = auth.uid());
drop policy if exists agora_conv_prefs_own_update on public.music_agora_conversation_prefs;
create policy agora_conv_prefs_own_update on public.music_agora_conversation_prefs for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Une vente lancée depuis le chat dure 24 h : ensuite l'offre se désactive (elle disparaît du chat et du profil) ; il faut refaire une demande.
-- On ne touche pas à une offre qui a un paiement en attente.
create or replace function public.keep_expire_chat_sale_offers() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  update public.playlist_sale_offers o set is_active = false, updated_at = now()
  where o.is_active and o.target_buyer_id is not null and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.playlist_sale_payments p where p.offer_id = o.id and p.status = 'PENDING');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.keep_expire_chat_sale_offers() from public, anon, authenticated;
select cron.schedule('keep-expire-chat-sale-offers', '*/10 * * * *', $$select public.keep_expire_chat_sale_offers()$$);

-- Effacer une conversation : l'horodatage vient du SERVEUR (pas de décalage d'horloge qui masquerait le prochain message).
create or replace function public.keep_agora_clear_conversation(p_conv_key text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  insert into public.music_agora_conversation_prefs (profile_id, conv_key, cleared_at, updated_at)
  values (auth.uid(), p_conv_key, now(), now())
  on conflict (profile_id, conv_key) do update set cleared_at = now(), updated_at = now();
end $$;
revoke all on function public.keep_agora_clear_conversation(text) from public, anon;
grant execute on function public.keep_agora_clear_conversation(text) to authenticated;
