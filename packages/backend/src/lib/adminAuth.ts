import { Response, NextFunction } from 'express';
import { requireKeepAuth, KeepAuthedRequest, TokenVerifier } from './keepAuth';
import { APP_NAME } from '../config/brand';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'MARKETING' | 'MODERATOR' | 'TECH';

export interface AdminRoleChecker {
  /** `null` si l'utilisateur n'est pas dans `admin_users` ou `is_active = false`. */
  checkAdminRole(userId: string): Promise<AdminRole | null>;
}

export interface AdminAuthedRequest extends KeepAuthedRequest {
  adminRole?: AdminRole;
}

/**
 * Gate Super Admin en deux étapes : (1) session Loki valide (comme
 * `requireKeepAuth`), (2) ce compte est bien une ligne active de
 * `admin_users` avec un rôle autorisé pour CETTE route. Refuse 401 si (1)
 * échoue, 403 si (2) échoue -- distinction volontaire ("pas connecté" vs
 * "connecté mais pas admin"), utile côté client pour afficher le bon message.
 *
 * `allowedRoles` omis = n'importe quel rôle admin actif suffit (routes de
 * lecture). Le fournir restreint aux rôles listés (ex. mutations de prix
 * réservées à SUPER_ADMIN/ADMIN) -- voir routes/admin.ts pour l'usage réel.
 */
export function requireAdminRole(verifier: TokenVerifier, roleChecker: AdminRoleChecker, allowedRoles?: AdminRole[]) {
  const baseAuth = requireKeepAuth(verifier);

  return async (req: AdminAuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    await baseAuth(req, res, async () => {
      const role = await roleChecker.checkAdminRole(req.keepUserId as string);
      if (!role) {
        res.status(403).json({ error: 'not_admin', message: `Ce compte ${APP_NAME} n’a pas accès au Super Admin.` });
        return;
      }
      if (allowedRoles && !allowedRoles.includes(role)) {
        res.status(403).json({ error: 'insufficient_role', message: `Rôle "${role}" insuffisant pour cette action.` });
        return;
      }
      req.adminRole = role;
      next();
    });
  };
}
