// @ts-nocheck
import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261002007000_chat_scale_indexes.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('chat scale indexes contract', () => {
  for (const token of [
    'music_agora_direct_notification_deliveries(profile_id)',
    'music_agora_group_members(invited_by)',
    'music_agora_group_messages(profile_id)',
    'music_agora_group_messages(shared_track_id)',
    'music_agora_groups(owner_id)',
    'music_agora_messages(shared_track_id)',
    'music_agora_room_subscriptions(room_slug)',
  ]) {
    it(`indexes ${token}`, () => expect(sql).toContain(token));
  }
});
