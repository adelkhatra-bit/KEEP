import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', ...parts), 'utf8');

describe('Événements + écoute FREE + sessions PC (source unique)', () => {
  const quota = read('supabase','migrations','20261011214500_listen_quota_periods_per_plan.sql');
  const events = read('supabase','migrations','20261011215000_event_stories_pulse_and_expiry.sql');
  const home = read('packages','mobile','src','screens','HomeScreenCompact.tsx');
  const modal = read('packages','mobile','src','components','ProfileStoryBar.tsx');
  const rail = read('packages','mobile','src','components','MusicStoryRail.tsx');

  it('pilote les quatre formules et distingue jour, semaine, mois, sans recharge', () => {
    for (const mode of ['DAY','WEEK','MONTH','NEVER']) expect(quota).toContain("'"+mode+"'");
    for (const plan of ['FREE','PREMIUM','CREATOR_PRO','VENUE_PRO']) {
      expect(quota).toContain("('"+plan+"'");
    }
    expect(quota).toContain("v_period_key:='LIFETIME'");
    expect(quota).toContain("'periodMode',v_mode");
    expect(quota).toContain("'nextResetAt',v_next_reset");
  });

  it('conserve le débit uniquement après succès et décision FREE', () => {
    const source = read('supabase','migrations','20261004235000_free_economy_unify_listen_core.sql');
    expect(source).toContain("service_record_listen_success");
    const original = read('packages','mobile','src','services','listenEconomyService.ts');
    expect(original).toContain('p_allow_free: allowFree');
    expect(quota).toContain("'overQuotaFreeCost',v_cost");
    expect(original).toContain("'NEVER'");
  });

  it('n’affiche plus Gardés et offre le transfert direct depuis iPhone', () => {
    expect(home).toContain('label="Restantes"');
    expect(home).not.toContain('label="Gardés"');
    expect(home).toContain('<WebCompanionSessionsPanel buttonOnly />');
    const pc = read('packages','mobile','src','components','WebCompanionSessionsPanel.tsx');
    expect(pc).toContain('testID="home-transfer-to-pc"');
    expect(pc).toContain('requestWebCompanionScreen(session.id, screen)');
  });

  it('filtre systématiquement les événements terminés du public', () => {
    expect(events).toContain("coalesce(e.ends_at,e.starts_at+interval '6 hours')>now()");
    expect(events).toContain("e.moderation_status='APPROVED'");
    expect(read('packages','mobile','src','services','creatorEventService.ts')).toContain('eventNotFinished(event)');
  });

  it('ne publie en Story qu’après validation, sur 24h, avec RSVP et Pulse', () => {
    expect(events).toContain("v_event.moderation_status::text <> 'APPROVED'");
    expect(events).toContain("s.created_at>=now()-interval '24 hours'");
    expect(events).toContain("r.going_count*5 + r.maybe_count + r.checked_in_count*10");
    expect(rail).toContain('testID={`story-event-${event.eventId}`}');
    expect(modal).toContain('testID="event-story-rsvp-actions"');
    expect(modal).toContain("await setEventRsvp(viewer.id, event.eventId, choice)");
    expect(modal).toContain("openEventStory.ticketPriceCents");
  });

  it('ne remplace ni les Stories musicales ni le menu ordinateur', () => {
    expect(rail).toContain('row.map(renderStory)');
    const nav = read('packages','mobile','src','navigation','DesktopSidebar.tsx');
    expect(nav).toContain('desktop-session-card');
    expect(nav).toContain('identifications restantes');
    expect(nav).toContain('String(username).replace');
  });
});
