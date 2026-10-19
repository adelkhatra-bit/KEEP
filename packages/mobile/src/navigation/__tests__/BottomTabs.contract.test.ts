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
    expect(navigation).toContain('name="MyMusic" component={MyMusicScreen}');
    expect(navigation).toContain("tabBarLabel: 'Playlists'");
  });

  it('reselecting the global Soirées taskbar item resets Parties to its home, including from Battle', () => {
    expect(navigation).toContain("(navigation.navigate as any)('Parties', { returnToSoireesRequestId: soireesResetRequestId });");
    const parties = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'PartiesScreen.tsx'), 'utf8');
    const reset = parties.slice(parties.indexOf('const requestId = route?.params?.returnToSoireesRequestId;'), parties.indexOf('const openBattle = Boolean(route?.params?.openBattle);'));
    expect(reset).toContain("setPartiesTab('SOIREES')");
    expect(reset).toContain('setPartyHome(true)');
    expect(reset).toContain('setBattleOpen(false)');
  });

  it('keeps GitHub Pages refresh routing for every main tab', () => {
    expect(navigation).toContain("MyMusic: 'MyMusic'");
    expect(navigation).toContain("Parties: 'Parties'");
    expect(navigation).toContain("Profile: 'Profile'");
    expect(navigation).toContain('getStateFromPath(stripGitHubPagesBasePath(path), options)');
  });
});
