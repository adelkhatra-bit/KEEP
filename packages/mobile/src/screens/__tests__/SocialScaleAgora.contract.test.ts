import fs from 'fs';
import path from 'path';

const read=(...parts:string[])=>fs.readFileSync(path.resolve(__dirname,'..','..','..',...parts),'utf8');

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

  it('adds a moderated short-form music community without anonymous DMs',()=>{
    const panel=read('components','MusicAgoraPanel.tsx');
    expect(panel).toContain('LA PLACE');
    expect(panel).toContain('maxLength={280}');
    expect(panel).toContain('Pas de DM ici');
    expect(panel).toContain('reportMusicAgoraMessage');
    expect(panel).toContain('blockUser');
  });

  it('separates music drops from events on a visited profile',()=>{
    const visitor=read('screens','PublicUserProfileScreen.tsx');
    expect(visitor).toContain('Drops musicaux');
    expect(visitor).toContain('eventSpotlightTitle');
    expect(visitor).toContain('À VIVRE');
    expect(visitor).not.toContain('Vendu par @{profile.username}');
  });

  it('makes the recognition action immediately understandable',()=>{
    const home=read('screens','HomeScreenCompact.tsx');
    expect(home).toContain('TON RADAR MUSICAL & SOCIAL');
    expect(home).toContain('IDENTIFIER UN MORCEAU');
  });
});
