-- Chat scale guard: cover foreign keys used by deletes, membership lookups
-- and message/notification joins before user volume grows.
create index if not exists idx_music_agora_direct_notification_deliveries_profile_id
  on public.music_agora_direct_notification_deliveries(profile_id);

create index if not exists idx_music_agora_group_members_invited_by
  on public.music_agora_group_members(invited_by);

create index if not exists idx_music_agora_group_messages_profile_id
  on public.music_agora_group_messages(profile_id);

create index if not exists idx_music_agora_group_messages_shared_track_id
  on public.music_agora_group_messages(shared_track_id);

create index if not exists idx_music_agora_groups_owner_id
  on public.music_agora_groups(owner_id);

create index if not exists idx_music_agora_messages_shared_track_id
  on public.music_agora_messages(shared_track_id);

create index if not exists idx_music_agora_room_subscriptions_room_slug
  on public.music_agora_room_subscriptions(room_slug);
