import { supabase } from './supabaseClient';

// Audit Adel (12/09/2026) : chaque page du Super Admin ecrivait sa propre
// petite fonction invoke*(), toutes avec le meme defaut -- supabase-js
// transforme toute reponse non-2xx de functions.invoke() en FunctionsHttpError
// avec data:null, donc le corps JSON precis renvoye par l'edge function
// (message d'erreur reel, ex: le blocage IP Brevo ou la permission webhook
// insuffisante) n'etait jamais lu : throw error remontait un message
// generique ("Edge Function returned a non-2xx status code") a la place.
//
// Correctif du 12/09 insuffisant (Adel, 16-17/09/2026, capture a l'appui :
// toujours "non-2xx status code" malgre error.context.json()) : verifie en
// direct que l'edge function repond bien avec un corps JSON propre (appel
// fetch() brut, hors supabase-js) -- donc le probleme vient bien de
// supabase-js functions.invoke() qui, selon les cas, a deja consomme le
// corps de la Response avant de nous laisser error.context, rendant un
// second .json() impossible a lire (throw silencieux, jamais log). Plus
// fiable de ne plus passer par ce wrapper du tout : fetch() direct vers
// l'URL de la fonction, avec le token de la session en cours -- on lit
// alors TOUJOURS le vrai corps, une seule fois, nous-memes.
export async function invokeAdminFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Session Super Admin expirée -- reconnecte-toi.');

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Impossible de joindre ${name} -- vérifie ta connexion.`);
  }

  const raw = await response.text();
  let parsed: any = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { /* corps non-JSON, on retombe sur le texte brut ci-dessous */ }
  }

  if (!response.ok) {
    if (parsed && typeof parsed === 'object') throw new Error(parsed.message || parsed.details || parsed.error || `${name} a échoué (${response.status}).`);
    throw new Error(raw ? `${name} a échoué (${response.status}) : ${raw.slice(0, 300)}` : `${name} a échoué (${response.status}).`);
  }

  if (parsed && typeof parsed === 'object' && (parsed as any).error) {
    throw new Error((parsed as any).message || (parsed as any).details || (parsed as any).error);
  }
  return parsed as T;
}
