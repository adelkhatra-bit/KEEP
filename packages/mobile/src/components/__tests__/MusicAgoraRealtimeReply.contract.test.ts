// @ts-nocheck
import fs from 'fs';
import path from 'path';

const panel = fs.readFileSync(path.resolve(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8').replace(/\r\n/g, '\n');
const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'musicAgoraService.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('Loki chat realtime + quoted replies', () => {
  it('subscribes the active direct thread to incoming messages for the current user', () => {
    expect(service).toContain('export function subscribeMusicAgoraDirect(');
    expect(service).toContain('target_profile_id=eq.\${currentProfileId}');
    expect(service).toContain("String(row.profile_id || '') === otherProfileId");
    expect(service).toContain('target_profile_id=eq.\${otherProfileId}');
    expect(service).toContain("String(row.profile_id || '') === currentProfileId");
    expect(panel).toContain('subscribeMusicAgoraDirect(currentProfileId, replyTarget.profileId, onLiveMessage)');
  });

  it('keeps a lightweight live safety refresh while a direct/group thread is open', () => {
    expect(panel).toContain('const liveSafetyTimer = setInterval(() => {');
    expect(panel).toContain("if (chatMode === 'MESSAGES' && (replyTarget?.profileId || activeGroup?.id))");
    expect(panel).toContain('}, 2500);');
  });

  it('posts and reads persisted reply metadata', () => {
    expect(service).toContain("supabase.rpc('keep_agora_post_message_v5'");
    expect(service).toContain('p_reply_to_message_id: options.replyToMessageId ?? null');
    expect(service).toContain("supabase.rpc('keep_agora_messages_v6'");
    expect(service).toContain("supabase.rpc('keep_agora_direct_messages_v2'");
    expect(service).toContain("supabase.rpc('keep_agora_group_messages_v2'");
    expect(service).toContain("supabase.rpc('keep_agora_post_group_message_v2'");
    expect(service).toContain('replyToUsername: row.reply_to_username ? String(row.reply_to_username) : null');
  });

  it('renders a WhatsApp-like quoted message and exposes reply in direct chats too', () => {
    expect(panel).toContain('setReplyingToMessage(message);');
    expect(panel).toContain('replyToMessageId: replyingToMessage?.id ?? null');
    expect(panel).toContain('↪ Réponse à @{replyingToMessage.username}');
    expect(panel).toContain('message.replyToMessageId ? (');
    expect(panel).toContain("↪ @{message.replyToUsername || 'message'}");
  });
});
