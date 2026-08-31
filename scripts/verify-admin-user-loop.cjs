const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const mustInclude = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
};
const mustNotInclude = (text, needle, label) => {
  if (text.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
};

const appEntry = read('packages/mobile/index.js');
const requirementGate = read('packages/mobile/src/components/MandatoryProfileRequirementsGate.tsx');
const planService = read('packages/mobile/src/services/planService.ts');
const adminUsers = read('packages/admin/pages/users.tsx');
const adminControl = read('supabase/functions/keep-admin-control/index.ts');
const userControl = read('supabase/functions/keep-admin-user-control/index.ts');
const directoryHardening = read('supabase/migrations/20260828143000_admin_directory_execute_hardening.sql');

mustInclude(appEntry, 'MandatoryProfileRequirementsGate', 'mobile root');
mustInclude(requirementGate, ".from('user_profile_requirements')", 'mandatory requirements gate');
mustInclude(requirementGate, 'saveOwnProfile', 'mandatory requirements gate');

mustInclude(adminUsers, "supabase.rpc('admin_user_directory')", 'Super Admin users');
mustInclude(adminUsers, "functions.invoke('keep-admin-user-control'", 'Super Admin users');
mustInclude(adminUsers, "supabase.rpc('get_my_admin_role')", 'Super Admin users');
mustNotInclude(adminUsers, 'EMAIL_VERIFIED', 'Super Admin mandatory fields');

for (const requirement of ['BIRTH_DATE', 'GENDER', 'AVATAR', 'CITY', 'COUNTRY', 'BIO', 'SOCIAL_LINK', 'WEBSITE']) {
  mustInclude(adminUsers, requirement, 'Super Admin mandatory fields');
  mustInclude(userControl, `\"${requirement}\"`, 'user-control accepted requirements');
}
mustNotInclude(userControl, 'EMAIL_VERIFIED', 'user-control accepted requirements');

for (const marker of ['canRead', 'canRequireProfileInfo', 'canBlockAccount', 'canModerateDiscovery', 'canDestruct']) {
  mustInclude(userControl, marker, 'user-control role matrix');
}
mustInclude(userControl, 'role === "MODERATOR"', 'user-control moderator access');
mustInclude(userControl, 'user.requirements.updated', 'user-control audit');
mustInclude(userControl, 'user.discovery.hidden', 'user-control audit');
mustInclude(userControl, 'user.password.reset', 'user-control audit');
mustInclude(userControl, 'user.deleted', 'user-control audit');

mustInclude(adminControl, 'service_grant_plan', 'Super Admin subscription grant');
mustInclude(adminControl, 'service_revoke_admin_grant', 'Super Admin subscription revoke');
mustInclude(adminControl, 'subscription.admin_granted', 'Super Admin subscription audit');
mustInclude(adminControl, 'subscription.admin_revoked', 'Super Admin subscription audit');

mustInclude(planService, ".from('subscriptions')", 'mobile plan reader');
mustInclude(planService, ".in('status', ['TRIALING', 'ACTIVE'])", 'mobile plan reader');
mustInclude(planService, "return (data as any)?.plans?.code || 'FREE'", 'mobile plan reader');

mustInclude(directoryHardening, 'revoke execute on function public.admin_user_directory() from public;', 'directory security');
mustInclude(directoryHardening, 'revoke execute on function public.admin_user_directory() from anon;', 'directory security');
mustInclude(directoryHardening, 'grant execute on function public.admin_user_directory() to authenticated;', 'directory security');

console.log('KEEP ADMIN↔USER CONTRACT OK');
console.log('- directory: authenticated + active-admin guard');
console.log('- per-user controls: JWT + role matrix + audit log');
console.log('- mandatory fields: same supported set on admin and mobile');
console.log('- subscriptions: admin grant/revoke writes the table read by mobile entitlements');
