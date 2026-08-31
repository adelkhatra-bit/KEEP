from pathlib import Path

p=Path('packages/admin/pages/users.tsx')
s=p.read_text()
old="""  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const { data, error: rpcError } = await supabase.rpc('admin_user_directory');
      if (rpcError) throw rpcError;
      setUsers((data ?? []) as DirectoryUser[]);
    } catch (e: any) { setError(e?.message ?? 'Impossible de charger les utilisateurs.'); }
    finally { setLoading(false); }
  };"""
new="""  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Session Super Admin expirée. Reconnecte-toi.');
      let result = await supabase.rpc('admin_user_directory');
      if (result.error && /jwt|token|session|auth/i.test(String(result.error.message || ''))) {
        await supabase.auth.refreshSession();
        result = await supabase.rpc('admin_user_directory');
      }
      if (result.error) throw result.error;
      const rows = Array.isArray(result.data) ? result.data : [];
      setUsers(rows as DirectoryUser[]);
      if (!rows.length) setError('Annuaire chargé mais aucun profil n’est remonté. Actualise la session Super Admin.');
    } catch (e: any) { setUsers([]); setError(e?.message ?? 'Impossible de charger les utilisateurs.'); }
    finally { setLoading(false); }
  };"""
if old not in s: raise SystemExit('load anchor missing')
s=s.replace(old,new,1)
s=s.replace("<div className=\"card\" style={{ padding:0, overflow:'hidden', width:'100%' }}>","<div className=\"card\" style={{ padding:0, overflowX:'auto', overflowY:'hidden', width:'100%', WebkitOverflowScrolling:'touch' }}>",1)
s=s.replace("<table style={{ margin:0, width:'100%', tableLayout:'fixed' }}>","<table style={{ margin:0, width:'100%', minWidth:860, tableLayout:'fixed' }}>",1)
p.write_text(s)
