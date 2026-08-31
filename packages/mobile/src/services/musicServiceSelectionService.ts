import type { MusicServiceKey } from './keylessMusicBridge';
import { supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';

export type MusicServiceSelectionState = {
  services: MusicServiceKey[];
  used: number;
  limit: number;
  plan: 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';
};

const ALL_SERVICES: MusicServiceKey[] = ['apple_music', 'spotify', 'deezer', 'youtube_music', 'soundcloud', 'tidal'];

function isService(value: unknown): value is MusicServiceKey {
  return typeof value === 'string' && ALL_SERVICES.includes(value as MusicServiceKey);
}

function normalizePlan(value: unknown): MusicServiceSelectionState['plan'] {
  return value === 'PREMIUM' || value === 'CREATOR_PRO' || value === 'VENUE_PRO' ? value : 'FREE';
}

export async function loadMusicServiceSelections(): Promise<MusicServiceSelectionState> {
  if (!supabase) return { services: [], used: 0, limit: 1, plan: 'FREE' };
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user?.id;
  if (!userId) return { services: [], used: 0, limit: 1, plan: 'FREE' };

  const [{ data: rows, error: rowsError }, { data: limitData, error: limitError }, { data: planData, error: planError }] = await Promise.all([
    supabase.from('music_service_connections').select('service,connected_at').eq('profile_id', userId).order('connected_at', { ascending: true }),
    supabase.rpc('keep_music_service_limit', { p_uid: userId }),
    supabase.rpc('keep_active_plan_code', { p_uid: userId }),
  ]);
  if (rowsError) throw rowsError;
  if (limitError) throw limitError;
  if (planError) throw planError;

  const services = (rows ?? []).map((row: any) => row.service).filter(isService);
  const limit = Math.max(0, Math.min(ALL_SERVICES.length, Number(limitData) || 1));
  return { services, used: services.length, limit, plan: normalizePlan(planData) };
}

export async function claimMusicService(service: MusicServiceKey): Promise<MusicServiceSelectionState & { ok: boolean; error?: string }> {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  const { data, error } = await supabase.rpc('keep_claim_music_service', { p_service: service });
  if (error) throw error;

  const payload = (data ?? {}) as any;
  const next = await loadMusicServiceSelections();
  return {
    ...next,
    ok: payload.ok !== false,
    error: typeof payload.error === 'string' ? payload.error : undefined,
  };
}

export function musicServicePlanLabel(plan: MusicServiceSelectionState['plan']): string {
  if (plan === 'PREMIUM') return 'Premium 2,99 €';
  if (plan === 'CREATOR_PRO') return 'Creator Pro 9,99 €';
  if (plan === 'VENUE_PRO') return 'Venue Pro 29,99 €';
  return 'FREE';
}
