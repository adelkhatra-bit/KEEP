// Règles pures des messages éphémères / conversations effacées (Adel, 05/10/2026) : sans dépendance, testables seules.
export const EPHEMERAL_MESSAGE_HOURS = 24;
export type ConversationPrefs = { ephemeral: boolean; clearedAt: string | null };

/** Vrai quand le message doit être masqué pour cet utilisateur (conversation effacée ou message éphémère expiré). */
export function isMessageHiddenByPrefs(prefs: ConversationPrefs | undefined, createdAt: string, now = Date.now()): boolean {
  if (!prefs) return false;
  const at = new Date(createdAt || 0).getTime();
  if (prefs.clearedAt && at <= new Date(prefs.clearedAt).getTime()) return true;
  return prefs.ephemeral && now - at > EPHEMERAL_MESSAGE_HOURS * 3600 * 1000;
}

