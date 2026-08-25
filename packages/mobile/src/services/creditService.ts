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

export async function getDownloadCreditStatus(): Promise<DownloadCreditStatus> {
  if (useUserStore.getState().isDemoMode) {
    return { planCode: 'DEMO', isAnonymous: false, consumed: 0, limit: null, remaining: null, unlimited: true };
  }
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
  if (useUserStore.getState().isDemoMode) return getDownloadCreditStatus();
  if (!supabase) throw new Error('KEEP n’est pas connecté au serveur.');
  const { data, error } = await supabase.rpc('keep_consume_download_credit');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) throw new Error('CREDITS_EXHAUSTED');
  return normalize(row);
}
