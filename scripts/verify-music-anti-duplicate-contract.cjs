const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const failures = [];

function requireMarker(source, marker, message) {
  if (!source.includes(marker)) failures.push(message);
}

const session = read('packages/mobile/src/store/useSessionStore.ts');
requireMarker(session, 'function sameTrack(', 'LISTEN DEDUPE: sameTrack missing');
requireMarker(session, 'SAME_TRACK_COOLDOWN_MS', 'LISTEN DEDUPE: cooldown missing');
requireMarker(session, "return 'duplicate';", 'LISTEN DEDUPE: duplicate suppression missing');
requireMarker(session, "status: match ? 'already_saved' : 'pending'", 'LISTEN DEDUPE: already_saved guard missing');

const keepDedupe = read('supabase/migrations/20260827210000_keep_social_growth_dedupe_and_identity.sql');
requireMarker(keepDedupe, 'keep_decisions_one_kept_track_per_profile_uidx', 'KEEP DEDUPE: unique kept track per profile missing');

const purchaseGuard = read('supabase/migrations/20261004025311_anti_duplicate_active_music_purchases.sql');
requireMarker(purchaseGuard, 'playlist_sale_payments_one_active_per_buyer_offer_uidx', 'PURCHASE DEDUPE: playlist active purchase unique index missing');
requireMarker(purchaseGuard, 'artist_track_orders_one_active_per_buyer_track_uidx', 'PURCHASE DEDUPE: track active purchase unique index missing');
requireMarker(purchaseGuard, 'perform 1 from public.profiles where id=uid for update;', 'PURCHASE DEDUPE: cross-device buyer lock missing');

const creditClient = read('packages/mobile/src/services/creditService.ts');
requireMarker(creditClient, 'costPerKeep', 'FREE: server costPerKeep not consumed by client');
requireMarker(creditClient, "supabase.rpc('keep_consume_download_credit')", 'FREE: authoritative consume RPC missing');

const creditSql = read('supabase/migrations/20260904003000_keep_configurable_cost_per_keep.sql');
requireMarker(creditSql, "key='free_cost_per_keep'", 'FREE: configurable server price missing');
requireMarker(creditSql, 'used := used + cost;', 'FREE: exact configured debit missing');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('KEEP music anti-duplicate contract OK: listen, keep, purchases, Free.');
