jest.mock('../supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../featureFlagService', () => ({ isFeatureEnabled: jest.fn() }));
jest.mock('../../store/useUserStore', () => ({ useUserStore: { getState: jest.fn() } }));
jest.mock('expo/virtual/env', () => ({ env: process.env }));

import { supabase } from '../supabaseClient';
import { useUserStore } from '../../store/useUserStore';
import { activateBattleSoloRound, battlePreviewPositionMillis, buyKeepBattleSoloPack, consumeKeepBattleSoloDailyStart, loadBattlePreviewStartSec, loadKeepBattleSoloPack, reportBattleNoVoice } from '../keepBattleExperienceService';
import { heartbeatSoloBattle, leaveSoloBattle, reportSoloBattleResult, sendBattleChallenge } from '../keepBattleLiveService';
import { createKeepBattleArena, startKeepBattleArena, updateSoloPresenceTheme } from '../keepBattleService';

const rpc = supabase!.rpc as jest.Mock;
const state = useUserStore.getState as jest.Mock;

describe('Battle : position audio et signalement réel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    state.mockReturnValue({ user: { id: 'player' }, isDemoMode: false, isLocalGuest: false });
    rpc.mockResolvedValue({ data: { round: { trackId: 'replacement' } }, error: null });
  });

  it.each([[undefined, 12000], [null, 12000], [NaN, 12000], ['12', 12000], [0, 0], [12, 12000], [-3, 0], [25, 20000]])(
    'convertit %s en position %s sans minuterie', (value, expected) => {
      expect(battlePreviewPositionMillis(value)).toBe(expected);
    },
  );
  it('le rattrapage ajoute seulement le retard au même offset', () => {
    expect(battlePreviewPositionMillis(12, 1700)).toBe(13700);
    expect(battlePreviewPositionMillis(0, 800)).toBe(800);
    expect(battlePreviewPositionMillis(20, -100)).toBe(20000);
  });
  it('lit zéro correctement et conserve le défaut sur erreur réseau', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: { value: 0 }, error: null });
    (supabase!.from as jest.Mock).mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    expect(await loadBattlePreviewStartSec()).toBe(0);
    maybeSingle.mockRejectedValueOnce(new Error('offline'));
    expect(await loadBattlePreviewStartSec()).toBe(12);
  });
  it('en ligne transmet uniquement la vraie identité de tour, pas un profil choisi', async () => {
    await reportBattleNoVoice({ arenaId: 'arena', matchNo: 3, position: 4, startedAt: '2026-10-08T02:00:00Z' });
    expect(rpc).toHaveBeenCalledWith('keep_battle_report_no_voice', {
      p_arena_id: 'arena', p_match_no: 3, p_position: 4, p_started_at: '2026-10-08T02:00:00Z',
      p_solo_token: null, p_track_id: null,
    });
    expect(supabase!.from).not.toHaveBeenCalled();
  });
  it('Solo valide un tour attribué puis remplace sans envoyer score ni débit', async () => {
    await activateBattleSoloRound('token', 2, 'track');
    expect(rpc).toHaveBeenCalledWith('keep_battle_solo_round_active', { p_token: 'token', p_position: 2, p_track_id: 'track' });
    const result = await reportBattleNoVoice({ reportToken: 'token', position: 2, trackId: 'track' });
    expect(result.round.trackId).toBe('replacement');
    expect(rpc).toHaveBeenLastCalledWith('keep_battle_report_no_voice', {
      p_arena_id: null, p_match_no: null, p_position: 2, p_started_at: null, p_solo_token: 'token', p_track_id: 'track',
    });
  });
  it('une erreur serveur remonte sans faux succès', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'BATTLE_ROUND_INVALID' } });
    await expect(reportBattleNoVoice({ position: 1, reportToken: 'token' })).rejects.toThrow('BATTLE_ROUND_INVALID');
  });
  it('un pack démo utilise uniquement le catalogue filtré en lecture, sans mémoire serveur', async () => {
    state.mockReturnValue({ user: { id: 'player' }, isDemoMode: true });
    const tracks = Array.from({ length: 8 }, (_, index) => ({ id: `track-${index}`, artist: `Artist ${index}`, title: `Title ${index}`, preview_url: `https://audio.test/${index}` }));
    (supabase!.from as jest.Mock).mockReturnValue({ select: () => ({ not: () => ({ limit: async () => ({ data: tracks, error: null }) }) }) });
    const pack = await loadKeepBattleSoloPack('MIX', 8);
    expect(pack.rounds).toHaveLength(8);
    expect(pack.reportToken).toBeUndefined();
    expect(supabase!.from).toHaveBeenCalledWith('keep_battle_voice_eligible_tracks');
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ isDemoMode: true }, { isLocalGuest: true }, { user: null }])(
    'démo/invité ne signalent ni ne consomment, créditent ou publient une présence (%s)', async (override) => {
      state.mockReturnValue({ user: { id: 'player' }, ...override });
      await reportBattleNoVoice({ position: 1, reportToken: 'token' });
      await activateBattleSoloRound('token', 1, 'track');
      await consumeKeepBattleSoloDailyStart('long-token');
      await heartbeatSoloBattle('MIX', 1, 8);
      await updateSoloPresenceTheme('MIX', 1, 8);
      await leaveSoloBattle();
      await reportSoloBattleResult(8, 8);
      await expect(createKeepBattleArena('MIX', 8)).rejects.toThrow('BATTLE_AUTH_REQUIRED');
      await expect(startKeepBattleArena('arena')).rejects.toThrow('BATTLE_AUTH_REQUIRED');
      await expect(sendBattleChallenge('target', 'MIX')).rejects.toThrow('BATTLE_AUTH_REQUIRED');
      await expect(buyKeepBattleSoloPack('SMALL')).rejects.toThrow('BATTLE_AUTH_REQUIRED');
      expect(rpc).not.toHaveBeenCalled();
      expect(supabase!.from).not.toHaveBeenCalled();
    },
  );
});
