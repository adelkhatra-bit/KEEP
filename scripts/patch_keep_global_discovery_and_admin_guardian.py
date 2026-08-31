from pathlib import Path

p=Path('packages/mobile/src/screens/DiscoverScreen.tsx')
s=p.read_text()
old="""    } catch {\n      resetSearchResults();\n      Alert.alert('Localisation', 'Impossible de récupérer ta position pour le moment.');\n    } finally {\n      setSearchBusy(false);\n    }\n  };"""
new="""    } catch {\n      // A returning/new account can still discover from its last persisted KEEP position\n      // when iOS/Android cannot return a fresh GPS fix at this exact moment.\n      if (supabase && user?.id && !isLocalGuest && !isDemoMode) {\n        const { data } = await supabase.from('profiles').select('approx_lat,approx_lng').eq('id', user.id).maybeSingle();\n        const lat = normalizeOptionalCoordinate(data?.approx_lat);\n        const lng = normalizeOptionalCoordinate(data?.approx_lng);\n        if (Number.isFinite(lat) && Number.isFinite(lng)) {\n          setSearchPosition({ latitude: lat as number, longitude: lng as number });\n          setProfileIndex(0);\n          setHasSearched(true);\n          setSearchBusy(false);\n          return;\n        }\n      }\n      resetSearchResults();\n      Alert.alert('Localisation', 'Impossible de récupérer ta position pour le moment. Vérifie l’autorisation GPS puis réessaie.');\n    } finally {\n      setSearchBusy(false);\n    }\n  };"""
if old not in s: raise SystemExit('discover anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

p=Path('packages/admin/pages/operations.tsx')
s=p.read_text()
s=s.replace("type PushSummaryRow = { status: string; total: number | string };", "type AutoRepairRow = { ran_at: string; stale_challenges_expired: number; battle_rounds_finalized: number; battle_rounds_advanced: number; notes: string | null };\ntype PushSummaryRow = { status: string; total: number | string };",1)
s=s.replace("  const [pushSummary, setPushSummary] = useState<PushSummaryRow[]>([]);", "  const [pushSummary, setPushSummary] = useState<PushSummaryRow[]>([]);\n  const [autoRepair, setAutoRepair] = useState<AutoRepairRow[]>([]);",1)
s=s.replace("const [integrationResult, runtimeResult, usersResult, pushSummaryResult, pushRecentResult, keylessResult] = await Promise.all([", "const [integrationResult, runtimeResult, usersResult, pushSummaryResult, pushRecentResult, keylessResult, autoRepairResult] = await Promise.all([",1)
s=s.replace("        supabase.functions.invoke('keep-keyless-social', { body: { action: 'health' } }),\n      ]);", "        supabase.functions.invoke('keep-keyless-social', { body: { action: 'health' } }),\n        supabase.rpc('admin_auto_repair_status'),\n      ]);",1)
s=s.replace("      setKeylessHealth(!keylessResult.error && keylessResult.data?.ok ? keylessResult.data as KeylessHealth : null);", "      setKeylessHealth(!keylessResult.error && keylessResult.data?.ok ? keylessResult.data as KeylessHealth : null);\n      setAutoRepair(!autoRepairResult.error ? (autoRepairResult.data ?? []) as AutoRepairRow[] : []);",1)
anchor="""      <div className=\"card\" style={{ marginBottom: 22 }}>\n        <h3 style={{ marginTop: 0 }}>Reconnaissance musicale — ordre réel de secours</h3>"""
insert="""      <div className=\"card\" style={{ marginBottom: 22 }}>\n        <h3 style={{ marginTop: 0 }}>Réparation automatique KEEP</h3>\n        <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>Le Guardian serveur contrôle chaque minute les états réparables sans risque : invitations Battle expirées et manches bloquées après leur délai. Les clés externes manquantes restent signalées et ne sont jamais inventées.</p>\n        <strong style={{ color: autoRepair.length ? '#86efac' : '#f59e0b' }}>{autoRepair.length ? 'ACTIF · contrôle automatique chaque minute' : 'À CONTRÔLER'}</strong>\n        {autoRepair[0] ? <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Dernier passage : {new Date(autoRepair[0].ran_at).toLocaleString()} · défis expirés {autoRepair[0].stale_challenges_expired} · manches finalisées {autoRepair[0].battle_rounds_finalized} · manches avancées {autoRepair[0].battle_rounds_advanced}</div> : null}\n      </div>\n\n"""+anchor
if anchor not in s: raise SystemExit('admin anchor missing')
s=s.replace(anchor,insert,1)
p.write_text(s)
