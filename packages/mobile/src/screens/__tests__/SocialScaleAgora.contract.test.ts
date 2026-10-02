import fs from 'fs';
import path from 'path';

const read=(...parts:string[])=>fs.readFileSync(path.resolve(__dirname,'..','..',...parts),'utf8');

describe('Social scale and musical agora contracts',()=>{
  it('paginates profile communities instead of loading a giant graph',()=>{
    const panel=read('components','CommunityConnectionsPanel.tsx');
    expect(panel).toContain("keep_profile_connections_page");
    expect(panel).toContain('PAGE_SIZE = 24');
    expect(panel).not.toContain("keep_profile_connections'");
  });

  it('keeps reprisers bounded on the server',()=>{
    const service=read('services','publicProfileStateService.ts');
    expect(service).toContain("keep_profile_reprisers_page");
    expect(service).toContain('Math.min(limit, 40)');
  });

  it('keeps Loki chat realtime, chronological and profile-ready',()=>{
    const panel=read('components','MusicAgoraPanel.tsx');
    const service=read('services','musicAgoraService.ts');
    const profile=read('screens','ProfilePublicScreen.tsx');
    const dock=read('components','GlobalChatDock.tsx');
    const notifications=read('screens','NotificationsScreen.tsx');
    expect(panel).toContain('subscribeMusicAgoraRoom');
    expect(panel).toContain('chatScrollRef.current?.scrollToEnd');
    expect(panel).toContain("{ label: '❤️', payload: '❤️' }");
    expect(panel).toContain("<Text style={[s.drawerActionText, s.drawerActionMusicText]}>MORCEAU</Text>");
    expect(panel).toContain("MESSAGERIE · ACTIVÉE");
    expect(panel).toContain("shellCompact:{position:'absolute'");
    expect(panel).toContain("shellCompact:{position:'absolute',top:0,bottom:0,left:0,right:0");
    expect(panel).toContain("chatScrollCompact:{flex:1");
    expect(panel).toContain('updateHomeChat(false, true)');
    expect(panel).toContain('browsingHistoryRef.current = false');
    expect(service).toContain("return hydrated.sort((a, b) => a.id - b.id)");
    // ad25aa5e refactor(profile): un seul dock de tchat global, monté dans App.tsx.
    expect(profile).not.toContain('<MusicAgoraPanel');
    expect(dock).toContain('<MusicAgoraPanel\n              compact');
    expect(notifications).toContain('CONFIDENTIALITÉ DU PROFIL');
    expect(notifications).toContain("MESSAGERIE LOKI");
    expect(notifications).toContain('updateChatEnabled');
    expect(panel).toContain('reportMusicAgoraMessage');
    expect(panel).toContain('blockUser');
  });

  it('separates music drops from events on a visited profile',()=>{
    const visitor=read('screens','PublicUserProfileScreen.tsx');
    // 02/10/2026 : boutique vendeur (Drop du moment + boutique), distincte des événements.
    expect(visitor).toContain('<SellerBoutique');
    expect(visitor).toContain('eventSpotlightTitle');
    expect(visitor).not.toContain('Vendu par @{profile.username}');
  });

  it('keeps chat off the home screen and only on profile',()=>{
    const home=read('screens','HomeScreenCompact.tsx');
    expect(home).not.toContain('CommunityChatHomeWidget');
    expect(home).not.toContain('<MusicAgoraPanel');
  });

  it('makes the recognition action immediately understandable',()=>{
    const home=read('screens','HomeScreenCompact.tsx');
    expect(home).toContain('TON RADAR MUSICAL & SOCIAL');
    expect(home).toContain('IDENTIFIER UN MORCEAU');
  });
});
