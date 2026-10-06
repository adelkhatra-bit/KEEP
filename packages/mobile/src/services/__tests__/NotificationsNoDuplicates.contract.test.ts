import fs from 'fs';
import path from 'path';

// Adel (29/09/2026) : « audit complet des notifications, pourquoi des doublons ».
const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

describe('notifications sans doublons', () => {
  it('serveur : une notification identique en 10 minutes n’est pas recréée', () => {
    const sql = read('supabase', 'migrations', '20260929234000_notifications_dedupe_guard.sql');
    expect(sql).toContain('before insert on public.notifications');
    expect(sql).toContain("n.created_at > now() - interval '10 minutes'");
    expect(sql).toContain("coalesce(n.data, '{}'::jsonb) = coalesce(new.data, '{}'::jsonb)");
    expect(sql).toContain('return null;');
  });
  it('appli ouverte : pas de bannière système en plus de la bannière interne', () => {
    const push = read('packages', 'mobile', 'src', 'services', 'pushNotificationService.ts');
    expect(push).toContain('shouldShowBanner: false,');
    expect(push).toContain('shouldShowAlert: false,');
  });
  it('un morceau reconnu ne notifie qu’une fois par 30 minutes', () => {
    const rec = read('packages', 'mobile', 'src', 'services', 'recognitionNotificationService.ts');
    expect(rec).toContain('const NOTIFIED_WINDOW_MS = 30 * 60 * 1000;');
    expect(rec).not.toContain('60_000');
  });
  it('la bannière interne ignore un contenu identique déjà montré', () => {
    const banner = read('packages', 'mobile', 'src', 'components', 'GlobalNotificationBanner.tsx');
    expect(banner).toContain('const recentSemanticKeys = useRef(new Map<string, number>());');
    expect(banner).toContain('if (lastShown && Date.now() - lastShown < 30 * 60 * 1000) return;');
  });
  it('réserve les pushes système aux événements qui demandent vraiment une action', () => {
    const worker = read('supabase', 'functions', 'keep-push-worker', 'index.ts');
    expect(worker).toContain('IN_APP_ONLY_NOTIFICATION_TYPES');
    expect(worker).toContain('"NEW_PUBLIC_KEEP"');
    expect(worker).not.toMatch(/IN_APP_ONLY_NOTIFICATION_TYPES[\s\S]*?"BATTLE_INVITE"/);
    expect(worker).not.toMatch(/IN_APP_ONLY_NOTIFICATION_TYPES[\s\S]*?"KEEP_BATTLE_INVITE"/);
    expect(worker).toContain('push_delivery_status: "IN_APP_ONLY"');
  });

  it('supprime via le RPC auth avant le delete RLS direct', () => {
    const service = read('packages', 'mobile', 'src', 'services', 'notificationService.ts');
    const start = service.indexOf('export async function deleteNotification(profileId');
    const end = service.indexOf('export async function deleteAllNotifications', start);
    const block = service.slice(start, end);
    const rpc = block.indexOf("runNotificationAction('delete'");
    const direct = block.indexOf(".from('notifications')");
    expect(rpc).toBeGreaterThan(-1);
    expect(direct).toBeGreaterThan(rpc);
  });

});
