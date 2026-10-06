import { supabase } from './supabaseClient';

export type NotificationPlanCode = 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';

export type NotificationAccessRule = {
  notificationType: string;
  isLocked: boolean;
  minPlanCode: NotificationPlanCode;
};

const PLAN_RANK: Record<NotificationPlanCode, number> = {
  FREE: 0,
  PREMIUM: 1,
  CREATOR_PRO: 2,
  VENUE_PRO: 3,
};

export function normalizeNotificationPlanCode(value: unknown): NotificationPlanCode {
  const code = String(value || '').toUpperCase();
  if (code === 'PREMIUM' || code === 'CREATOR_PRO' || code === 'VENUE_PRO') return code;
  return 'FREE';
}

export function notificationPlanLabel(code: NotificationPlanCode): string {
  if (code === 'PREMIUM') return 'Premium';
  if (code === 'CREATOR_PRO') return 'Creator Pro';
  if (code === 'VENUE_PRO') return 'Venue Pro';
  return 'Free';
}

export async function loadNotificationAccessRules(): Promise<NotificationAccessRule[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('notification_access_rules')
    .select('notification_type,is_locked,min_plan_code')
    .order('notification_type', { ascending: true });
  if (error) return [];
  return (data ?? []).map((row: any) => ({
    notificationType: String(row.notification_type || '').toUpperCase(),
    isLocked: Boolean(row.is_locked),
    minPlanCode: normalizeNotificationPlanCode(row.min_plan_code),
  })).filter((row) => row.notificationType);
}

export function notificationAccessRequiredPlan(
  type: string,
  rules: NotificationAccessRule[],
): NotificationPlanCode {
  const key = String(type || '').toUpperCase();
  const rule = rules.find((item) => item.notificationType === key);
  return rule?.minPlanCode ?? 'FREE';
}

export function isNotificationAccessLocked(
  type: string,
  currentPlan: string,
  rules: NotificationAccessRule[],
): boolean {
  const key = String(type || '').toUpperCase();
  const rule = rules.find((item) => item.notificationType === key);
  if (!rule?.isLocked) return false;
  const current = normalizeNotificationPlanCode(currentPlan);
  return PLAN_RANK[current] < PLAN_RANK[rule.minPlanCode];
}
