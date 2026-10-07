import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
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

type UserReportRow = {
  report_id: string;
  created_at: string;
  status: string;
  reason: string;
  kind: string;
  excerpt: string;
  details: string | null;
  reporter_username: string | null;
  reported_user_id: string;
  reported_username: string | null;
  reported_total_reports: number;
};

const REASON_LABEL: Record<string,string> = { harassment:'Harcèlement', spam:'Spam', inappropriate_content:'Contenu inapproprié', impersonation:'Usurpation', other:'Autre' };
const KIND_LABEL: Record<string,string> = { GROUP:'Groupe privé', DIRECT:'Message privé', PLACE:'La Place', PROFILE:'Profil' };

type TermRow = {
  id: string;
  term: string;
  category: string;
  status: string;
  source: string;
  report_count: number;
  example_excerpt: string | null;
  created_at: string;
};

const TERM_CATEGORIES = ['INSULTE','HAINE','DROGUE','SEXUEL','ARNAQUE','VIOLENCE','AUTRE'] as const;
const CATEGORY_LABEL: Record<string,string> = { INSULTE:'Insulte', HAINE:'Haine', DROGUE:'Drogue', SEXUEL:'Sexuel', ARNAQUE:'Arnaque', VIOLENCE:'Violence', AUTRE:'Autre' };

