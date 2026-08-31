import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("unauthorized");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("unauthorized");
  return data.user;
}

async function activePlan(profileId: string): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("subscriptions")
    .select("status,current_period_end,created_at,plans!inner(code)")
    .eq("profile_id", profileId)
    .in("status", ["TRIALING", "ACTIVE"])
    .or(`current_period_end.is.null,current_period_end.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return String((data as any)?.plans?.code ?? "FREE");
}

function creatorAllowed(plan: string) {
  return plan === "CREATOR_PRO" || plan === "VENUE_PRO";
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const user = await requireUser(req);
    const plan = await activePlan(user.id);
    if (!creatorAllowed(plan)) return json({ ok: false, error: "creator_plan_required", required_plan: "CREATOR_PRO", current_plan: plan }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "event.create") {
      const name = clean(body?.name, 100);
      const description = clean(body?.description, 1200);
      const venueName = clean(body?.venueName, 120);
      const countryCode = clean(body?.countryCode, 2).toUpperCase() || null;
      const ticketUrl = clean(body?.ticketUrl, 500) || null;
      const startsAt = new Date(String(body?.startsAt ?? ""));
      const endsAtRaw = body?.endsAt ? new Date(String(body.endsAt)) : null;
      if (name.length < 3) return json({ ok: false, error: "event_name_required" }, 400);
      if (Number.isNaN(startsAt.getTime())) return json({ ok: false, error: "event_date_required" }, 400);
      if (endsAtRaw && (Number.isNaN(endsAtRaw.getTime()) || endsAtRaw <= startsAt)) return json({ ok: false, error: "invalid_event_end" }, 400);

      const { data: profile } = await admin.from("profiles").select("username,kind").eq("id", user.id).maybeSingle();
      const names = Array.isArray(body?.djArtistNames)
        ? body.djArtistNames.map((v: unknown) => clean(v, 60)).filter(Boolean).slice(0, 12)
        : [profile?.username ? String(profile.username) : ""].filter(Boolean);

      const { data, error } = await admin.from("events").insert({
        creator_id: user.id,
        name,
        description: description || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAtRaw?.toISOString() ?? null,
        venue_name: venueName || null,
        country_code: countryCode,
        approx_lat: Number.isFinite(Number(body?.lat)) ? Number(body.lat) : null,
        approx_lng: Number.isFinite(Number(body?.lng)) ? Number(body.lng) : null,
        dj_artist_names: names,
        external_ticket_url: ticketUrl,
      }).select("id,name,starts_at,venue_name").single();
      if (error) throw error;
      return json({ ok: true, event: data, plan });
    }

    if (action === "event.broadcast") {
      const eventId = clean(body?.eventId, 80);
      const message = clean(body?.message, 600);
      if (!eventId) return json({ ok: false, error: "event_id_required" }, 400);

      const { data: event, error: eventError } = await admin
        .from("events")
        .select("id,name,starts_at,venue_name,creator_id")
        .eq("id", eventId)
        .eq("creator_id", user.id)
        .maybeSingle();
      if (eventError) throw eventError;
      if (!event) return json({ ok: false, error: "event_not_found" }, 404);

      const { data: followers, error: followersError } = await admin
        .from("follows")
        .select("follower_id")
        .eq("followee_id", user.id);
      if (followersError) throw followersError;
      const followerIds = (followers ?? []).map((row: any) => String(row.follower_id));
      if (!followerIds.length) return json({ ok: true, sent: 0, event_id: eventId });

      // Respecte réellement le réglage « DJ & soirées ». Une préférence absente
      // vaut true, mais un utilisateur qui la coupe ne reçoit ni notification
      // in-app ni push pour les invitations d'événements.
      const { data: preferences, error: preferencesError } = await admin
        .from("notification_preferences")
        .select("profile_id,dj_enabled")
        .in("profile_id", followerIds);
      if (preferencesError) throw preferencesError;
      const djDisabled = new Set(
        (preferences ?? [])
          .filter((row: any) => row.dj_enabled === false)
          .map((row: any) => String(row.profile_id)),
      );
      const eligibleFollowerIds = followerIds.filter((id) => !djDisabled.has(id));
      if (!eligibleFollowerIds.length) return json({ ok: true, sent: 0, notifications_disabled: true, event_id: eventId });

      const { data: alreadySent, error: sentError } = await admin
        .from("event_recommendation_sends")
        .select("profile_id")
        .eq("event_id", eventId)
        .in("profile_id", eligibleFollowerIds);
      if (sentError) throw sentError;
      const seen = new Set((alreadySent ?? []).map((row: any) => String(row.profile_id)));
      const targets = eligibleFollowerIds.filter((id) => !seen.has(id));
      if (!targets.length) return json({ ok: true, sent: 0, already_sent: true, event_id: eventId });

      const startsLabel = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(event.starts_at));
      const bodyText = message || `${event.name} · ${startsLabel}${event.venue_name ? ` · ${event.venue_name}` : ""}`;
      const notifications = targets.map((profileId) => ({
        profile_id: profileId,
        type: "EVENT_INVITE",
        title: `Invitation · ${event.name}`,
        body: bodyText,
        data: { event_id: eventId, creator_id: user.id, response_options: ["GOING", "MAYBE", "NOT_GOING"] },
      }));
      const sends = targets.map((profileId) => ({ event_id: eventId, profile_id: profileId, sent_at: new Date().toISOString() }));

      const { error: notificationError } = await admin.from("notifications").insert(notifications);
      if (notificationError) throw notificationError;
      const { error: trackError } = await admin.from("event_recommendation_sends").upsert(sends, { onConflict: "event_id,profile_id", ignoreDuplicates: true });
      if (trackError) throw trackError;
      return json({ ok: true, sent: targets.length, event_id: eventId });
    }

    return json({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    console.error("[keep-creator-actions]", error);
    return json({ ok: false, error: String((error as Error)?.message || "server_error") === "unauthorized" ? "unauthorized" : "server_error" }, 500);
  }
});
