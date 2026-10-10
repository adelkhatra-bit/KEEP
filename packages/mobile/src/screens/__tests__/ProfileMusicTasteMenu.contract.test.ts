// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Profile music taste menu contract', () => {
  const source = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('places editable Loki Pulse tastes between Card and social links', () => {
    const menuStart = source.indexOf("title: 'PROFIL'");
    const menuEnd = source.indexOf("title: 'COMMUNAUTÉ'", menuStart);
    const menu = source.slice(menuStart, menuEnd);
    expect(menu.indexOf("label: 'Réglages du profil'")).toBeGreaterThan(-1);
    expect(menu.indexOf("label: 'Carte'")).toBeGreaterThan(menu.indexOf("label: 'Réglages du profil'"));
    expect(menu.indexOf("label: 'Mes goûts musicaux'")).toBeGreaterThan(menu.indexOf("label: 'Carte'"));
    expect(menu.indexOf("label: 'Réseaux & site web'")).toBeGreaterThan(menu.indexOf("label: 'Mes goûts musicaux'"));
  });

  it('opens the existing Pulse questionnaire without using Battle settings', () => {
    expect(source).toContain("if (key === 'musicTaste')");
    expect(source).toContain('setPulseTasteOpen(true)');
    expect(source).toContain('<MusicTasteQuestionnaire');
    expect(contract.profileOwner.musicTasteSettings.separateFromBattleSoloPreferences).toBe(true);
    expect(contract.profileOwner.musicTasteSettings.battleSoloPreferencesMustNeverOverwritePulseTaste).toBe(true);
  });
});
