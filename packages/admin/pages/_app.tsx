import type { AppProps } from 'next/app';
import { FormEvent, useEffect, useState } from 'react';
import '../styles/globals.css';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

type AuthState = 'checking' | 'signed_out' | 'checking_role' | 'allowed' | 'forbidden';
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'MARKETING', 'MODERATOR', 'TECH'];

function LiveMarker() {
  return <div style={{ position:'fixed',top:10,right:10,zIndex:99999,background:'#22c55e',color:'#07110a',borderRadius:999,padding:'7px 11px',fontSize:11,fontWeight:900,letterSpacing:.7 }}>KEEP LIVE · RECONCILE</div>;
}

async function hasActiveAdminRole(userId:string):Promise<boolean>{
  if(!supabase)return false;
  const {data,error}=await supabase.from('admin_users').select('id,role,is_active').eq('id',userId).eq('is_active',true).maybeSingle();
  if(error||!data)return false;
  return ADMIN_ROLES.includes(String(data.role));
}

function friendlyAuthError(message?:string){
  if(!message)return 'Impossible de se connecter pour le moment.';
  if(/rate|security purposes|seconds/i.test(message))return 'Trop de demandes de connexion. Attends quelques instants puis réessaie.';
  if(/invalid login credentials|invalid credentials/i.test(message))return 'E-mail ou mot de passe incorrect.';
  if(/not found|signup|user/i.test(message))return 'Cette adresse n’est pas autorisée pour le Super Admin KEEP.';
  return 'Connexion impossible. Vérifie les informations puis réessaie.';
}

function AdminLogin(){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const signIn=async(e:FormEvent)=>{
    e.preventDefault();
    if(!supabase)return;
    const normalized=email.trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(normalized)){setError('Saisis une adresse e-mail valide.');return;}
    if(password.length<8){setError('Saisis ton mot de passe Super Admin.');return;}
    setBusy(true);setError('');
    const {error:signInError}=await supabase.auth.signInWithPassword({email:normalized,password});
    setBusy(false);
    if(signInError){setError(friendlyAuthError(signInError.message));return;}
  };

  if(!isSupabaseConfigured)return <main style={page}><LiveMarker/><div style={card}><div style={brand}>KEEP</div><h1 style={title}>Super Admin</h1><p style={muted}>Supabase n’est pas configuré dans cet environnement.</p></div></main>;

  return <main style={page}><LiveMarker/><form onSubmit={signIn} style={card}>
    <div style={brand}>KEEP</div>
    <h1 style={title}>Super Admin</h1>
    <p style={muted}>Connexion directe par e-mail + mot de passe. Aucun lien e-mail n’est envoyé et aucune redirection externe n’est utilisée.</p>
    <label style={label}>E-mail Super Admin</label>
    <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email" style={input}/>
    <label style={label}>Mot de passe</label>
    <div style={passwordRow}>
      <input type={showPassword?'text':'password'} value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="current-password" style={passwordInput}/>
      <button type="button" aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'} onClick={()=>setShowPassword(v=>!v)} style={eyeButton}>{showPassword?'◉':'◎'}</button>
    </div>
    {error?<p style={{color:'#fb7185',margin:'10px 0 0'}}>{error}</p>:null}
    <button type="submit" disabled={busy||!email.trim()||!password} style={button}>{busy?'Connexion…':'SE CONNECTER'}</button>
    <p style={hint}>Seuls les comptes présents dans `admin_users` avec un rôle actif peuvent entrer. Les sections visibles et les actions autorisées dépendent ensuite du rôle attribué.</p>
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
const passwordRow={display:'flex',alignItems:'center',borderRadius:12,border:'1px solid #3b3150',background:'#0d0a13',overflow:'hidden'} as const;
const passwordInput={flex:1,minWidth:0,padding:14,border:0,outline:'none',background:'transparent',color:'#fff',fontSize:16} as const;
const eyeButton={width:50,alignSelf:'stretch',border:0,borderLeft:'1px solid #3b3150',background:'#120e1b',color:'#a78bfa',fontSize:20,cursor:'pointer'} as const;
const button={width:'100%',marginTop:20,padding:14,border:0,borderRadius:999,background:'#7c3aed',color:'#fff',fontSize:16,fontWeight:800,cursor:'pointer'} as const;
const hint={margin:'14px 0 0',color:'#7f768c',fontSize:12,lineHeight:1.5} as const;
