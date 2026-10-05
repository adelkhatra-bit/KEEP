// @ts-nocheck
import fs from 'fs';
import path from 'path';

const service = fs.readFileSync(path.resolve(__dirname, '..', 'lokiPulseService.ts'), 'utf8').replace(/\r\n/g, '\n');
const home = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8').replace(/\r\n/g, '\n');
const profile = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Pulse outage resilience contract', () => {
  it('stores the last valid Pulse per authenticated profile', () => {
    expect(service).toContain("PULSE_CACHE_PREFIX = 'keep:loki-pulse:last-good:v1:'");
    expect(service).toContain('pulseMemoryCache');
    expect(service).toContain('AsyncStorage.setItem(pulseCacheKey(profileId)');
    expect(service).toContain('if (cached.length) return cached');
  });

  it('loads owner/home Pulse with the exact user id and never clears visible bubbles on a transient error', () => {
    expect(home).not.toContain('loadLokiPulse(24, user.id)'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(profile).toContain('loadLokiPulse(60, user.id)');
    expect(home).not.toContain('catch {\n        if (live) setHomePulseItems([]);');
    expect(profile).not.toContain('catch {\n        if (live) setLokiPulseItems([]);');
  });
});
