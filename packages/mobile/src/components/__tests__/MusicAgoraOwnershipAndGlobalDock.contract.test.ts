// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Music Agora ownership + global dock contract', () => {
  const components = path.resolve(__dirname, '..');
  const mobile = path.resolve(components, '..', '..');
  const repoRoot = path.resolve(mobile, '..', '..');
  const app = read(mobile, 'App.tsx');
  const dock = read(components, 'GlobalChatDock.tsx');
  const panel = read(components, 'MusicAgoraPanel.tsx');
  const service = read(mobile, 'src', 'services', 'musicAgoraService.ts');
  const myMusic = read(mobile, 'src', 'screens', 'MyMusicScreen.tsx');
  const ownership = read(repoRoot, 'supabase', 'migrations', '20261001214500_chat_music_ownership_and_resale_guard.sql');
  const paidShare = read(repoRoot, 'supabase', 'migrations', '20261001215000_chat_paid_share_v4.sql');

  it('mounts exactly one app-wide dock outside individual screens', () => {
    // Adel (02/10/2026) : un seul robot monté, à la racine ou dans l'aperçu ouvert.
    expect(app).toContain("import { RootChatDock } from './src/components/ChatDockHost';");
    expect(app).toContain('{authReady && user ? <RootChatDock /> : null}');
    expect(dock).toContain('PanResponder.create');
    expect(dock).toContain("side === 'left' ? styles.fabLeft : styles.fabRight");
    expect(dock).not.toContain('if (settings.homeEnabled) openChat()');
    expect(dock).toContain('styles.badge');
    expect(dock).toContain('unreadCount');
  });

  it('forces paid shares to stay masked until unlock', () => {
    expect(panel).toContain("if (sharePaymentMode !== 'NONE') setShareRevealMode('MASKED');");
    expect(panel).toContain("sharePaymentMode!=='NONE'&&s.revealChipDisabled");
    expect(paidShare).toContain("v_reveal := 'MASKED'");
    expect(paidShare).toContain("set sale_offer_id=v_offer_id,music_reveal_mode='MASKED'");
  });

  it('blocks resale of music acquired from another user on server and UI', () => {
    expect(ownership).toContain('keep_profile_can_resell_track');
    expect(ownership).toContain('CHAT_TRACK_RESALE_FORBIDDEN');
    expect(panel).toContain('ne t’appartient pas');
    expect(panel).toContain('sharePreflight?.canSell');
    expect(panel).toContain("'🔒 FREE'");
    expect(panel).toContain("'🔒 €'");
    expect(panel).toContain('🔒 PARTAGE UNIQUEMENT');
    expect(ownership).toContain('trg_keep_chat_sale_offer_track_guard');
  });

  it('prevents charging a recipient who already owns the track', () => {
    expect(paidShare).toContain('CHAT_TARGET_ALREADY_OWNS_TRACK');
    expect(panel).toContain('targetOwnsTrack');
    expect(panel).toContain('a déjà cette musique');
  });

  it('keeps discovery/source attribution visible outside the music card', () => {
    expect(panel).toContain('style={s.musicAttribution}');
    expect(panel).toContain('Découverte par @');
    expect(panel).toContain('mise à l’écoute par @');
    expect(service).toContain("supabase.rpc('keep_agora_messages_v6'");
    expect(service).toContain("supabase.rpc('keep_agora_post_message_v5'");
  });

  it('keeps external euro unlocks web-only for digital music', () => {
    expect(panel).toContain("Platform.OS === 'web' ? <TouchableOpacity");
    expect(panel).toContain("sharePaymentMode === 'MONEY' && Platform.OS === 'web'");
    expect(panel).toContain("message.paymentMode === 'MONEY' && Platform.OS !== 'web'");
    expect(panel).toContain('€ INDISPONIBLE SUR L’APP');
    expect(myMusic).toContain("sellPaymentMode === 'MONEY' && Platform.OS !== 'web'");
    expect(myMusic).toContain("Platform.OS === 'web' ? <TouchableOpacity");
    expect(myMusic).toContain('Paiement € indisponible dans l’app');
  });
});
