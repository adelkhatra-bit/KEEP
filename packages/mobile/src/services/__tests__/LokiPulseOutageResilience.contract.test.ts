// @ts-nocheck
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { loadLokiPulse } from '../lokiPulseService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('../supabaseClient', () => ({
  supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() } },
}));

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

  describe('Loki Pulse : expansion sans perte des musiques disponibles', () => {
    const row = { track_id: 'pulse-track', title: 'Titre disponible', artist: 'Artiste', preview_url: 'https://example.invalid/preview' };
    const cached = { track: { id: 'cached-track', title: 'Titre en cache', artist: 'Artiste' }, relevanceScore: 1, isNew: false };

    beforeEach(() => {
      jest.clearAllMocks();
      AsyncStorage.getItem.mockResolvedValue(null);
      AsyncStorage.setItem.mockResolvedValue(undefined);
      supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
      supabase.rpc.mockImplementation(async (name) => ({
        data: name === 'keep_loki_pulse' ? [row] : [],
        error: null,
      }));
    });

    it('garde la première sélection si le rafraîchissement renvoie une liste vide', async () => {
      let calls = 0;
      supabase.rpc.mockImplementation(async (name) => ({
        data: name === 'keep_loki_pulse' && ++calls === 1 ? [row] : [],
        error: null,
      }));
      const result = await loadLokiPulse(36, 'empty-refresh');
      expect(result.map(item => item.track.id)).toEqual(['pulse-track']);
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('restaure le cache du même profil lorsque les deux sélections sont vides', async () => {
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify([cached]));
      supabase.rpc.mockResolvedValue({ data: [], error: null });
      expect((await loadLokiPulse(36, 'cached-empty-refresh')).map(item => item.track.id)).toEqual(['cached-track']);
    });

    it('utilise les nouveaux résultats quand le rafraîchissement réussit', async () => {
      let calls = 0;
      supabase.rpc.mockImplementation(async (name) => ({
        data: name === 'keep_loki_pulse' ? (++calls === 1 ? [] : [row]) : [],
        error: null,
      }));
      expect((await loadLokiPulse(36, 'successful-refresh')).map(item => item.track.id)).toEqual(['pulse-track']);
    });

    it('une panne d’expansion ne vide pas la sélection disponible', async () => {
      supabase.functions.invoke.mockRejectedValue(new Error('provider unavailable'));
      expect((await loadLokiPulse(36, 'failed-expansion')).map(item => item.track.id)).toEqual(['pulse-track']);
    });
  });

  it('loads owner/home Pulse with the exact user id and never clears visible bubbles on a transient error', () => {
    expect(home).not.toContain('loadLokiPulse(24, user.id)'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(profile).toContain('loadLokiPulse(60, user.id)');
    expect(home).not.toContain('catch {\n        if (live) setHomePulseItems([]);');
    expect(profile).not.toContain('catch {\n        if (live) setLokiPulseItems([]);');
  });
});
