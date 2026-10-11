// Candidate regression harness. Run from canonical repo after applying the QR patch.
// No real network, users, credentials or sessions are used.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ts=require('typescript');
const path=require('node:path');
const input=process.argv[2] || '.';
const files=fs.statSync(input).isDirectory()
 ? Object.fromEntries(['supabase/functions/keep-web-pairing/index.ts','packages/mobile/src/components/WebPairingLifecycle.tsx'].map(p=>[p,fs.readFileSync(path.join(input,p),'utf8')]))
 : JSON.parse(fs.readFileSync(input));
const source=files['supabase/functions/keep-web-pairing/index.ts'].replace(/^import .*;\n/gm,'');
const token='test-only-random-proof';
async function run(action,{authenticated=true,status='WAITING',loseRace=false}={}){
 const tokenHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 const row={id:'test-pairing',token_hash:tokenHash,status,expires_at:new Date(Date.now()+300000).toISOString(),device_label:'Test PC',approved_user_id:null,action_link:null};
 let handler;
 const admin={auth:{getUser:async()=>({data:{user:authenticated?{id:'test-user',email:'test@example.invalid',email_confirmed_at:'2026-10-01'}:null},error:null}),admin:{generateLink:async()=>({data:{properties:{action_link:'https://example.invalid/test-only'}},error:null})}},from:(table)=>{
 assert.equal(table,'web_pairings');let patch=null;const filters=[];let resolved;
 const q={select:()=>q,update:p=>{patch=p;return q},eq:(k,v)=>{filters.push([k,v]);return q},maybeSingle:()=>exec(),then:(a,b)=>exec().then(a,b)};
 function exec(){if(resolved)return Promise.resolve(resolved);if(patch&&loseRace)row.status='CANCELLED';const matches=filters.every(([k,v])=>row[k]===v);if(matches&&patch)Object.assign(row,patch);resolved={data:matches?{...row}:null,error:null};return Promise.resolve(resolved)}return q;
 }};
 const module={exports:{}};
 const sandbox={module,exports:module.exports,createClient:()=>admin,Deno:{env:{get:()=>''},serve:fn=>{handler=fn}},crypto,TextEncoder,Request,Response,Uint8Array,btoa,atob,console,Date};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,sandbox);
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:authenticated?{authorization:'Bearer test-only'}:{},body:JSON.stringify({action,pairingId:row.id,token})}));return {code:response.status,body:await response.json(),row};
}
(async()=>{
 let failed=0;
 for(const [name,fn] of [
 ['cancel waiting invalidates request',async()=>{const r=await run('cancel');assert.equal(r.code,200);assert.equal(r.row.status,'CANCELLED')}],
 ['cancel requires authenticated user',async()=>assert.equal((await run('cancel',{authenticated:false})).code,401)],
 ['cancel cannot disconnect claimed session',async()=>{const r=await run('cancel',{status:'CLAIMED'});assert.equal(r.code,409);assert.equal(r.row.status,'CLAIMED')}],
 ['approve cannot report success after concurrent cancel',async()=>{const r=await run('approve',{loseRace:true});assert.equal(r.code,409);assert.equal(r.row.status,'CANCELLED')}],
 ['approved path still succeeds when waiting',async()=>{const r=await run('approve');assert.equal(r.code,200);assert.equal(r.row.status,'APPROVED')}],
 ]){try{await fn();console.log('PASS',name)}catch(e){failed++;console.log('FAIL',name,e.message)}}
 process.exitCode=failed?1:0;
})();
