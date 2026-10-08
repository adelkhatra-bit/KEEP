'use strict';

// Same isolated Unix-socket PostgreSQL harness as problem-report-evidence.test.cjs.
// No dependency, DATABASE_URL, remote connection or production migration.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const migrations = path.resolve(__dirname, '../supabase/migrations');
const filename = '20261008110000_event_story_and_pulse.sql';
const read = name => fs.readFileSync(path.join(migrations, name), 'utf8');
const sql = read(filename);

test('event migration is non-destructive and music conflict target remains non-partial', () => {
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /\b(truncate|delete\s+from|drop\s+table)\b/i);
  assert.match(sql, /unique\(profile_id,track_id\)/);
  assert.match(sql, /on conflict\(profile_id,event_id\) do nothing/);
  assert.match(sql, /references public\.events\(id\) on delete cascade/);
});

test('isolated PostgreSQL: migration replay, preservation, XOR, moderation, RLS, Pulse, engagement and persistence', {
  skip: process.env.KEEP_EVENT_STORY_LOCAL_SQL !== '1'
    ? 'Enable KEEP_EVENT_STORY_LOCAL_SQL=1 for isolated PostgreSQL (never production)' : false,
}, () => {
  const bin = process.env.KEEP_LOCAL_PG_BIN || '/usr/lib/postgresql/16/bin';
  for (const name of ['initdb', 'pg_ctl', 'psql']) assert.ok(fs.existsSync(path.join(bin, name)));
  assert.notEqual(process.getuid?.(), 0);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-event-story-'));
  const data = path.join(temp, 'data');
  const port = '55439';
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  const run = (name, args, input) => execFileSync(path.join(bin, name), args, {
    env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  const query = input => run('psql', ['-X', '-h', temp, '-p', port, '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q'], input).trim();
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const owner = uuid(1), viewer = uuid(2), stranger = uuid(3), unverified = uuid(4), guest = uuid(5);
  const track = uuid(10), playlist = uuid(11), event = uuid(20), pending = uuid(21);
  const as = (id, input) => `set role authenticated; set request.jwt.claim.sub='${id}'; ${input}`;
  const rows = (id, call) => JSON.parse(query(as(id, `select coalesce(jsonb_agg(r),'[]'::jsonb) from public.${call} r;`)));
  const fails = (input, expected) => assert.throws(() => query(input),
    error => String(error.stderr).includes(expected));
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'),
      '-o', `-k ${temp} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    query(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated;
    `);
    // Use the real base migrations, not imagined playlists/country/event columns.
    for (const file of ['0001_core_identity.sql', '0002_music.sql', '0003_commerce.sql', '0004_events.sql']) query(read(file));
    query(read('20261001214638_fix_loki_pulse_style_key_lowercase_order.sql'));
    query(`
      alter table public.keep_decisions add column source_user_id uuid references public.profiles(id);
      alter table public.keep_decisions add column visibility text default 'PRIVATE';
      create table public.admin_users(id uuid primary key,is_active boolean,role text);
      create table public.notifications(profile_id uuid,type text,title text,body text,data jsonb);
      alter table public.events add column require_qr_code boolean not null default false;
    `);
    // Actual moderation DDL and RPCs. Calling admin_event_approve below proves
    // the real two-step photo/text PENDING -> APPROVED flow fires our trigger.
    query(read('20260908060000_event_moderation_queue.sql'));
    query(read('20260908070000_event_moderation_granular_flag_and_creator_limit.sql'));
    query(`alter table public.events add column audience_mode text not null default 'GENERAL';`);
    query(read('20260918110000_keep_event_ticket_direct_payout.sql'));
    for (const [file, table] of [
      ['20261001204000_adaptive_music_taste_learning.sql', 'profile_music_taste_scores'],
      ['20260827122000_admin_analytics_accounting.sql', 'product_events'],
    ]) {
      const source = read(file);
      const ddl = source.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`));
      assert.ok(ddl);
      query(ddl[0]);
    }
    query(read('20261005160000_story_pins.sql'));
    for (const file of ['20261005210000_story_pin_sale_masked.sql',
      '20261005300000_free_social_keep_and_shared_story_pin.sql', '20261006120000_story_free_pin.sql']) {
      const ddl = read(file).match(/alter table public\.story_pins add column[^;]+;/);
      assert.ok(ddl); query(ddl[0]);
    }
    // Exact historic policies for the affected tables; test restrictive AND
    // behavior against the creator FOR ALL policy, not a permissive fixture.
    const policies = read('0006_rls.sql');
    for (const table of ['events', 'event_rsvps']) {
      query(`alter table public.${table} enable row level security;`);
      for (const match of policies.matchAll(new RegExp(`create policy \\w+ on ${table}\\b[\\s\\S]*?;`, 'g'))) query(match[0]);
    }
    query(`
      alter table public.product_events enable row level security;
      insert into auth.users values
        ('${owner}',now(),false),('${viewer}',now(),false),('${stranger}',now(),false),
        ('${unverified}',null,false),('${guest}',now(),true);
      insert into public.profiles(id,username,country_code,approx_lat,approx_lng,is_adult)
        select id,'user-'||id,'FR',48.8,2.3,true from auth.users;
      insert into public.countries values ('FR','France','EUR',true),('US','USA','USD',true),('DE','Germany','EUR',true);
      insert into public.tracks(id,title,artist,genres) values ('${track}','Test','Artist',array[' House ']);
      insert into public.playlists(id,owner_id,provider,name) values ('${playlist}','${owner}','test','Party');
      insert into public.playlist_tracks(playlist_id,track_id) values ('${playlist}','${track}');
      insert into public.keep_decisions(profile_id,track_id,decision,visibility)
        values ('${owner}','${track}','KEPT','PUBLIC');
      insert into public.story_pins(profile_id,track_id,pinned_at,masked,uncertified,shared_from)
        values ('${owner}','${track}','2026-10-01 12:00Z',true,true,'${viewer}');
      insert into public.profile_music_taste_scores(profile_id,taste_type,taste_key,display_label,score)
        values ('${viewer}','GENRE','house','House',5);
      insert into public.admin_users values ('${owner}',true,'ADMIN');
      insert into public.follows(follower_id,followee_id) values ('${viewer}','${owner}');
      grant select,insert,update,delete on public.story_pins,public.events,public.event_rsvps,public.product_events to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
    `);
    const legacyPin = query('select to_jsonb(sp) from public.story_pins sp;');
    query(sql); query(sql);
    assert.equal(query(`select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.story_pins'::regclass and conname='story_pins_profile_track_key';`), 'UNIQUE (profile_id, track_id)');
    assert.equal(query(`select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.story_pins'::regclass and contype='p';`), 'PRIMARY KEY (id)');
    assert.equal(query(`select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.story_pins'::regclass and conname='story_pins_event_id_fkey';`),
    'FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE');
    assert.equal(query(`select count(*) from pg_index i join pg_constraint c on c.conindid=i.indexrelid
      where c.conrelid='public.story_pins'::regclass and c.conname='story_pins_profile_track_key'
        and i.indisunique and i.indpred is null;`), '1');
    assert.equal(query('select to_jsonb(sp)-\'id\'-\'event_id\' from public.story_pins sp;'), legacyPin);
    assert.equal(query(`select count(*) from public.story_pins where track_id='${track}' and pinned_at='2026-10-01 12:00Z';`), '1');
    assert.equal(query(as(owner, `select public.keep_pin_story_track('${track}');`)), 't');
    assert.equal(query(`select count(*) from public.story_pins where track_id='${track}';`), '1');
    fails(`insert into public.story_pins(profile_id) values ('${owner}');`, 'story_pins_track_event_xor');
    const createEvent = (id, overrides = '') => query(`
      insert into public.events(id,creator_id,name,starts_at,country_code,playlist_id,moderation_status,photo_status,text_status,approx_lat,approx_lng)
        values ('${id}','${owner}','Party',now()+interval '1 day','FR','${playlist}','APPROVED','APPROVED','APPROVED',48.8,2.3);
      ${overrides}
    `);
    createEvent(event);
    fails(as(viewer, `insert into public.story_pins(profile_id,event_id)
      values ('${viewer}','${event}');`), 'row-level security');
    fails(`insert into public.story_pins(profile_id,track_id,event_id) values ('${owner}','${track}','${event}');`, 'story_pins_track_event_xor');
    fails(`insert into public.story_pins(profile_id,event_id) values ('${owner}','${event}');`, 'story_pins_profile_event_key');
    fails(`insert into public.story_pins(profile_id,event_id) values ('${owner}','${uuid(999)}');`, 'foreign key');
    query(`insert into public.events(id,creator_id,name,starts_at,country_code,playlist_id)
      values ('${pending}','${owner}','Moderated',now()+interval '1 day','FR','${playlist}');`);
    assert.equal(query(`select count(*) from public.story_pins where event_id='${pending}';`), '0');
    query(`select public.admin_event_approve('${pending}','${owner}');`);
    assert.equal(query(`select count(*) from public.story_pins where event_id='${pending}';`), '1');
    const publicationTime = query(`select pinned_at from public.story_pins where event_id='${pending}';`);
    query(`select public.admin_event_approve('${pending}','${owner}');`);
    query(`update public.events set moderation_status='PENDING' where id='${pending}';
      select public.admin_event_approve('${pending}','${owner}');`);
    assert.equal(query(`select pinned_at from public.story_pins where event_id='${pending}';`), publicationTime);
    assert.equal(rows(viewer, `keep_story_events(array['${owner}'::uuid])`).length, 2);
    assert.equal(rows(stranger, `keep_story_events(array['${owner}'::uuid])`).length, 0);
    // Reverse follow and both directions of reprise are existing story links.
    query(`insert into public.follows values ('${owner}','${stranger}',now());`);
    assert.equal(rows(stranger, `keep_story_events(array['${owner}'::uuid])`).length, 2);
    query(`delete from public.follows where followee_id='${stranger}';
      insert into public.keep_decisions(profile_id,track_id,decision,source_user_id)
        values ('${stranger}','${track}','KEPT','${owner}');`);
    assert.equal(rows(stranger, `keep_story_events(array['${owner}'::uuid])`).length, 2);
    query(`update public.keep_decisions set profile_id='${owner}',source_user_id='${stranger}'
      where profile_id='${stranger}';`);
    assert.equal(rows(stranger, `keep_story_events(array['${owner}'::uuid])`).length, 2);
    for (const id of [unverified, guest]) {
      assert.equal(rows(id, 'keep_pulse_events()').length, 0);
      assert.equal(rows(id, `keep_story_events(array['${owner}'::uuid])`).length, 0);
      fails(as(id, `select public.keep_record_event_engagement('${event}','view');`), 'AUTH_REQUIRED');
    }
    fails(`set role anon; select public.keep_story_events(array['${owner}'::uuid]);`, 'permission denied');
    fails(`set role authenticated; select public.keep_record_event_engagement('${event}','view');`, 'AUTH_REQUIRED');
    // Negative moderation/disable hide read results without deleting ANY pin.
    for (const mutation of ["moderation_status='REJECTED'", "moderation_status='PENDING'", 'is_disabled=true']) {
      query(`update public.events set ${mutation} where id='${event}';`);
      assert.equal(query(as(viewer, `select count(*) from public.story_pins where event_id='${event}';`)), '0');
      assert.equal(query(as(viewer, `select count(*) from public.events where id='${event}';`)), '0');
      assert.equal(rows(viewer, `keep_story_events(array['${owner}'::uuid])`).length, 1);
      assert.ok(!rows(viewer, 'keep_pulse_events()').some(r => r.event_id === event));
      fails(as(viewer, `select public.keep_record_event_engagement('${event}','view');`), 'EVENT_NOT_VISIBLE');
      fails(as(viewer, `insert into public.event_rsvps(event_id,profile_id,status) values ('${event}','${viewer}','GOING');`), 'row-level security');
      assert.equal(query(`select count(*) from public.story_pins where event_id='${event}';`), '1');
      query(`update public.events set moderation_status='APPROVED',is_disabled=false where id='${event}';`);
    }
    query(`update public.story_pins set pinned_at=now()-interval '25 hours' where event_id='${pending}';`);
    query(`update public.events set moderation_status='PENDING' where id='${pending}';
      select public.admin_event_approve('${pending}','${owner}');`);
    assert.equal(rows(viewer, `keep_story_events(array['${owner}'::uuid])`).length, 1);
    assert.equal(query(`select count(*) from public.story_pins where event_id='${pending}';`), '1');
    query(`update public.story_pins set pinned_at=now() where event_id='${pending}';`);
    const otherCountry = uuid(22), sameCurrency = uuid(23), far = uuid(24), noStyle = uuid(25), adult = uuid(26);
    createEvent(otherCountry, `update public.events set country_code='US' where id='${otherCountry}';`);
    createEvent(sameCurrency, `update public.events set country_code='DE' where id='${sameCurrency}';`);
    createEvent(far, `update public.events set approx_lat=43.3,approx_lng=5.4 where id='${far}';`);
    createEvent(noStyle, `update public.events set playlist_id=null where id='${noStyle}';`);
    createEvent(adult, `update public.events set audience_mode='ADULTS_18_PLUS' where id='${adult}';`);
    let pulse = rows(viewer, 'keep_pulse_events()');
    assert.equal(pulse.length, 3);
    assert.ok(pulse.every(r => r.country_code === 'FR' && r.currency_code === 'EUR'));
    assert.ok(pulse.every(r => r.viewer_country_code === r.country_code
      && r.viewer_currency_code === r.currency_code && r.moderation_status === 'APPROVED'
      && r.photo_status === 'APPROVED' && r.text_status === 'APPROVED' && r.is_disabled === false));
    assert.equal(pulse[0].creator_username, `user-${owner}`);
    assert.deepEqual(pulse[0].genres, ['house']);
    assert.equal(rows(viewer, 'keep_pulse_events(1)').length, 1);
    query(`update public.profiles set is_adult=false where id='${viewer}';`);
    assert.equal(rows(viewer, 'keep_pulse_events()').length, 2);
    query(`update public.profiles set approx_lat=null where id='${viewer}';`);
    assert.equal(rows(viewer, 'keep_pulse_events()').length, 3); // country fallback, includes far FR only
    query(`update public.profile_music_taste_scores set score=-1 where profile_id='${viewer}';`);
    assert.equal(rows(viewer, 'keep_pulse_events()').length, 0);
    query(`update public.profile_music_taste_scores set score=5 where profile_id='${viewer}';
      update public.profiles set country_code=null where id='${viewer}';`);
    assert.equal(rows(viewer, 'keep_pulse_events()').length, 0);
    query(`update public.profiles set country_code='FR' where id='${viewer}';`);
    // Actual UI path: explicit persisted styles, no playlist and no dummy track.
    // Existing style key handles catalog label/code aliases consistently.
    const standalone = uuid(27);
    query(`insert into public.profile_music_taste_scores(profile_id,taste_type,taste_key,display_label,score)
      values ('${viewer}','GENRE','Hip-Hop/Rap','Hip-Hop/Rap',3);
      insert into public.events(id,creator_id,name,starts_at,country_code,music_genres,moderation_status,photo_status,text_status)
        values ('${standalone}','${owner}','No playlist',now()+interval '2 days','FR',
          array[' Hip-Hop '],'APPROVED','APPROVED','APPROVED');`);
    assert.equal(query(`select playlist_id is null from public.events where id='${standalone}';`), 't');
    assert.ok(rows(viewer, 'keep_pulse_events()').some(r => r.event_id === standalone));
    assert.deepEqual(rows(viewer, `keep_story_events(array['${owner}'::uuid])`)
      .find(r => r.event_id === standalone).genres, ['hip-hop']);
    query(`update public.events set music_genres=array['Classical'] where id='${standalone}';`);
    assert.ok(!rows(viewer, 'keep_pulse_events()').some(r => r.event_id === standalone));
    query(`update public.events set music_genres=array['House'] where id='${standalone}';`);
    assert.deepEqual(rows(viewer, 'keep_pulse_events()').find(r => r.event_id === standalone).genres, ['house']);
    query(`update public.profile_music_taste_scores set score=0
      where profile_id='${viewer}' and taste_key='Hip-Hop/Rap';
      update public.events set music_genres=array['Hip-Hop'] where id='${standalone}';`);
    assert.ok(!rows(viewer, 'keep_pulse_events()').some(r => r.event_id === standalone));
    query(`update public.events set music_genres=array['House'],is_disabled=true where id='${standalone}';`);
    for (const action of ['view', 'share']) {
      assert.equal(query(as(viewer, `select public.keep_record_event_engagement('${event}','${action}');`)), 't');
      assert.equal(query(as(viewer, `select public.keep_record_event_engagement('${event}','${action}');`)), 'f');
      assert.equal(query(as(owner, `select public.keep_record_event_engagement('${event}','${action}');`)), 'f');
    }
    fails(as(viewer, `select public.keep_record_event_engagement('${event}',null);`), 'INVALID_EVENT_ACTION');
    fails(as(viewer, `select public.keep_record_event_engagement('${event}','GOING');`), 'INVALID_EVENT_ACTION');
    fails(as(viewer, `insert into public.product_events(profile_id,event_id,event_name)
      values ('${stranger}','${event}','event_share');`), 'row-level security');
    assert.equal(query(as(viewer, 'select count(*) from public.product_events;')), '0');
    fails(as(viewer, 'select * from public.event_card_views;'), 'permission denied');
    // Regression: views do not inflate the existing dashboard's total shares.
    assert.equal(query('select count(*) from public.product_events;'), '1');
    assert.equal(query("select count(*) from public.product_events where event_name='event_share';"), '1');
    // Metadata-only legacy reports cannot inflate trusted organizer counts.
    query(`insert into public.product_events(profile_id,event_name,metadata)
      values ('${viewer}','event_share',jsonb_build_object('event_id','${event}'));`);
    query(as(viewer, `insert into public.event_rsvps(event_id,profile_id,status) values ('${event}','${viewer}','GOING')
      on conflict(event_id,profile_id) do update set status='GOING';`));
    // No SELECT restriction introduced: existing/future participants policies
    // continue to apply, while INSERT/UPDATE remain protected independently.
    query(`create policy event_rsvps_participants_fixture on public.event_rsvps
      for select to authenticated using (true);`);
    assert.equal(query(as(stranger, `select count(*) from public.event_rsvps where event_id='${event}';`)), '1');
    assert.equal(query(as(stranger, `update public.event_rsvps set status='MAYBE'
      where event_id='${event}' returning event_id;`)), '');
    fails(as(viewer, `update public.event_rsvps set profile_id='${stranger}' where event_id='${event}';`), 'row-level security');
    assert.deepEqual(rows(owner, `keep_my_event_stats('${event}')`), [{ event_id: event, views: 1, going: 1, shares: 1 }]);
    assert.deepEqual(rows(viewer, `keep_my_event_stats('${event}')`), []);
    assert.equal(rows(viewer, `keep_story_events(array['${owner}'::uuid])`).find(r => r.event_id === event).my_rsvp, 'GOING');
    assert.equal(query(`select music_genres::text from public.events where id='${standalone}';`), '{House}');
    fails(as(viewer, `insert into public.event_rsvps(event_id,profile_id,status)
      values ('${event}','${stranger}','GOING');`), 'row-level security');
    fails(as(viewer, 'select public.admin_event_country_stats();'), 'ADMIN_REQUIRED');
    const countryStats = JSON.parse(query(as(owner, `select public.admin_event_country_stats('FR');`)));
    assert.deepEqual(countryStats, [{ country_code: 'FR', currency_code: 'EUR', views: 1, shares: 1, going: 1 }]);
    assert.doesNotMatch(JSON.stringify(countryStats), /profile_id|username|metadata/);
    // Paid participation cannot bypass the existing organizer-confirmed ticket
    // flow, even through direct table writes or an UPDATE from MAYBE.
    const paid = uuid(28), order = uuid(29);
    createEvent(paid, `update public.events set ticket_price_cents=500 where id='${paid}';`);
    const paidGoing = `insert into public.event_rsvps(event_id,profile_id,status)
      values ('${paid}','${viewer}','GOING') on conflict(event_id,profile_id) do update set status='GOING';`;
    fails(as(viewer, paidGoing), 'row-level security');
    query(as(viewer, `insert into public.event_rsvps(event_id,profile_id,status)
      values ('${paid}','${viewer}','MAYBE');`));
    fails(as(viewer, `update public.event_rsvps set status='GOING' where event_id='${paid}';`), 'row-level security');
    query(`insert into public.event_ticket_orders(id,event_id,seller_id,buyer_id,amount_cents,currency_code)
      values ('${order}','${paid}','${owner}','${viewer}',500,'EUR');`);
    fails(as(viewer, paidGoing), 'row-level security');
    fails(as(viewer, `select public.keep_event_ticket_mark_paid('${order}');`), 'ORDER_NOT_FOUND_OR_NOT_YOURS');
    query(as(owner, `select public.keep_event_ticket_mark_paid('${order}');`));
    assert.equal(query(as(viewer, `select status from public.event_rsvps where event_id='${paid}';`)), 'GOING');
    query(as(viewer, paidGoing));
    assert.deepEqual(rows(owner, `keep_my_event_stats('${paid}')`), [{ event_id: paid, views: 0, going: 1, shares: 0 }]);
    query(`update public.event_ticket_orders set status='REFUNDED' where id='${order}';`);
    fails(as(viewer, paidGoing), 'row-level security');
    query(`update public.event_ticket_orders set status='COMPLETED' where id='${order}';`);
    query(sql); // Replay with existing event pins AND engagement records.
    run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-m', 'fast', '-w', 'restart',
      '-o', `-k ${temp} -p ${port} -c listen_addresses=''`]);
    assert.deepEqual(rows(owner, `keep_my_event_stats('${event}')`), [{ event_id: event, views: 1, going: 1, shares: 1 }]);
    assert.equal(rows(viewer, `keep_story_events(array['${owner}'::uuid])`).find(r => r.event_id === event).my_rsvp, 'GOING');
    assert.equal(query(`select music_genres::text from public.events where id='${standalone}';`), '{House}');
    assert.equal(query(as(viewer, `select status from public.event_rsvps where event_id='${paid}';`)), 'GOING');
    // FK cascade only on explicit deletion in this disposable fixture.
    query(`delete from public.events where id='${event}';`);
    assert.equal(query(`select count(*) from public.story_pins where event_id='${event}';`), '0');
    assert.equal(query(`select count(*) from public.story_pins where track_id='${track}';`), '1');
    assert.equal(query('select count(*) from public.event_card_views where event_id is null;'), '1');
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
