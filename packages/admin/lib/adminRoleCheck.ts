// Tri-état volontaire : une erreur réseau/serveur ('error') n'est PAS un refus ('denied').
// Seul un refus explicite ferme la session ; une panne passagère ne doit jamais
// déconnecter le Super Admin ni ouvrir l'accès protégé (accès fermé tant que le rôle est inconnu).
export type RoleCheck = 'allowed' | 'denied' | 'error';
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'MARKETING', 'MODERATOR', 'TECH'];
// Délai maximal : sans lui, une base lente laissait « Vérification de la session… » indéfiniment.
export const ROLE_CHECK_DEADLINE_MS = 12000;

type RpcClient = { rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }> } | null;

export async function checkAdminRole(client: RpcClient, deadlineMs: number = ROLE_CHECK_DEADLINE_MS): Promise<RoleCheck> {
  if (!client) return 'error';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data, error } = await Promise.race([
      client.rpc('get_my_admin_role'),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('role_check_timeout')), deadlineMs); }),
    ]);
    if (error) return 'error';
    return data && ADMIN_ROLES.includes(String(data)) ? 'allowed' : 'denied';
  } catch {
    return 'error';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
