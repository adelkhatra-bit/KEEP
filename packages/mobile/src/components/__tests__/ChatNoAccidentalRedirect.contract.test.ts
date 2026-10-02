import fs from 'fs';
import path from 'path';

// Adel (02/10/2026) : « des manipulations te redirigent sur le profil » et
// « c'est lent, je suis obligé de rafraîchir ».
const panel = fs.readFileSync(path.join(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'supabaseClient.ts'), 'utf8');

describe('chat: no accidental profile redirect, open thread first in the network queue', () => {
  it('message header is not a tap target; profile opens only from the ••• menu', () => {
    expect(panel).not.toContain('<TouchableOpacity style={s.author} onPress={() => onOpenProfile(message.username)}>');
    expect(panel).toContain('<View style={s.author}>');
    expect(panel).toContain("{ text: 'Voir le profil', onPress: () => onOpenProfile(message.username) },");
    expect(panel).toContain("{ text: 'Message privé', onPress: () => { void openDirectThread(");
  });

  it('open conversation reloads and sends use the priority network lane', () => {
    for (const rpc of ['keep_agora_group_messages_v2', 'keep_agora_direct_messages_v2', 'keep_agora_post_message_v5', 'keep_agora_post_group_message_v2', 'keep_agora_post_group_offer']) {
      expect(client).toContain(`'/rest/v1/rpc/${rpc}',`);
    }
  });
});
