// Faux Supabase partagé par le robot de parcours KEEP.
//
// Toutes les données ci-dessous sont SYNTHÉTIQUES (identifiants, pseudos,
// compteurs, dates inventés). Aucune donnée réelle d'utilisateur KEEP ne doit
// jamais être copiée ici : le robot doit rester reproductible sans accès à la
// production et sans exposer qui que ce soit.
//
// Le navigateur ne parle jamais au vrai projet Supabase : chaque requête vers
// *.supabase.co est interceptée par page.route() et servie par respond().
'use strict';

const SUPABASE_REF = 'rrhqsqzcplvmwxizqnla';
const AUTH_STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;

// Identifiants inventés (format uuid valide, aucun lien avec la base réelle).
const UID = '0b5e7a1c-0000-4000-8000-00000000a001';
const SELLER = '0b5e7a1c-0000-4000-8000-00000000b002';
const USERNAME = 'testeur';
const SELLER_USERNAME = 'vendeur_demo';
const MEMBER_USERNAME = 'membre_demo';
const GROUP_NAME = 'Groupe démo';
const SHAREABLE_TRACK = { id: '0b5e7a1c-0000-4000-8000-00000000c003', title: 'Ballade de démo', artist: 'Artiste Démo', can_sell: true, preview_url: null, artwork_url: null };

const FIXED_DATE = '2026-01-15T10:00:00.000Z';

const user = {
  id: UID,
  email: 'testeur@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  user_metadata: { keep_username: USERNAME, email_verified: true },
  app_metadata: { provider: 'email', providers: ['email'] },
  created_at: FIXED_DATE,
  email_confirmed_at: FIXED_DATE,
  is_anonymous: false,
};

const profile = {
  id: UID,
  username: USERNAME,
  display_name: 'Testeur KEEP',
  bio: 'Compte synthétique du robot de parcours.',
  avatar_url: null,
  country_code: 'FR',
  city: 'Ville Démo',
  kind: 'USER',
  language_code: 'fr',
  is_public: true,
  onboarding_completed_at: FIXED_DATE,
  location_opt_in: false,
  is_adult: true,
  created_at: FIXED_DATE,
  updated_at: FIXED_DATE,
  website: null,
  favorite_genres: ['House', 'Funk', 'Pop'],
  favorite_artists: ['Artiste Démo'],
  support_number: 900001,
  discovery_hidden: false,
  certification_tier: 'PREMIUM',
  follower_count_override: 0,
  preferred_language_tag: 'fr-FR',
  music_country_codes: ['FR'],
  music_language_codes: ['fra'],
  pulse_preferences_completed_at: FIXED_DATE,
  pulse_prompt_after: '2099-01-01T00:00:00.000Z',
  pulse_prompt_dismiss_count: 0,
  pulse_preferences_version: 1,
  community_chat_home_enabled: true,
  community_chat_notifications: true,
  test_mode_enabled: false,
  community_chat_surfaces: ['PROFILE'],
  community_chat_enabled: true,
  community_chat_side: 'right',
  community_chat_bottom_offset: 160,
  community_chat_voice_announcements: false,
};

const seller = { ...profile, id: SELLER, username: SELLER_USERNAME, display_name: 'Vendeur Démo', bio: 'Vendeur synthétique.', is_public: true };

const snapshot = [{ direct_keeps: 20, social_keeps: 8, total_keeps: 24, public_keeps: 22, private_keeps: 2 }];
const pubsnap = [{ direct_public_keeps: 22, social_public_keeps: 8, total_public_keeps: 22, followers: 3, following: 4, account_verified: true, plan_code: 'PREMIUM', certification_tier: 'PREMIUM' }];
const credit = { net: 0, won: 0, lost: 0, remainingFree: 34, hasPaidBattleAccess: false };

const GENRES = ['R&B/Soul', 'Raï', 'House', 'Funk', 'Pop'];
const FORTY_OFFERS = Array.from({ length: 40 }, (_, i) => ({
  offer_id: 'off-' + (i + 1),
  playlist_id: 'pl-' + (i + 1),
  playlist_name: ['Nuits R&B 2000', 'Sélection Raï Love', 'Afterwork House · vol. 1', 'Funk de dimanche'][i % 4] + (i >= 4 ? ' #' + (i + 1) : ''),
  payment_mode: i % 3 === 1 ? 'MONEY' : 'FREE',
  price_cents: 200 + i * 10,
  free_price: i % 3 === 1 ? null : 3 + (i % 5),
  currency_code: 'EUR',
  track_count: 5 + (i % 15),
  genres: [GENRES[i % 5]],
}));

function singleOffer(mode) {
  return { offer_id: 'off-1', playlist_id: 'pl-1', playlist_name: 'Soirée rooftop très longue pour tester une seule ligne', payment_mode: mode, price_cents: 1299, free_price: mode === 'FREE' ? 20 : null, currency_code: 'EUR', track_count: 12, genres: ['Funk', 'Pop'] };
}

function baseGroupMessages() {
  return [
    { id: 501, profile_id: SELLER, username: MEMBER_USERNAME, body: 'Fais tourner le son', created_at: new Date(Date.now() - 60000).toISOString() },
    { id: 502, profile_id: SELLER, username: MEMBER_USERNAME, body: 'La commande doit se faire aujourd’hui', created_at: new Date(Date.now() - 30000).toISOString() },
  ];
}

