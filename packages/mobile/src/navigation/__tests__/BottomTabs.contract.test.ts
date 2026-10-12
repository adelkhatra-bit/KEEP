// @ts-nocheck
import fs from 'fs';
import path from 'path';

const navigation = fs.readFileSync(path.resolve(__dirname, '..', 'Navigation.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Loki bottom tabs contract', () => {
  it('keeps exactly the five canonical tabs', () => {
    const screens = [...navigation.matchAll(/<Tab\.Screen\b/g)];
    expect(screens).toHaveLength(5);
    expect(navigation).toContain('name="Listen"');
    expect(navigation).toContain('name="Discover"');
    expect(navigation).toContain('name="MyMusic"');
    expect(navigation).toContain('name="Parties"');
    expect(navigation).toContain('name="Profile"');
  });

  it('keeps Playlists connected to MyMusicScreen', () => {
    expect(navigation).toContain('import MyMusicScreen');
    expect(navigation).toContain('name="MyMusic" options=');
    expect(navigation).toContain('<MyMusicScreen key={`MyMusic-${tabEpoch.MyMusic}`}');
    expect(navigation).toContain("tabBarLabel: 'Playlists'");
  });

  it('returns each of the five PC and mobile tabs to its landing screen on every menu click', () => {
    expect(navigation).toContain('tabHomeSubscribers.add(reset)');
    expect(navigation).toContain('requestTabHome(route.name)');
    expect(navigation).toContain('requestTabHome(name)');
    expect(navigation).toContain('onSelect={goToTab}');
    expect(navigation).toContain('onPress={() => goToTab(item.name)}');
    for (const [tab, screen] of [
      ['Listen', 'HomeScreenCompact'], ['Discover', 'DiscoverScreen'],
      ['MyMusic', 'MyMusicScreen'], ['Parties', 'PartiesScreen'],
      ['Profile', 'ProfilePublicScreen'],
    ]) {
      expect(navigation).toContain(`<${screen} key={\`${tab}-\\${tabEpoch.${tab}}\`}`);
    }
  });

  it('protects an ongoing Battle/Solo and a live microphone from tab resets', () => {
    expect(navigation).toContain("isGameInProgress && name === 'Parties'");
    expect(navigation).toContain("isActive && name === 'Listen'");
    expect(navigation).toContain('confirmLeaveGame(() => { requestTabHome(route.name); navigation.navigate(route.name); })');
  });

  it('keeps GitHub Pages refresh routing for every main tab', () => {
    expect(navigation).toContain("MyMusic: 'MyMusic'");
    expect(navigation).toContain("Parties: 'Parties'");
    expect(navigation).toContain("Profile: 'Profile'");
    expect(navigation).toContain('getStateFromPath(stripGitHubPagesBasePath(path), options)');
  });
});
