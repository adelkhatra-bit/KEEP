import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { APP_NAME } from '../config/brand';

export type DownloadCreditStatus = {
  planCode: string;
  isAnonymous: boolean;
  consumed: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
};

const LOCAL_GUEST_CREDIT_KEY = '@keep/local-guest-download-consumed-v1';
const PENDING_GUEST_CREDIT_UPGRADE_KEY = '@keep/pending-guest-credit-upgrade-v1';
const LOCAL_GUEST_DEVICE_ID_KEY = '@keep/local-guest-device-id-v1';
const LOCAL_GUEST_LIMIT = 3;
// Le compte invité ne peut pas charger Remote Config avant authentification.
// Il applique donc la même valeur de secours que la règle commerciale Loki.
const LOCAL_GUEST_COST_PER_KEEP = 3;

/**
 * Audit multi-agent 07/09/2026 : le compteur d'essai invité était UNIQUEMENT
 * local (AsyncStorage) -- effacer les données de l'app le remettait à zéro à
 * l'infini, sans aucun garde-fou serveur. `keep_guest_device_credit_*` (RPC,
 * accessible en `anon`) rend ce compteur autoritaire côté serveur, identifié
 * par un UUID d'appareil généré une seule fois -- même mécanisme déjà utilisé
 * ailleurs dans Loki (keepMusicCoreRecognition.ts) pour le rate-limit de
 * reconnaissance. Le local reste un cache d'affichage optimiste ; en cas de
 * panne réseau, on ne bloque jamais l'essai (dégradation vers le local seul).
 */
async function getLocalGuestDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(LOCAL_GUEST_DEVICE_ID_KEY);
    if (existing) return existing;
    const cryptoApi = (globalThis as any)?.crypto;
    const created: string = cryptoApi?.randomUUID ? cryptoApi.randomUUID() : `keep-guest-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    await AsyncStorage.setItem(LOCAL_GUEST_DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `keep-guest-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

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

async function readLocalGuestConsumed(): Promise<number> {
  let consumed = 0;
  try {
    const stored = Number(await AsyncStorage.getItem(LOCAL_GUEST_CREDIT_KEY));
    if (Number.isFinite(stored) && stored > 0) consumed = Math.floor(stored);
  } catch {
    // Le stockage local ne doit jamais empêcher l'essai de s'ouvrir.
  }
  // Se réconcilie avec le compteur serveur (autoritaire, par appareil) : un
  // local remis à zéro (données de l'app effacées) ne doit jamais repasser
  // sous ce que le serveur sait déjà avoir été consommé sur cet appareil.
  // Aucun blocage si hors-ligne : on retombe simplement sur le local.
  try {
    if (supabase) {
      const deviceId = await getLocalGuestDeviceId();
      const { data, error } = await supabase.rpc('keep_guest_device_credit_status', { p_device_id: deviceId });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row) {
        const serverConsumed = Number(row.consumed || 0);
        if (serverConsumed > consumed) {
          consumed = serverConsumed;
          await AsyncStorage.setItem(LOCAL_GUEST_CREDIT_KEY, String(consumed)).catch(() => {});
        }
      }
    }
  } catch {
    // Panne réseau : l'essai invité reste utilisable en dégradé local seul.
  }
  return Math.min(Math.max(consumed, 0), LOCAL_GUEST_LIMIT);
}

async function getLocalGuestCreditStatus(): Promise<DownloadCreditStatus> {
  const consumed = await readLocalGuestConsumed();
  return {
    planCode: 'GUEST',
    isAnonymous: true,
    consumed,
    limit: LOCAL_GUEST_LIMIT,
    remaining: Math.max(LOCAL_GUEST_LIMIT - consumed, 0),
    unlimited: false,
  };
}

/**
 * Fige le nombre de crédits réellement utilisés pendant l'essai AVANT de
 * quitter le profil local. Au premier login confirmé, ce nombre sera importé
 * dans le compteur du vrai compte : 3 consommés avant inscription => 20
 * crédits restants sur le total FREE de 23, jamais 23 nouveaux crédits.
 */
export async function stageLocalGuestCreditsForUpgrade(): Promise<void> {
  const consumed = await readLocalGuestConsumed();
  try {
    await AsyncStorage.setItem(PENDING_GUEST_CREDIT_UPGRADE_KEY, String(consumed));
  } catch {
    // Si le stockage échoue, la création du compte reste possible.
  }
}

/**
 * Importe une seule fois la consommation invitée dans le compte authentifié.
 * Le RPC borne lui-même la valeur au quota invité et ne peut jamais diminuer
 * un compteur serveur déjà plus élevé.
 */
export async function importStagedGuestCreditsForAuthenticatedAccount(): Promise<DownloadCreditStatus | null> {
  if (!supabase) return null;
  let pendingRaw: string | null = null;
  try { pendingRaw = await AsyncStorage.getItem(PENDING_GUEST_CREDIT_UPGRADE_KEY); } catch {}
  if (pendingRaw == null) return null;

  const parsed = Number(pendingRaw);
  const consumed = Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 0), LOCAL_GUEST_LIMIT) : 0;
  const { data, error } = await supabase.rpc('keep_import_guest_credit_usage', { p_guest_consumed: consumed });
  if (error) throw error;

  try {
    await AsyncStorage.multiRemove([PENDING_GUEST_CREDIT_UPGRADE_KEY, LOCAL_GUEST_CREDIT_KEY]);
  } catch {}

  const row = Array.isArray(data) ? data[0] : data;
  return normalize(row);
}

