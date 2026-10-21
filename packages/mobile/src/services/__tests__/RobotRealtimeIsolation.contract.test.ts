import fs from 'fs';
import path from 'path';

// Les robots du dossier e2e/journeys utilisent un faux Supabase. page.route()
// n'intercepte pas les WebSocket : chaque contexte navigateur doit couper le
// temps réel, sinon le robot se connecte à la production (constaté le
// 20-21/10/2026 : 6 768 « JwtSignatureError » dans les journaux Realtime).

const DIR = path.resolve(__dirname, '..', '..', '..', 'e2e', 'journeys');

describe('robots — aucune connexion temps réel vers la production', () => {
  const robots = fs.readdirSync(DIR).filter((file) => file.endsWith('.cjs') && file !== 'fake-supabase.cjs');

  it('le faux Supabase fournit la coupure du temps réel', () => {
    const fake = fs.readFileSync(path.join(DIR, 'fake-supabase.cjs'), 'utf8');
    expect(fake).toContain('async function isolateRealtime(context)');
    expect(fake).toContain('context.routeWebSocket(/supabase\\.co/');
  });

  it.each(robots)('%s : chaque contexte navigateur coupe le temps réel', (file) => {
    const source = fs.readFileSync(path.join(DIR, file), 'utf8');
    const contexts = (source.match(/newContext\(/g) || []).length;
    const isolated = (source.match(/isolateRealtime\(/g) || []).length;
    expect(isolated).toBeGreaterThanOrEqual(contexts);
  });
});
