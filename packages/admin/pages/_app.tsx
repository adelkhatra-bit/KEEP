import type { AppProps } from 'next/app';
import { FormEvent, useEffect, useRef, useState } from 'react';
import '../styles/globals.css';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { APP_NAME } from '../lib/brand';

type AuthState = 'checking' | 'signed_out' | 'checking_role' | 'allowed' | 'forbidden' | 'role_check_failed';
type RoleCheck = 'allowed' | 'denied' | 'error';
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'MARKETING', 'MODERATOR', 'TECH'];

function LiveMarker() {
  // Adel (01/09/2026) : ce badge en haut à droite recouvrait la cloche de
  // notifications -- descendu en bas à droite, hors du chemin de la barre
  // d'outils. Le texte reste identique : requis tel quel par
  // scripts/verify-source-of-truth.cjs.
  return <div style={{ position:'fixed',bottom:10,right:10,zIndex:200,background:'#22c55e',color:'#07110a',borderRadius:999,padding:'7px 11px',fontSize:11,fontWeight:900,letterSpacing:.7 }}>{APP_NAME} LIVE · RECONCILE</div>;
}

// Tri-etat volontaire : une erreur reseau/serveur ('error') n'est PAS un refus
// ('denied'). Seul un refus explicite peut fermer la session ; une panne
// passagere ne doit jamais deconnecter le Super Admin.
async function checkAdminRole():Promise<RoleCheck>{
  if(!supabase)return 'error';
  const {data,error}=await supabase.rpc('get_my_admin_role');
  if(error)return 'error';
  return data&&ADMIN_ROLES.includes(String(data))?'allowed':'denied';
}

function friendlyAuthError(message?:string){
  if(!message)return 'Impossible de se connecter pour le moment.';
  if(/rate|security purposes|seconds/i.test(message))return 'Trop de demandes de connexion. Attends quelques instants puis réessaie.';
  if(/invalid login credentials|invalid credentials/i.test(message))return 'Adresse e-mail ou mot de passe incorrect.';
  if(/not found|signup|user/i.test(message))return `Ce compte n’est pas autorisé pour le Super Admin ${APP_NAME}.`;
  return 'Connexion impossible. Vérifie les informations puis réessaie.';
}

function normalizeAdminEmail(identity:string){
  const normalized=identity.trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(normalized) ? normalized : '';
}

async function signInOrBootstrap(email:string,password:string){
  if(!supabase)return {ok:false,error:'Supabase indisponible.'};
  const first=await supabase.auth.signInWithPassword({email,password});
  if(!first.error)return {ok:true,error:''};

  // Une seule voie de secours : le mot de passe temporaire Super Admin remis
  // par le propriétaire. L'Edge Function vérifie un hash à usage unique, le
  // rôle SUPER_ADMIN et l'expiration avant de définir ce même mot de passe.
  // Aucun mot de passe n'est embarqué dans le bundle web ou le dépôt GitHub.
  const {data:bootstrap,error:bootstrapError}=await supabase.functions.invoke('keep-admin-bootstrap',{body:{email,password}});
  if(bootstrapError||!bootstrap?.ok)return {ok:false,error:friendlyAuthError(first.error.message)};

  const retry=await supabase.auth.signInWithPassword({email,password});
  if(retry.error)return {ok:false,error:friendlyAuthError(retry.error.message)};
  return {ok:true,error:''};
}

