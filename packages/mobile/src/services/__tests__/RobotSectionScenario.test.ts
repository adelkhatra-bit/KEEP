jest.mock('react-native', () => ({ useWindowDimensions: () => ({ width: 390 }) }));
import fs from 'fs';
import path from 'path';
import { scenarioForRoute, sectionOfRoute, SECTION_SCENARIOS } from '../robotSectionScenario';
import { designProfileForWidth, DESIGN_PROFILES } from '../../theme/designProfile';

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...p), 'utf8');

describe('Robot : scénario par rubrique', () => {
  it('reconnaît les 5 rubriques et traite le reste comme neutre', () => {
    expect(['Listen', 'Discover', 'MyMusic', 'Parties', 'Profile'].map(sectionOfRoute)).toEqual(['PULSE', 'DISCOVER', 'PLAYLISTS', 'PARTIES', 'PROFILE']);
    expect(sectionOfRoute('Offers')).toBe('OTHER');
    expect(sectionOfRoute(null)).toBe('OTHER');
  });
  it('chaque rubrique : phrase d\'ouverture, ≥ 3 conseils, propositions + « Un souci », sans « @ »', () => {
    for (const [section, scenario] of Object.entries(SECTION_SCENARIOS)) {
      expect(scenario.intro.length).toBeGreaterThan(40);
      expect(scenario.tips.length).toBeGreaterThanOrEqual(3);
      const route = { PULSE: 'Listen', DISCOVER: 'Discover', PLAYLISTS: 'MyMusic', PARTIES: 'Parties', PROFILE: 'Profile' }[section as string]!;
      const out = scenarioForRoute(route, '@adel4A', 3);
      expect(out.text).not.toContain('@');
      expect(out.text).toContain('adel4A');
      expect(out.actions.at(-1)?.key).toBe('REPORT');
      expect(out.actions.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('le profil propose playlist / soirée / story / partage PC', () => {
    const all = SECTION_SCENARIOS.PROFILE.tips.join(' ');
    expect(all).toMatch(/playlist/i);
    expect(all).toMatch(/soirée/i);
    expect(all).toMatch(/story/i);
    expect(all).toMatch(/Partager sur mon PC/);
  });
  it('rubrique inconnue : menu général, secousse et 5 touchers passent par le même scénario', () => {
    expect(scenarioForRoute('Offers', 'adel', 0).text).toContain('On fait quoi');
    expect(src('src/components/ProblemReportHost.tsx')).toContain('currentScreenName())');
    expect(src('src/services/robotCoachService.ts')).toContain("sectionOfRoute(routeName) !== 'OTHER'");
  });
});

describe('Design : profils téléphone / ordinateur', () => {
  it('seuils et zoom alignés avec index.js et fix-web-export', () => {
    expect(designProfileForWidth(390).kind).toBe('mobile');
    expect(designProfileForWidth(1440).kind).toBe('desktop');
    expect(designProfileForWidth(1920).kind).toBe('wide');
    expect(src('index.js')).toContain(`zoom:${DESIGN_PROFILES.desktop.pageZoom}`);
    expect(src('index.js')).toContain(`zoom:${DESIGN_PROFILES.wide.pageZoom}`);
    expect(src('scripts/fix-web-export.cjs')).toContain(`zoom:${DESIGN_PROFILES.wide.pageZoom}`);
  });
  it('le robot est un peu plus gros sur téléphone et sur ordinateur', () => {
    expect(DESIGN_PROFILES.mobile.botScale).toBeGreaterThan(1);
    expect(DESIGN_PROFILES.desktop.botScale).toBeGreaterThan(DESIGN_PROFILES.mobile.botScale);
    expect(src('src/components/GlobalChatDock.tsx')).toContain('scale: designProfile.botScale');
  });
});
