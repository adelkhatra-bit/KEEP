/** Aides communes aux pages Super Admin : RPC pas encore appliquée en production et messages lisibles. */
export function isRpcMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  const text = String(e.message || '');
  return e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist|schema cache/i.test(text);
}

export function rpcErrorText(error: unknown, fallback: string): string {
  const e = error as { message?: string } | null;
  const text = String(e?.message || '').trim();
  if (!text) return fallback;
  if (/admin_required|finance_admin_required/.test(text)) return 'Ton rôle Super Admin ne permet pas cette action.';
  return text;
}
