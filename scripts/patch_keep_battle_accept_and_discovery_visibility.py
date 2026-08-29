from pathlib import Path

# Battle: always reload authoritative arena after accept; enlarge invitation without changing card design.
p=Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s=p.read_text()
s=s.replace("const loadedArena = response.arenaState || await loadArenaAfterAccept(response.arenaId);", "const loadedArena = await loadArenaAfterAccept(response.arenaId);", 1)
s=s.replace("invite: { marginTop: 9, minHeight: 118, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 22, borderWidth: 2,", "invite: { marginTop: 10, minHeight: 142, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 24, borderWidth: 2,", 1)
s=s.replace("inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 }", "inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }", 1)
s=s.replace("inviteLabel: { color: '#E5F266', fontSize: 14, lineHeight: 18", "inviteLabel: { color: '#E5F266', fontSize: 15, lineHeight: 20", 1)
s=s.replace("inviteName: { color: '#FFF', fontSize: 16, lineHeight: 20", "inviteName: { color: '#FFF', fontSize: 17, lineHeight: 22", 1)
s=s.replace("inviteQuestion: { color: '#F3EDF7', fontSize: 15, lineHeight: 20", "inviteQuestion: { color: '#F3EDF7', fontSize: 16, lineHeight: 22", 1)
s=s.replace("no: { flex: 1, minHeight: 56, paddingHorizontal: 14, borderRadius: 28", "no: { flex: 1, minHeight: 60, paddingHorizontal: 16, borderRadius: 30", 1)
s=s.replace("noText: { color: '#FFF', fontSize: 14", "noText: { color: '#FFF', fontSize: 15", 1)
s=s.replace("yes: { flex: 1, minHeight: 56, paddingHorizontal: 14, borderRadius: 28", "yes: { flex: 1, minHeight: 60, paddingHorizontal: 16, borderRadius: 30", 1)
s=s.replace("yesText: { color: '#17130B', fontSize: 14", "yesText: { color: '#17130B', fontSize: 15", 1)
p.write_text(s)

# Discovery: newest public profiles must not disappear just because they have no GPS yet.
# Local radii use GPS when present, then same-city/same-country fallback. WORLD shows every public visible profile.
p=Path('packages/mobile/src/screens/DiscoverScreen.tsx')
s=p.read_text()
s=s.replace("  approxLng?: number;\n};", "  approxLng?: number;\n  createdAt?: string;\n};", 1)
s=s.replace("    approxLng: normalizeOptionalCoordinate(row.approx_lng),\n  };", "    approxLng: normalizeOptionalCoordinate(row.approx_lng),\n    createdAt: row.created_at ? String(row.created_at) : undefined,\n  };", 1)
s=s.replace(".select('id,username,avatar_url,bio,city,country_code,kind,favorite_genres,favorite_artists,approx_lat,approx_lng')", ".select('id,username,avatar_url,bio,city,country_code,kind,favorite_genres,favorite_artists,approx_lat,approx_lng,created_at')", 1)
old="""    }).filter((item) => radiusKm >= 20000 ? true : item.distance !== null && item.distance <= radiusKm);"""
new="""    }).filter((item) => {
      if (radiusKm >= 20000) return true;
      if (item.distance !== null) return item.distance <= radiusKm;
      const sameCity = Boolean(user?.city && item.profile.city && user.city.trim().toLowerCase() === item.profile.city.trim().toLowerCase());
      const sameCountry = Boolean(user?.countryCode && item.profile.countryCode && user.countryCode.toUpperCase() === item.profile.countryCode.toUpperCase());
      return sameCity || (radiusKm >= 1000 && sameCountry);
    });"""
if old not in s: raise SystemExit('discover radius anchor missing')
s=s.replace(old,new,1)
s=s.replace("if (a.distance === null && b.distance === null) return a.profile.username.localeCompare(b.profile.username);", "if (a.distance === null && b.distance === null) return String(b.profile.createdAt || '').localeCompare(String(a.profile.createdAt || '')) || a.profile.username.localeCompare(b.profile.username);", 1)
s=s.replace("  }, [profiles, radiusKm, searchPosition, hasSearched]);", "  }, [profiles, radiusKm, searchPosition, hasSearched, user?.city, user?.countryCode]);", 1)
p.write_text(s)
