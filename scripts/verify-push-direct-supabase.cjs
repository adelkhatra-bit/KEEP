const fs = require('fs');

const read = (p) => fs.readFileSync(p, 'utf8');
const checks = [];
const ok = (label, condition) => {
  checks.push({ label, condition: Boolean(condition) });
  if (!condition) throw new Error(`KEEP push architecture contract failed: ${label}`);
};

const service = read('packages/mobile/src/services/pushNotificationService.ts');
const lifecycle = read('packages/mobile/src/components/PushRegistrationLifecycle.tsx');
const root = read('packages/mobile/index.js');
const backend = read('packages/backend/src/index.ts');
const worker = read('supabase/functions/keep-push-worker/index.ts');
const directRpc = read('supabase/migrations/20260830015000_keep_push_tokens_direct_rpc.sql');
const singleOwner = read('supabase/migrations/20260830015200_keep_push_token_single_owner.sql');
const cron = read('supabase/migrations/20260830014500_keep_push_worker_cron.sql');

ok('mobile registers token through Supabase RPC', service.includes("rpc('keep_push_token_register'"));
ok('mobile push registration has no Render API URL dependency', !service.includes('EXPO_PUBLIC_API_URL') && !service.includes('/api/notifications/push-token'));
ok('global lifecycle invokes push registration', lifecycle.includes('registerForPushNotifications') && root.includes('PushRegistrationLifecycle'));
ok('token registration is authenticated by auth.uid()', directRpc.includes('auth.uid()'));
ok('one Expo token is reassigned to current profile', singleOwner.includes('delete from public.push_tokens where token=clean_token and profile_id<>uid'));
ok('Supabase Edge push worker exists', worker.includes('EXPO_PUSH_URL') && worker.includes('keep_push_claim_batch'));
ok('Supabase Cron invokes Edge worker', cron.includes('cron.schedule') && cron.includes('keep-push-worker'));
ok('Cron secret comes from Vault', cron.includes('vault.decrypted_secrets'));
ok('Render push loop is fallback only', backend.includes("process.env.KEEP_PUSH_WORKER_FALLBACK === '1'"));

console.log('KEEP direct Supabase push architecture: PASS');
for (const c of checks) console.log(`PASS  ${c.label}`);
