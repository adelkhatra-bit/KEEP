jest.mock('../supabaseClient', () => ({ supabase: null }));
import fs from 'fs';
import path from 'path';
import { pcShareHoursLeft, pcShareMessage, PC_SHARE_DURATION_HOURS } from '../pcShareService';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', ...p), 'utf8');

describe('Partager sur mon PC · 24 h', () => {
  it('durée 24 h, heures restantes arrondies, 0 une fois expiré', () => {
    expect(PC_SHARE_DURATION_HOURS).toBe(24);
    const created = '2026-10-10T00:00:00Z';
    expect(pcShareHoursLeft(created, Date.parse('2026-10-10T00:30:00Z'))).toBe(24);
    expect(pcShareHoursLeft(created, Date.parse('2026-10-10T23:30:00Z'))).toBe(1);
    expect(pcShareHoursLeft(created, Date.parse('2026-10-11T00:00:00Z'))).toBe(0);
  });
  it('le popup annonce toujours le tarif, y compris à 0', () => {
    expect(pcShareMessage(0)).toContain('gratuit');
    expect(pcShareMessage(0)).toContain('Bientôt payant en FREE');
    expect(pcShareMessage(5)).toContain('5 FREE');
    expect(pcShareMessage(0)).toContain('24 h');
  });
  it('bouton dans le panneau, durée appliquée côté serveur, prix piloté par le Super Admin', () => {
    expect(read('packages/mobile/src/components/WebCompanionSessionsPanel.tsx')).toContain('Partager sur mon PC');
    const fn = read('supabase/functions/keep-web-pairing/index.ts');
    expect(fn).toContain('PC_SHARE_DURATION_MS = 24 * 60 * 60 * 1000');
    expect(fn).toContain('expired: true');
    expect(read('packages/admin/pages/remote-config.tsx')).toContain('web_share_free_cost');
    expect(read('supabase/migrations/20261010120000_web_share_free_cost_config.sql')).toContain("'web_share_free_cost', '0'");
  });
});
