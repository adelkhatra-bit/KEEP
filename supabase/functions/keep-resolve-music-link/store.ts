import { CACHE_TTL_MS, MusicLinkError, normalizeIdentity, sanitizeCachedResolution, type MusicLinkStore } from "./resolver.ts";

function unavailable(error: unknown): never {
  // Database messages may contain internal schema details; never expose them.
  void error;
  throw new MusicLinkError(503, "music_import_unavailable");
}

export function createMusicLinkStore(admin: any, now = () => Date.now()): MusicLinkStore {
  return {
    async cached(profileId, input) {
      // Cache only the current user's imported metadata; no new cache table,
      // no configuration pollution and no writes during preview.
      const { data, error } = await admin.from("music_library_items")
        .select("metadata").eq("profile_id", profileId).eq("provider", input.provider)
        .contains("metadata", { musicLinkResolution: { requestUrl: input.url } })
        .is("removed_at", null).limit(1).maybeSingle();
      if (error) return null;
      const cache = data?.metadata?.musicLinkResolution;
      const age = now() - Date.parse(cache?.resolvedAt);
      if (!Number.isFinite(age) || age < 0 || age >= CACHE_TTL_MS || !cache?.resolution?.track) return null;
      return sanitizeCachedResolution(cache.resolution, input);
    },
    async import(profileId, input, resolution) {
      const { track, providerIds, providerTrackId } = resolution;
      const libraryKey = () => admin.from("music_library_items").select("id,track_id,removed_at")
        .eq("profile_id", profileId).eq("provider", input.provider).eq("provider_track_id", providerTrackId).maybeSingle();
      const { data: existing, error: existingError } = await libraryKey();
      if (existingError) unavailable(existingError);
      if (existing?.track_id && !existing.removed_at) return { id: existing.track_id, alreadyImported: true };

      const { data: atomicId, error: atomicError } = await admin.rpc("service_catalog_track_from_shared_link", {
        p_title: track.title, p_artist: track.artist, p_isrc: track.isrc || null,
        p_artwork_url: track.artworkUrl || null, p_provider_ids: providerIds,
        p_external_urls: track.platformLinks, p_genres: track.genres || [],
      });
      let trackId: string | undefined = atomicId || undefined;
      // Existing deployments remain usable with strong unique identities until
      // the additive shared-link RPC is applied. All other RPC errors fail closed.
      if (atomicError && atomicError.code !== "PGRST202" && atomicError.code !== "42883") unavailable(atomicError);
      if (!atomicError && !trackId) unavailable(null);

      if (!trackId && track.isrc) {
        const { data: identified, error: lookupError } = await admin.from("tracks").select("id")
          .eq("isrc", track.isrc).limit(1).maybeSingle();
        if (lookupError) unavailable(lookupError);
        trackId = identified?.id;
      }
      if (!trackId) {
        const pattern = (s: string) => s.trim().replace(/[%_\\]/g, "\\$&").split(/\s+/).join("%");
        const { data, error } = await admin.from("tracks").select("id,title,artist,isrc")
          .ilike("title", pattern(track.title)).ilike("artist", pattern(track.artist)).limit(50);
        if (error) unavailable(error);
        trackId = data?.find((row: any) => normalizeIdentity(row.title) === normalizeIdentity(track.title)
          && normalizeIdentity(row.artist) === normalizeIdentity(track.artist)
          && (!track.isrc || !row.isrc || row.isrc.toUpperCase() === track.isrc))?.id;
      }
      const hasUniqueProviderId = ["spotify", "appleMusic", "deezer"].some((key) => Boolean(providerIds[key]));
      if (!trackId && (track.isrc || hasUniqueProviderId)) {
        const { data, error } = await admin.rpc("service_catalog_track_from_recognition", {
          p_title: track.title, p_artist: track.artist, p_isrc: track.isrc || null,
          p_artwork_url: track.artworkUrl || null, p_provider_ids: providerIds,
          p_external_urls: track.platformLinks, p_available_on: Object.keys(track.platformLinks),
          p_genres: track.genres || [],
        });
        if (error || !data) unavailable(error);
        trackId = data;
      }
      // The current canonical RPC/index explicitly removed text-identity
      // uniqueness. ISRC and the three provider indexes still guarantee atomic
      // identity; never race a new insert without one of these strong keys.
      if (!trackId) throw new MusicLinkError(503, "atomic_track_identity_required");
      const resolvedAt = new Date(now()).toISOString();
      const { data: inserted, error: insertError } = await admin.from("music_library_items").upsert({
        profile_id: profileId, provider: input.provider, provider_track_id: providerTrackId,
        provider_uri: input.url, track_id: trackId, isrc: track.isrc || null,
        title: track.title, artist: track.artist, artwork_url: track.artworkUrl || null,
        source_kind: "shared_link", visibility: "PRIVATE",
        metadata: { platformLinks: track.platformLinks, musicLinkResolution: { requestUrl: input.url, resolvedAt, resolution } },
      }, { onConflict: "profile_id,provider,provider_track_id", ignoreDuplicates: true }).select("id,track_id");
      if (insertError) unavailable(insertError);
      if (inserted?.length) return { id: trackId!, alreadyImported: false };
      const { data: winner, error: winnerError } = await libraryKey();
      if (winnerError || !winner?.track_id || winner.removed_at) unavailable(winnerError);
      return { id: winner.track_id, alreadyImported: true };
    },
  };
}
