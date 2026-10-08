/** Lien de parrainage (Adel 05/10/2026) : « parraine un ami » depuis le badge verrouillé ; URL canonique + ?ref=CODE (déjà lue à l'inscription). */
export const REFERRAL_BASE_URL = 'https://adelkhatra-bit.github.io/KEEP/';
export function buildReferralLink(code: string): string {
  const clean = String(code || '').trim().toUpperCase();
  return clean ? `${REFERRAL_BASE_URL}?ref=${encodeURIComponent(clean)}` : REFERRAL_BASE_URL;
}

export async function shareReferralLink(username: string): Promise<boolean> {
  // Imports tardifs : la partie « lien » reste pure (testable sans l'application).
  const { Share } = require('react-native');
  const { loadMyReferralCode } = require('./referralService');
  const code: string = await loadMyReferralCode().catch(() => '');
  const url = buildReferralLink(code);
  const name = String(username || '').replace(/^@+/, '');
  try {
    await Share.share({ message: `${name ? `${displayUsername(name)} t’invite sur` : 'Rejoins-moi sur'} Loki Music : découvre ma musique et fais grandir ta communauté musicale. ${url}`, url });
    return true;
  } catch {
    return false;
  }
}
import { displayUsername } from '../utils/displayUsername';