function AdminLogin(){
  const [identity,setIdentity]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');

  // Meme chemin que « mot de passe oublie » de l'application : keep-auth-email
  // genere le lien (API admin) et l'envoie par Brevo -- jamais le SMTP du
  // Dashboard Supabase. Reponse volontairement identique que le compte existe
  // ou non (anti-enumeration). Le lien ouvre l'URL canonique KEEP pour choisir
  // le nouveau mot de passe ; il s'applique ensuite ici (meme compte).
  const forgotPassword=async()=>{
    if(!supabase)return;
    const email=normalizeAdminEmail(identity);
    if(!email){setError('Saisis d’abord l’adresse e-mail de ton compte Super Admin.');setInfo('');return;}
    setBusy(true);setError('');setInfo('');
    const {data,error:fnError}=await supabase.functions.invoke('keep-auth-email',{body:{action:'recovery',email}});
    setBusy(false);
    if(fnError||!data?.ok){setError('Envoi impossible pour le moment. Réessaie dans quelques minutes.');return;}
    setInfo('Si cette adresse correspond à un compte, un e-mail de réinitialisation vient d’être envoyé. Choisis ton nouveau mot de passe via le lien, puis reviens ici.');
  };

  const signIn=async(e:FormEvent)=>{
    e.preventDefault();
    if(!supabase)return;
    const email=normalizeAdminEmail(identity);
    if(!email){setError('Saisis l’adresse e-mail de ton compte Super Admin.');return;}
    if(password.length<8){setError('Saisis ton mot de passe Super Admin.');return;}
    setBusy(true);setError('');
    const result=await signInOrBootstrap(email,password);
    setBusy(false);
    if(!result.ok)setError(result.error);
  };

  if(!isSupabaseConfigured)return <main style={page}><LiveMarker/><div style={card}><div style={brand}>{APP_NAME}</div><h1 style={title}>Super Admin</h1><p style={muted}>Supabase n’est pas configuré dans cet environnement.</p></div></main>;

  return <main style={page}><LiveMarker/><form onSubmit={signIn} style={card}>
    <div style={brand}>{APP_NAME}</div>
    <h1 style={title}>Super Admin</h1>
    <p style={muted}>Connexion sécurisée par adresse e-mail et mot de passe. Aucun lien e-mail n’est envoyé pour se connecter ; seul « Mot de passe oublié ? » envoie un e-mail de réinitialisation.</p>
    <label style={label}>Adresse e-mail Super Admin</label>
    <input type="email" value={identity} onChange={(e)=>setIdentity(e.target.value)} autoComplete="username" placeholder="nom@exemple.com" style={input}/>
    <label style={label}>Mot de passe</label>
    <div style={passwordRow}>
      <input type={showPassword?'text':'password'} value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="current-password" style={passwordInput}/>
      <button type="button" aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'} onClick={()=>setShowPassword(v=>!v)} style={eyeButton}>{showPassword?'◉':'◎'}</button>
    </div>
    {error?<p style={{color:'#fb7185',margin:'10px 0 0'}}>{error}</p>:null}
    {info?<p style={{color:'#4ade80',margin:'10px 0 0',lineHeight:1.5}}>{info}</p>:null}
    <button type="submit" disabled={busy||!identity.trim()||!password} style={button}>{busy?'Connexion…':'SE CONNECTER'}</button>
    <button type="button" onClick={()=>void forgotPassword()} disabled={busy} style={linkButton}>Mot de passe oublié ?</button>
    <p style={hint}>Seuls les comptes présents dans `admin_users` avec un rôle actif peuvent entrer. À la première connexion, un mot de passe temporaire valide peut être activé automatiquement une seule fois.</p>
  </form></main>;
}

export default function App({Component,pageProps}:AppProps){
  const [state,setState]=useState<AuthState>('checking');
  const stateRef=useRef<AuthState>('checking');
  const update=(next:AuthState)=>{stateRef.current=next;setState(next);};
  const resolveRef=useRef<()=>Promise<void>>(async()=>{});
  useEffect(()=>{
    const client=supabase;
    if(!client){update('signed_out');return;}
    let active=true;
    const resolve=async()=>{
      const {data}=await client.auth.getSession();
      if(!active)return;
      const user=data.session?.user;
      if(!user){update('signed_out');return;}
      if(stateRef.current!=='allowed')update('checking_role');
      const role=await checkAdminRole();
      if(!active)return;
      // Panne reseau/serveur : on garde la session et on propose de reessayer.
      if(role==='error'){if(stateRef.current!=='allowed')update('role_check_failed');return;}
      // Adel (11/09/2026, audit) : signOut() global par defaut deconnectait
      // aussi l'utilisateur de tous ses AUTRES appareils/sessions (mobile
      // compris) des qu'un compte valide mais sans role admin actif tentait
      // ce login -- confirme en direct (session mobile coupee pendant ce
      // test). scope:'local' limite la deconnexion a cet onglet Super Admin.
      if(role==='denied'){await client.auth.signOut({scope:'local'});update('forbidden');return;}
      update('allowed');
    };
    resolveRef.current=resolve;
    void resolve();
    // TOKEN_REFRESHED / INITIAL_SESSION ne changent ni l'identite ni le role :
    // les retraiter demontait la page en cours (formulaires perdus) et
    // multipliait les occasions d'echec du controle de role.
    const {data:sub}=client.auth.onAuthStateChange((event)=>{
      if(event==='TOKEN_REFRESHED'||event==='INITIAL_SESSION')return;
      void resolve();
    });
    return()=>{active=false;sub.subscription.unsubscribe();};
  },[]);
  if(state==='checking'||state==='checking_role')return <main style={page}><LiveMarker/><div style={{color:'#fff'}}>Vérification de la session…</div></main>;
  if(state==='role_check_failed')return <main style={page}><LiveMarker/><div style={card}><div style={brand}>{APP_NAME}</div><h1 style={title}>Connexion conservée</h1><p style={muted}>Impossible de vérifier ton rôle pour le moment (réseau ou serveur). Ta session n’a pas été fermée.</p><button type="button" style={button} onClick={()=>{update('checking_role');void resolveRef.current();}}>RÉESSAYER</button></div></main>;
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
const linkButton={width:'100%',marginTop:10,padding:12,border:0,background:'transparent',color:'#a78bfa',fontSize:14,fontWeight:700,cursor:'pointer',textDecoration:'underline'} as const;
const hint={margin:'14px 0 0',color:'#7f768c',fontSize:12,lineHeight:1.5} as const;
