// Candidate regression harness. Run from canonical repo after applying the QR patch.
// No real network, users, credentials or sessions are used.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
const path=require('node:path');
const input=process.argv[2] || '.';
const files=fs.statSync(input).isDirectory()
 ? Object.fromEntries(['supabase/functions/keep-web-pairing/index.ts','packages/mobile/src/components/WebPairingLifecycle.tsx'].map(p=>[p,fs.readFileSync(path.join(input,p),'utf8')]))
 : JSON.parse(fs.readFileSync(input));
async function scenario(choice){
 const effects=[],dialogs=[],calls=[];
 const user={id:'test-user'};
 const pairing={approveDesktopPairing:async()=>{calls.push('approve');return {status:'APPROVED'}},cancelDesktopPairing:async()=>{calls.push('cancel');return {status:'CANCELLED'}}};
 const React={useState:()=>[{pairingId:'test-pairing',token:'test-only'},()=>{}],useRef:()=>({current:false}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
 const dependencies={react:{__esModule:true,default:React},'react-native':{Platform:{OS:'ios'},Linking:{}},'../utils/keepAlert':{Alert:{alert:(...args)=>dialogs.push(args)}},'../services/supabaseClient':{supabase:{}},'../services/authService':{},'../store/useUserStore':{useUserStore:fn=>fn({user,isLocalGuest:false,isDemoMode:false})},'../store/useAccountGateStore':{},'../services/webPairingService':pairing};
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(files['packages/mobile/src/components/WebPairingLifecycle.tsx'],{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports:module.exports,module,require:n=>{assert.ok(n in dependencies,n);return dependencies[n]},console});
 module.exports.default();effects[1]();
 assert.deepEqual(calls,[],'scan must not approve before a choice');
 const buttons=dialogs[0][2];const button=buttons.find(b=>b.text===choice);assert.ok(button);button.onPress();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(calls,[choice==='Approuver'?'approve':'cancel']);
}
(async()=>{await scenario('Approuver');console.log('PASS scan waits for explicit approval');await scenario('Annuler');console.log('PASS cancellation calls cancellation only')})().catch(e=>{console.error(e.message);process.exitCode=1});
