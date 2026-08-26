import type { AppProps } from 'next/app';
import { FormEvent, useEffect, useState } from 'react';
import '../styles/globals.css';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

type AuthState = 'checking' | 'signed_out' | 'checking_role' | 'allowed' | 'forbidden';
const ADMIN_REDIRECT_URL = 'https://adelkhatra-bit.github.io/KEEP/admin-preview/';

function LiveMarker() {
  return <div style={{ position:'fixed',top:10,right:10,zIndex:99999,background:'#22c55e',color:'#07110a',borderRadius:999,padding:'7px 11px',fontSize:11,fontWeight:900,letterSpacing:.7 }}>KEEP LIVE · RECONCILE</div>;
}

async function hasActiveAdminRole(userId:string):Promise<boolean>{
  if(!supabase)return false;
  const {data,error}=await supabase.from('admin_users').select('id,role,is_active').eq('id',userId).eq('is_active',true).maybeSingle();
  if(error||!data)return false;
  return data.role==='SUPER_ADMIN'||data.role==='ADMIN';
}

function friendlyAuthError(message?:string){
  if(!message)return 'Impossible de se connecter pour le moment.';
  if(/rate|security purposes|seconds/i.test(message))return 'Trop de demandes de connexion. Attends quelques instants puis réessaie.';
  if(/expired|invalid|token/i.test(message))return 'Lien invalide ou expiré. Demande un nouveau lien.';
  if(/not found|signup|user/i.test(message))return 'Cette adresse n’est pas autorisée pour le Super Admin KEEP.';
  return 'Connexion impossible. Vérifie l’adresse puis réessaie.';
}

function AdminLogin(){
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');

  const sendLink=async(e:FormEvent)=>{
    e.preventDefault();
    if(!supabase)return;
    const normalized=email.trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(normalized)){setError('Saisis une adresse e-mail valide.');return;}
    setBusy(true);setError('');setInfo('');
    const {error:sendError}=await supabase.auth.signInWithOtp({
      email:normalized,
      options:{shouldCreateUser:false,emailRedirectTo:ADMIN_REDIRECT_URL},
    });
    setBusy(false);
    if(sendError){setError(friendlyAuthError(sendError.message));return;}
    setInfo(`Lien de connexion envoyé à ${normalized}. Ouvre l’e-mail puis clique sur le bouton KEEP.`);
  };

  if(!isSupabaseConfigured)return <main style={page}><LiveMarker/><div style={card}><div style={brand}>KEEP</div><h1 style={title}>Super Admin</h1><p style={muted}>Supabase n’est pas configuré dans cet environnement.</p></div></main>;

  return <main style={page}><LiveMarker/><form onSubmit={sendLink} style={card}>
    <div style={brand}>KEEP</div>
    <h1 style={title}>Super Admin</h1>
    <p style={muted}>Connexion sécurisée par lien e-mail. Aucun code à recopier. Seuls les comptes ayant un rôle Admin actif peuvent entrer.</p>
    <label style={label}>E-mail Super Admin</label>
    <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email" style={input}/>
    {info?<p style={{color:'#86efac',margin:'10px 0 0',lineHeight:1.5}}>{info}</p>:null}
    {error?<p style={{color:'#fb7185',margin:'10px 0 0'}}>{error}</p>:null}
    <button type="submit" disabled={busy||!email.trim()} style={button}>{busy?'Envoi…':'M’ENVOYER LE LIEN'}</button>
    <p style={hint}>Le lien revient directement sur ce Super Admin. La session reste ensuite connectée sur cet appareil jusqu’à déconnexion.</p>
  </form></main>;
}

export default function App({Component,pageProps}:AppProps){
  const [state,setState]=useState<AuthState>('checking');
  useEffect(()=>{
    const client=supabase;
    if(!client){setState('signed_out');return;}
    let active=true;
    const resolve=async()=>{
      const {data}=await client.auth.getSession();
      if(!active)return;
      const user=data.session?.user;
      if(!user){setState('signed_out');return;}
      setState('checking_role');
      const allowed=await hasActiveAdminRole(user.id);
      if(!active)return;
      if(!allowed){await client.auth.signOut();setState('forbidden');return;}
      setState('allowed');
    };
    void resolve();
    const {data:sub}=client.auth.onAuthStateChange(()=>void resolve());
    return()=>{active=false;sub.subscription.unsubscribe();};
  },[]);
  if(state==='checking'||state==='checking_role')return <main style={page}><LiveMarker/><div style={{color:'#fff'}}>Vérification de la session…</div></main>;
  if(state!=='allowed')return <AdminLogin/>;
  return <><LiveMarker/><Component {...pageProps}/></>;
}

const page={minHeight:'100vh',display:'grid',placeItems:'center',background:'#09070f',color:'#fff',padding:24} as const;
const card={width:'100%',maxWidth:420,background:'#151021',border:'1px solid #2c2340',borderRadius:24,padding:28,boxSizing:'border-box' as const};
const brand={fontSize:13,color:'#a78bfa',fontWeight:800,letterSpacing:1.4} as const;
const title={margin:'8px 0 6px',fontSize:30} as const;
const muted={margin:'0 0 24px',color:'#a9a2b7',lineHeight:1.5} as const;
const label={display:'block',margin:'14px 0 8px',fontWeight:700} as const;
const input={width:'100%',boxSizing:'border-box' as const,padding:14,borderRadius:12,border:'1px solid #3b3150',background:'#0d0a13',color:'#fff',fontSize:16};
const button={width:'100%',marginTop:20,padding:14,border:0,borderRadius:999,background:'#7c3aed',color:'#fff',fontSize:16,fontWeight:800,cursor:'pointer'} as const;
const hint={margin:'14px 0 0',color:'#7f768c',fontSize:12,lineHeight:1.5} as const;
