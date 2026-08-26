import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { useUserStore } from '../store/useUserStore';

export type DownloadCreditStatus = {
  planCode: string;
  isAnonymous: boolean;
  consumed: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
};

const LOCAL_GUEST_CREDIT_KEY = '@keep/local-guest-download-consumed-v1';
const LOCAL_GUEST_LIMIT = 3;

function normalize(row: any): DownloadCreditStatus {
  return {
    planCode: row?.plan_code || 'FREE',
    isAnonymous: Boolean(row?.is_anonymous),
    consumed: Number(row?.consumed || 0),
    limit: row?.credit_limit == null ? null : Number(row.credit_limit),
    remaining: row?.remaining == null ? null : Number(row.remaining),
    unlimited: Boolean(row?.unlimited),
  };
}

async function getLocalGuestCreditStatus(): Promise<DownloadCreditStatus> {
  let consumed = 0;
  try {
    const stored = Number(await AsyncStorage.getItem(LOCAL_GUEST_CREDIT_KEY));
    if (Number.isFinite(stored) && stored > 0) consumed = Math.floor(stored);
  } catch {
    // Le stockage local ne doit jamais empêcher l'essai de s'ouvrir.
  }
  consumed = Math.min(Math.max(consumed, 0), LOCAL_GUEST_LIMIT);
  return {
    planCode: 'GUEST',
    isAnonymous: true,
    consumed,
    limit: LOCAL_GUEST_LIMIT,
    remaining: Math.max(LOCAL_GUEST_LIMIT - consumed, 0),
    unlimited: false,
  };
}

export async function getDownloadCreditStatus(): Promise<DownloadCreditStatus> {
  const state = useUserStore.getState();
  if (state.isDemoMode) {
    return { planCode: 'DEMO', isAnonymous: false, consumed: 0, limit: null, remaining: null, unlimited: true };
  }
  if (state.isLocalGuest) return getLocalGuestCreditStatus();
  if (!supabase) throw new Error('KEEP n’est pas connecté au serveur.');
  const { data, error } = await supabase.rpc('keep_download_credit_status');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return normalize(row);
}

export async function ensureDownloadCreditAvailable(): Promise<DownloadCreditStatus> {
  const status = await getDownloadCreditStatus();
  if (!status.unlimited && (status.remaining ?? 0) <= 0) {
    throw new Error('CREDITS_EXHAUSTED');
  }
  return status;
}

/** Appelé uniquement APRÈS un ajout réel réussi dans une plateforme musicale. */
export async function consumeDownloadCredit(): Promise<DownloadCreditStatus> {
  const state = useUserStore.getState();
  if (state.isDemoMode) return getDownloadCreditStatus();
  if (state.isLocalGuest) {
    const current = await getLocalGuestCreditStatus();
    if ((current.remaining ?? 0) <= 0) throw new Error('CREDITS_EXHAUSTED');
    const consumed = current.consumed + 1;
    try {
      await AsyncStorage.setItem(LOCAL_GUEST_CREDIT_KEY, String(consumed));
    } catch {
      // L'ajout musical a déjà réussi : ne jamais transformer une panne de
      // stockage local en faux échec de téléchargement.
    }
    return {
      ...current,
      consumed,
      remaining: Math.max(LOCAL_GUEST_LIMIT - consumed, 0),
    };
  }
  if (!supabase) throw new Error('KEEP n’est pas connecté au serveur.');
  const { data, error } = await supabase.rpc('keep_consume_download_credit');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) throw new Error('CREDITS_EXHAUSTED');
  return normalize(row);
}