function makeSession() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600 })}.sig`;
  return { access_token: jwt, refresh_token: 'jeton-factice', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
}

/**
 * Crée un faux Supabase pour UN parcours.
 * options :
 *  - origin        : origine du serveur local (pour les URL d'aperçu audio)
 *  - mode          : 'FREE' | 'MONEY' (offre unique de la fenêtre d'écoute)
 *  - offers        : 'single' | 'forty'
 *  - groupRole     : 'MEMBER' | 'OWNER'
 *  - groupStatus   : statut du membre dans le groupe (défaut ACTIVE)
 *  - groupMessages : true pour servir deux messages existants dans le groupe
 *  - balance       : solde FREE affiché (défaut 34)
 */
function createFakeSupabase(options = {}) {
  const opts = { origin: 'http://127.0.0.1:4721', mode: 'FREE', offers: 'single', groupRole: 'MEMBER', groupStatus: 'ACTIVE', groupMessages: false, balance: 34, ...options };
  const session = makeSession();
  const state = { posted: [], groupCalls: [], extraMessages: [] };
  const offers = opts.offers === 'forty' ? FORTY_OFFERS : [singleOffer(opts.mode)];

  async function respond(route) {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname;
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = () => { try { return JSON.parse(req.postData() || '{}'); } catch { return {}; } };
    const json = (status, payload) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(payload) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (p.startsWith('/realtime/')) return route.abort();
    if (p === '/auth/v1/user') return json(200, user);
    if (p === '/auth/v1/token') return json(200, session);
    if (p.startsWith('/auth/') || p.startsWith('/functions/')) return json(200, {});
    if (p.startsWith('/rest/v1/rpc/')) {
      const name = p.split('/').pop();
      switch (name) {
        case 'keep_agora_my_shareable_tracks': return json(200, [SHAREABLE_TRACK]);
        case 'keep_agora_share_preflight': return json(200, { hasTrack: true, canSell: true, targetOwnsTrack: false });
        case 'keep_playlist_sale_access': return json(200, { unlocked: true, enabled: true, can_buy: true, can_sell: true });
        case 'keep_agora_post_group_offer': state.posted.push(body()); return json(200, { groupMessageId: 9, offersSent: 1, alreadyOwned: 1, alreadyPending: 0 });
        case 'keep_agora_group_messages_v2':
          state.groupCalls.push(Date.now());
          if (!opts.groupMessages) return json(200, []);
          return json(200, [...state.extraMessages, ...baseGroupMessages()].sort((a, b) => a.id - b.id));
        case 'keep_agora_post_group_message_v2': state.posted.push(body()); return json(200, 777);
        case 'keep_agora_group_members': return json(200, [{ profile_id: UID, username: USERNAME, role: 'OWNER', status: 'ACTIVE' }, { profile_id: SELLER, username: SELLER_USERNAME, role: 'MEMBER', status: 'ACTIVE' }]);
        case 'keep_agora_delete_group': state.posted.push({ deleted: true }); return json(200, true);
        case 'keep_agora_my_groups': return json(200, [{ group_id: 'g-1', group_name: GROUP_NAME, owner_id: SELLER, owner_username: SELLER_USERNAME, my_role: opts.groupRole, my_status: opts.groupStatus, member_count: 3, invited_count: 0 }]);
        case 'keep_playlist_sale_offers_for_profile': return json(200, offers);
        case 'keep_playlist_sale_offer_overlap': {
          if (opts.offers !== 'forty') return json(200, { totalCount: 12, ownedCount: 3, missingCount: 9 });
          const n = Number(String(body().p_offer_id || '').split('-')[1] || 1);
          return json(200, { totalCount: 12, ownedCount: n % 4, missingCount: n === 2 ? 0 : 12 - (n % 4) });
        }
        case 'keep_free_credit_breakdown': return json(200, { remaining: opts.balance });
        case 'keep_battle_credit_status': return json(200, credit);
        case 'keep_own_profile_snapshot': return json(200, obj ? snapshot[0] : snapshot);
        case 'keep_public_profile_snapshot': return json(200, obj ? pubsnap[0] : pubsnap);
        default:
          if (name.startsWith('keep_playlist_sale_offer_preview_tracks')) {
            return json(200, Array.from({ length: 12 }, (_, i) => ({ track_id: 't' + i, preview_url: `${opts.origin}/none.mp3`, already_owned: i < 3 })));
          }
          return json(200, obj ? null : []);
      }
    }
    if (p === '/rest/v1/profiles') {
      const f = u.searchParams.toString();
      const row = f.includes(SELLER_USERNAME) || f.includes(SELLER) ? seller : (f.includes(UID) ? profile : null);
      if (obj) return row ? json(200, row) : json(406, { code: 'PGRST116' });
      return json(200, row ? [row] : []);
    }
    if (obj) return json(406, { code: 'PGRST116' });
    return json(200, []);
  }

  return { respond, session, state, options: opts };
}

module.exports = {
  createFakeSupabase,
  AUTH_STORAGE_KEY,
  UID,
  SELLER,
  USERNAME,
  SELLER_USERNAME,
  MEMBER_USERNAME,
  GROUP_NAME,
  SHAREABLE_TRACK,
};
