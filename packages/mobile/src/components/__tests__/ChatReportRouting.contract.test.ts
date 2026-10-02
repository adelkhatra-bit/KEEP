import fs from 'fs';
import path from 'path';

// Adel (02/10/2026) : tout signalement de harcèlement doit alerter le Super
// Admin, partout. Un message de groupe a sa propre table : il ne doit jamais
// être envoyé à keep_agora_report_message (qui viserait un autre message).
const service = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'musicAgoraService.ts'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261002223000_moderation_reports_admin_alerts.sql'), 'utf8');

describe('chat reports reach the Super Admin', () => {
  it('routes group messages to the group report function', () => {
    expect(service).toContain("? await supabase.rpc('keep_agora_report_group_message', { p_message_id: messageId, p_reason: reason })");
    expect(panel).toContain('reportMusicAgoraMessage(message.id, reason, activeGroup?.id ?? null)');
  });

  it('never swallows a failed report silently', () => {
    expect(panel).toContain('Impossible d’envoyer le signalement pour le moment.');
  });

  it('notifies every active admin on each new report', () => {
    expect(migration).toContain('create trigger user_reports_notify_admins');
    expect(migration).toContain("'ADMIN_USER_REPORT'");
    expect(migration).toContain("a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')");
  });
});
