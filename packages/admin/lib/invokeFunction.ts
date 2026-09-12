import { supabase } from './supabaseClient';

// Audit Adel (12/09/2026) : chaque page du Super Admin ecrivait sa propre
// petite fonction invoke*(), toutes avec le meme defaut -- supabase-js
// transforme toute reponse non-2xx de functions.invoke() en FunctionsHttpError
// avec data:null, donc le corps JSON precis renvoye par l'edge function
// (message d'erreur reel, ex: le blocage IP Brevo ou la permission webhook
// insuffisante) n'etait jamais lu : throw error remontait un message
// generique ("Edge Function returned a non-2xx status code") a la place.
// Meme bug et meme correctif deja appliques cote mobile
// (authService.ts:invokeAuthEmail) -- on relit le vrai corps via
// error.context avant d'abandonner. Point d'entree unique desormais pour
// toutes les pages admin.
export async function invokeAdminFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) {
    if ((data as any)?.error) throw new Error((data as any).message || (data as any).details || (data as any).error);
    return data as T;
  }
  let parsed: any = null;
  const context = (error as any)?.context;
  if (context && typeof context.json === 'function') {
    try { parsed = await context.json(); } catch { /* corps non-JSON ou deja consomme : repli sur error ci-dessous */ }
  }
  if (parsed && typeof parsed === 'object') {
    throw new Error(parsed.message || parsed.details || parsed.error || error.message);
  }
  throw error;
}