export async function getDownloadCreditStatus(): Promise<DownloadCreditStatus> {
  const state = useUserStore.getState();
  if (state.isDemoMode) {
    return { planCode: 'DEMO', isAnonymous: false, consumed: 0, limit: null, remaining: null, unlimited: true };
  }
  if (state.isLocalGuest) return getLocalGuestCreditStatus();
  if (!supabase) throw new Error(`${APP_NAME} n’est pas connecté au serveur.`);
  const { data, error } = await supabase.rpc('keep_download_credit_status');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return normalize(row);
}

export type FreeCreditBattleEvent = { result: string; amount: number; createdAt: string; themeCode: string | null };

export type FreeCreditBreakdown = {
  remaining: number;
  guestLimit: number;
  signupBonus: number;
  followerCount: number;
  followerBonus: number;
  followerTier3: number;
  followerTier5: number;
  referralBonus: number;
  referralCount: number;
  monthlyBonus: number;
  adminGrant: number;
  battleAdjustment: number;
  battleWon: number;
  battleLost: number;
  totalEarned: number;
  totalSpent: number;
  used: number;
  lockedArena: number;
  recentBattles: FreeCreditBattleEvent[];
};

/**
 * Adel (04/09/2026) : "l'utilisateur il a besoin de savoir comment elle a
 * gagné des Free ... il faut qu'il comprenne exactement comment ils ont
 * gagné" -- le solde Free n'est pas un grand livre mais une formule
 * calculée en direct (keep_theoretical_free_credit_remaining_for_profile) ;
 * cette fonction expose les mêmes composantes, nommées, pour qu'un solde
 * comme "36" devienne vérifiable au lieu d'une boîte noire.
 */
export async function loadFreeCreditBreakdown(): Promise<FreeCreditBreakdown | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('keep_free_credit_breakdown');
  if (error || !data) return null;
  const row = data as any;
  return {
    remaining: Number(row.remaining || 0),
    guestLimit: Number(row.guestLimit || 0),
    signupBonus: Number(row.signupBonus || 0),
    followerCount: Number(row.followerCount || 0),
    followerBonus: Number(row.followerBonus || 0),
    followerTier3: Number(row.followerTier3 || 0),
    followerTier5: Number(row.followerTier5 || 0),
    referralBonus: Number(row.referralBonus || 0),
    referralCount: Number(row.referralCount || 0),
    monthlyBonus: Number(row.monthlyBonus || 0),
    adminGrant: Number(row.adminGrant || 0),
    battleAdjustment: Number(row.battleAdjustment || 0),
    battleWon: Number(row.battleWon || 0),
    battleLost: Number(row.battleLost || 0),
    totalEarned: Number(row.totalEarned || 0),
    totalSpent: Number(row.totalSpent || 0),
    used: Number(row.used || 0),
    lockedArena: Number(row.lockedArena || 0),
    recentBattles: Array.isArray(row.recentBattles) ? row.recentBattles.map((x: any) => ({
      result: String(x.result || ''),
      amount: Number(x.amount || 0),
      createdAt: String(x.createdAt || ''),
      themeCode: x.themeCode ? String(x.themeCode) : null,
    })) : [],
  };
}

export async function ensureDownloadCreditAvailable(): Promise<DownloadCreditStatus> {
  const status = await getDownloadCreditStatus();
  const required = status.isAnonymous ? LOCAL_GUEST_COST_PER_KEEP : 1;
  if (!status.unlimited && (status.remaining ?? 0) < required) {
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
    if ((current.remaining ?? 0) < LOCAL_GUEST_COST_PER_KEEP) throw new Error('CREDITS_EXHAUSTED');
    let consumed = Math.min(current.consumed + LOCAL_GUEST_COST_PER_KEEP, LOCAL_GUEST_LIMIT);
    // Le serveur (par appareil) est la source de vérité : on lui rapporte la
    // consommation en premier -- s'il refuse (quota déjà atteint côté serveur
    // même si le local semblait encore disponible), l'essai s'arrête là,
    // au lieu de laisser un local remis à zéro en donner de nouveau.
    try {
      if (supabase) {
        const deviceId = await getLocalGuestDeviceId();
        const { data, error } = await supabase.rpc('keep_guest_device_credit_consume', { p_device_id: deviceId, p_amount: LOCAL_GUEST_COST_PER_KEEP });
        const row = Array.isArray(data) ? data[0] : data;
        if (!error && row) {
          if (!row.allowed) throw new Error('CREDITS_EXHAUSTED');
          consumed = Math.min(Number(row.consumed || consumed), LOCAL_GUEST_LIMIT);
        }
      }
    } catch (e: any) {
      if (String(e?.message) === 'CREDITS_EXHAUSTED') throw e;
      // Panne réseau sur l'appel serveur : ne jamais transformer ça en faux
      // échec d'un ajout musical déjà réussi -- on dégrade vers le local.
    }
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
  if (!supabase) throw new Error(`${APP_NAME} n’est pas connecté au serveur.`);
  const { data, error } = await supabase.rpc('keep_consume_download_credit');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) throw new Error('CREDITS_EXHAUSTED');
  return normalize(row);
}