// Bibliothèque de modération (Adel 02/10/2026) : un seul filtre pour La Place,
// les messages privés et les groupes. Les mots des messages signalés arrivent
// ici « à vérifier » ; INTERDIRE les ajoute au filtre, REFUSER ne les
// reproposera plus.
function ModerationLibrary() {
  const [pending,setPending]=useState<TermRow[]>([]);
  const [active,setActive]=useState<TermRow[]>([]);
  const [categories,setCategories]=useState<Record<string,string>>({});
  const [unavailable,setUnavailable]=useState(false);
  const [libError,setLibError]=useState('');
  const [libBusy,setLibBusy]=useState<string|null>(null);
  const [newTerm,setNewTerm]=useState('');
  const [newCategory,setNewCategory]=useState<string>('INSULTE');
  const [showActive,setShowActive]=useState(false);

  const loadTerms=useCallback(async()=>{
    if(!supabase)return;
    setLibError('');
    const [p,a]=await Promise.all([
      supabase.rpc('admin_moderation_terms',{p_status:'PENDING',p_limit:200}),
      supabase.rpc('admin_moderation_terms',{p_status:'ACTIVE',p_limit:500}),
    ]);
    const err=p.error||a.error;
    if(err){
      // Migration pas encore appliquée : on l'indique sans casser la page.
      if(err.code==='PGRST202'||/admin_moderation_terms/.test(err.message||''))setUnavailable(true);
      else setLibError(err.message||'Impossible de charger la bibliothèque.');
      return;
    }
    setUnavailable(false);
    setPending((Array.isArray(p.data)?p.data:[]) as TermRow[]);
    setActive((Array.isArray(a.data)?a.data:[]) as TermRow[]);
  },[]);

  useEffect(()=>{void loadTerms();},[loadTerms]);

  const decideTerm=async(row:TermRow,status:'ACTIVE'|'REJECTED')=>{
    if(!supabase||libBusy)return;
    setLibBusy(row.id);setLibError('');
    try{
      const category=status==='ACTIVE'?(categories[row.id]||(row.category==='AUTRE'?'INSULTE':row.category)):null;
      const {error:rpcError}=await supabase.rpc('admin_moderation_decide_term',{p_term_id:row.id,p_status:status,p_category:category});
      if(rpcError)throw rpcError;
      await loadTerms();
    }catch(e:any){setLibError(e?.message||'Action impossible.');}
    finally{setLibBusy(null);}
  };

  const addTerm=async()=>{
    const term=newTerm.trim();
    if(!supabase||libBusy||term.length<2)return;
    setLibBusy('add');setLibError('');
    try{
      const {error:rpcError}=await supabase.rpc('admin_moderation_add_term',{p_term:term,p_category:newCategory});
      if(rpcError)throw rpcError;
      setNewTerm('');
      await loadTerms();
    }catch(e:any){setLibError(e?.message||'Ajout impossible.');}
    finally{setLibBusy(null);}
  };

  const grouped=TERM_CATEGORIES.map((c)=>({category:c,terms:active.filter((t)=>t.category===c)})).filter((g)=>g.terms.length);
  const selectStyle={padding:'7px 8px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'inherit',fontWeight:700} as const;

  return <section style={{marginBottom:28}}>
    <div className="page-title" style={{fontSize:18,marginTop:8}}>Mots <Hint title="Mots" text={<>Un seul filtre pour La Place, les messages privés et les groupes (accents, majuscules et « c0nnard » compris ; mots entiers uniquement). Les mots des messages signalés arrivent ici : INTERDIRE les bloque partout, REFUSER ne les reproposera plus.</>}/></div>
    {unavailable?<div className="card" style={{marginBottom:12}}><p style={{margin:0,color:'var(--text-muted)'}}>Bibliothèque pas encore activée sur la base (migration 20261003001500 en attente de mise en production).</p></div>:null}
    {libError?<div className="demo-banner" style={{borderColor:'#b42318'}}>Erreur : {libError}</div>:null}
    {!unavailable?<>
      <div className="card" style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
        <strong style={{fontSize:13}}>Ajouter un mot interdit</strong>
        <input value={newTerm} onChange={(e)=>setNewTerm(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter')void addTerm();}} placeholder="mot ou expression" maxLength={80} style={{flex:'1 1 180px',minWidth:0,padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'inherit'}}/>
        <select value={newCategory} onChange={(e)=>setNewCategory(e.target.value)} style={selectStyle}>
          {TERM_CATEGORIES.map((c)=><option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <button disabled={libBusy==='add'||newTerm.trim().length<2} onClick={()=>void addTerm()} style={{padding:'8px 12px',borderRadius:8,border:0,background:'#FF5F83',color:'#2A0510',fontWeight:900,cursor:'pointer'}}>INTERDIRE</button>
      </div>
      <div style={{fontSize:13,fontWeight:900,margin:'4px 0 8px'}}>À vérifier · {pending.length}</div>
      {!pending.length?<div className="card" style={{marginBottom:12}}><p style={{margin:0,color:'var(--text-muted)'}}>Aucun mot proposé par les signalements.</p></div>:null}
      <div style={{display:'grid',gap:10,marginBottom:14}}>
        {pending.map((t)=><div className="card" key={t.id} style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
          <div style={{flex:'1 1 200px',minWidth:0}}>
            <strong style={{fontSize:15}}>{t.term}</strong>
            <span style={{fontSize:11,color:'var(--text-muted)',marginLeft:8}}>{t.report_count} signalement{t.report_count>1?'s':''}</span>
            {t.example_excerpt?<div style={{fontSize:12,color:'var(--text-muted)',marginTop:4,overflowWrap:'anywhere'}}>« {t.example_excerpt} »</div>:null}
          </div>
          <select value={categories[t.id]||(t.category==='AUTRE'?'INSULTE':t.category)} onChange={(e)=>setCategories((c)=>({...c,[t.id]:e.target.value}))} style={selectStyle}>
            {TERM_CATEGORIES.map((c)=><option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          <button disabled={libBusy===t.id} onClick={()=>void decideTerm(t,'ACTIVE')} style={{padding:'8px 12px',borderRadius:8,border:0,background:'#FF5F83',color:'#2A0510',fontWeight:900,cursor:'pointer'}}>INTERDIRE</button>
          <button disabled={libBusy===t.id} onClick={()=>void decideTerm(t,'REJECTED')} style={{padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontWeight:800,cursor:'pointer'}}>REFUSER</button>
        </div>)}
      </div>
      <button onClick={()=>setShowActive((v)=>!v)} style={{padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'inherit',fontWeight:800,cursor:'pointer',marginBottom:10}}>{showActive?'Masquer':'Voir'} les mots interdits · {active.length}</button>
      {showActive?<div style={{display:'grid',gap:10}}>
        {grouped.map((g)=><div className="card" key={g.category}>
          <div style={{fontSize:12,fontWeight:900,marginBottom:8}}>{CATEGORY_LABEL[g.category]} · {g.terms.length}</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {g.terms.map((t)=><span key={t.id} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 8px',borderRadius:12,border:'1px solid var(--border)',fontSize:12}}>
              {t.term}
              <button aria-label={`Retirer ${t.term}`} title="Retirer de la liste" disabled={libBusy===t.id} onClick={()=>void decideTerm(t,'REJECTED')} style={{border:0,background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontWeight:900,padding:0}}>×</button>
            </span>)}
          </div>
        </div>)}
      </div>:null}
    </>:null}
  </section>;
}

export default function CommunityModeration() {
  const [rows,setRows]=useState<QueueRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState<number|null>(null);
  const [reports,setReports]=useState<UserReportRow[]>([]);
  const [reportBusy,setReportBusy]=useState<string|null>(null);

  const load=useCallback(async()=>{
    if(!supabase){setRows([]);setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const {data,error:rpcError}=await supabase.rpc('admin_agora_report_queue',{p_limit:100});
      if(rpcError)throw rpcError;
      setRows((Array.isArray(data)?data:[]) as QueueRow[]);
      // Signalements (groupes, privés, La Place, profils) -- Adel 02/10/2026.
      const reportsResult=await supabase.rpc('admin_user_report_queue',{p_status:'open',p_limit:100});
      if(reportsResult.error)throw reportsResult.error;
      setReports((Array.isArray(reportsResult.data)?reportsResult.data:[]) as UserReportRow[]);
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

  const closeReport=async(reportId:string,status:'resolved'|'dismissed')=>{
    if(!supabase||reportBusy)return;
    setReportBusy(reportId);setError('');
    try{
      const {error:rpcError}=await supabase.rpc('admin_review_user_report',{p_report_id:reportId,p_status:status});
      if(rpcError)throw rpcError;
      await load();
    }catch(e:any){setError(e?.message||'Action impossible.');}
    finally{setReportBusy(null);}
  };

  return <AdminLayout>
    <div className="page-title">Communauté <Hint title="Communauté" text={<>La Place · messages signalés ou masqués automatiquement. Les insultes évidentes sont bloquées avant publication ; 3 signalements indépendants retirent automatiquement le message de la lecture publique jusqu’à décision.</>}/></div>
    {error?<div className="demo-banner" style={{borderColor:'#b42318'}}>Erreur : {error}</div>:null}
    {loading?<p style={{color:'var(--text-muted)'}}>Chargement…</p>:null}
    <ModerationLibrary />
    <div className="page-title" style={{fontSize:18,marginTop:8}}>Signalements <Hint title="Signalements" text={<>Groupes privés, messages privés, La Place et profils. Chaque signalement t’envoie une notification. Pour sanctionner, ouvre le compte et retire des Free (montant négatif + raison : l’utilisateur est notifié).</>}/></div>
    {!loading&&!reports.length?<div className="card" style={{marginBottom:16}}><p style={{margin:0,color:'var(--text-muted)'}}>Aucun signalement en attente.</p></div>:null}
    <div style={{display:'grid',gap:12,marginBottom:24}}>
      {reports.map((r)=><div className="card" key={r.report_id}>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <strong>@{r.reported_username||'utilisateur'}</strong>
          <span style={{fontSize:11,color:'var(--text-muted)'}}>signalé par @{r.reporter_username||'utilisateur'} · {KIND_LABEL[r.kind]||r.kind} · {new Date(r.created_at).toLocaleString('fr-FR')}</span>
          <span style={{marginLeft:'auto',fontSize:11,fontWeight:900,color:r.reason==='harassment'?'#FF5F83':'#FFD166'}}>{REASON_LABEL[r.reason]||r.reason} · {r.reported_total_reports} au total</span>
        </div>
        {r.excerpt?<p style={{fontSize:14,lineHeight:1.5,whiteSpace:'pre-wrap'}}>« {r.excerpt} »</p>:null}
        {r.details?<p style={{fontSize:12,color:'var(--text-muted)'}}>{r.details}</p>:null}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <Link href={`/users?q=${encodeURIComponent(r.reported_username||'')}`} style={{padding:'8px 12px',borderRadius:8,border:0,background:'#FF5F83',color:'#2A0510',fontWeight:900,textDecoration:'none'}}>SANCTIONNER (FREE)</Link>
          <button disabled={reportBusy===r.report_id} onClick={()=>void closeReport(r.report_id,'resolved')} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #38D990',background:'transparent',color:'#38D990',fontWeight:800,cursor:'pointer'}}>TRAITÉ</button>
          <button disabled={reportBusy===r.report_id} onClick={()=>void closeReport(r.report_id,'dismissed')} style={{padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontWeight:800,cursor:'pointer'}}>SANS SUITE</button>
        </div>
      </div>)}
    </div>
    <div className="page-title" style={{fontSize:18}}>La Place</div>
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
