-- Accusé de lecture des messages privés (Adel 05/10/2026) : « vu » / « en attente ». Additif.
create table if not exists public.music_agora_direct_reads (
  reader_id uuid not null default auth.uid(),
  peer_id uuid not null,
  last_read_message_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (reader_id, peer_id)
);
alter table public.music_agora_direct_reads enable row level security;
drop policy if exists agora_direct_reads_select on public.music_agora_direct_reads;
create policy agora_direct_reads_select on public.music_agora_direct_reads for select to authenticated using (reader_id = auth.uid() or peer_id = auth.uid());
create or replace function public.keep_agora_mark_direct_read(p_peer uuid, p_message_id bigint) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  insert into public.music_agora_direct_reads (reader_id, peer_id, last_read_message_id, updated_at)
  values (auth.uid(), p_peer, greatest(p_message_id, 0), now())
  on conflict (reader_id, peer_id) do update
    set last_read_message_id = greatest(public.music_agora_direct_reads.last_read_message_id, excluded.last_read_message_id), updated_at = now();
end $$;
revoke all on function public.keep_agora_mark_direct_read(uuid, bigint) from public, anon;
grant execute on function public.keep_agora_mark_direct_read(uuid, bigint) to authenticated;
