import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type QueueRow = {
  message_id: number;
  room_slug: string;
  profile_id: string;
  username: string;
  body: string;
  created_at: string;
  moderation_status: string;
  report_count: number;
  reasons: string[];
};

export default function CommunityModeration() {
  const [rows,setRows]=useState<QueueRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState<number|null>(null);

  const load=useCallback(async()=>{
    if(!supabase){setRows([]);setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const {data,error:rpcError}=await supabase.rpc('admin_agora_report_queue',{p_limit:100});
      if(rpcError)throw rpcError;
      setRows((Array.isArray(data)?data:[]) as QueueRow[]);
    }catch(e:any){setError(e?.message||'Impossible de charger les signalements.');}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load();},[load]);

  const decide=async(messageId:number,decision:'RESTORE'|'HIDE')=>{
    if(!supabase||busy)return;
    setBusy(messageId);setError('');
    try{
      const {error:rpcError}=await supabase.rpc('admin_agora_moderate_message',{p_message_id:messageId,p_decision:decision});
      if(rpcError)throw rpcError;
      await load();
    }catch(e:any){setError(e?.message||'Action impossible.');}
    finally{setBusy(null);}
  };

  return <AdminLayout>
    <div className="page-title">Communauté</div>
    <div className="page-subtitle">La Place · messages signalés ou masqués automatiquement. Les insultes évidentes sont bloquées avant publication ; 3 signalements indépendants retirent automatiquement le message de la lecture publique jusqu’à décision.</div>
    {error?<div className="demo-banner" style={{borderColor:'#b42318'}}>Erreur : {error}</div>:null}
    {loading?<p style={{color:'var(--text-muted)'}}>Chargement…</p>:null}
    {!loading&&!rows.length?<div className="card"><p style={{margin:0,color:'var(--text-muted)'}}>Aucun message à modérer.</p></div>:null}
    <div style={{display:'grid',gap:12}}>
      {rows.map((row)=><div className="card" key={row.message_id}>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <strong>@{row.username}</strong>
          <span style={{fontSize:11,color:'var(--text-muted)'}}>#{row.room_slug} · {new Date(row.created_at).toLocaleString('fr-FR')}</span>
          <span style={{marginLeft:'auto',fontSize:11,fontWeight:900,color:row.moderation_status==='REVIEW'?'#FF5F83':'#FFD166'}}>{row.report_count} signalement{row.report_count>1?'s':''}</span>
        </div>
        <p style={{fontSize:14,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{row.body}</p>
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:10}}>{row.reasons?.length ? 'Motifs : ' + row.reasons.join(' · ') : 'Masqué automatiquement'}</div>
        <div style={{display:'flex',gap:8}}>
          <button disabled={busy===row.message_id} onClick={()=>void decide(row.message_id,'RESTORE')} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #38D990',background:'transparent',color:'#38D990',fontWeight:800,cursor:'pointer'}}>GARDER</button>
          <button disabled={busy===row.message_id} onClick={()=>void decide(row.message_id,'HIDE')} style={{padding:'8px 12px',borderRadius:8,border:0,background:'#FF5F83',color:'#2A0510',fontWeight:900,cursor:'pointer'}}>MASQUER</button>
        </div>
      </div>)}
    </div>
  </AdminLayout>;
}
