'use strict';
// Vérification locale (faux Supabase, données synthétiques) : menu ☰ Sessions + swipe vers le haut au doigt.
const http=require('http'),fs=require('fs'),path=require('path');
const fake=require('./fake-supabase.cjs');
const {chromium}=require('playwright');
const DIST=path.resolve(process.argv[2]);const PORT=4722;const ORIGIN=`http://127.0.0.1:${PORT}`;const BASE=`${ORIGIN}/KEEP`;
const OUT=process.env.OUT||'/tmp/swipecheck';fs.mkdirSync(OUT,{recursive:true});
function server(){const t={'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.ttf':'font/ttf','.wav':'audio/wav'};
 return new Promise(r=>{const s=http.createServer((q,res)=>{let u=decodeURIComponent(q.url.split('?')[0]);let f=path.join(DIST,u.replace(/^\/KEEP/,'')||'/');if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(DIST,'index.html');res.writeHead(200,{'content-type':t[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});s.listen(PORT,'127.0.0.1',()=>r(s))})}
const now=Date.now();
const tracks=[1,2,3,4].map(i=>({id:`e2e-entry-${i}`,status:'pending',detectedAt:new Date(now-i*60000).toISOString(),recommendations:[],track:{id:`e2e-track-${i}`,title:`Titre test ${i}`,artist:`Artiste test ${i}`,artworkUrl:null,previewUrl:`${'http://127.0.0.1:4722'}/KEEP/test.wav`}}));
const history={state:{sessions:[{ownerUserId:fake.UID,id:'e2e-session-1',startedAt:new Date(now-3600000).toISOString(),endedAt:new Date(now-1800000).toISOString(),title:'Session test',tracks}],dismissedKeepDecisionIds:[],dismissedSessionIds:[],dismissedFavoriteImportIds:[]},version:0};
async function swipeUp(page,cdp,x,y0,y1){const steps=8;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y0}]});for(let i=1;i<=steps;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y0+(y1-y0)*i/steps}]});await page.waitForTimeout(16)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
(async()=>{const srv=await server();const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const r={};
 try{const sb=fake.createFakeSupabase({origin:ORIGIN});const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await ctx.addInitScript(([k,v,h])=>{try{localStorage.setItem(k,v);localStorage.setItem('keep_has_seen_onboarding_guide','true');localStorage.setItem('keep-session-history',h)}catch{}},[fake.AUTH_STORAGE_KEY,JSON.stringify(sb.session),JSON.stringify(history)]);
 const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(String(e.message).slice(0,200)));
 await page.route(u=>!u.href.startsWith(ORIGIN),route=>{const u=route.request().url();if(/rpc\/keep_download_credit_status/.test(u))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({plan_code:'FREE',consumed:0,credit_limit:100,remaining:100,unlimited:false,cost_per_keep:3})});if(/supabase\.co/.test(new URL(u).hostname))return sb.respond(route);if(u.startsWith('data:')||u.startsWith('blob:'))return route.continue();return route.abort()});
 await page.goto(`${BASE}/`,{waitUntil:'load'});await page.getByText('Passer',{exact:true}).first().click({timeout:20000}).catch(()=>{});await page.waitForTimeout(2500);
 await page.screenshot({path:`${OUT}/1-accueil.png`});
 const menu=page.locator('[data-testid="home-sessions-menu"]').first();await menu.waitFor({timeout:30000});await menu.tap();await page.waitForTimeout(2000);
 await page.screenshot({path:`${OUT}/2-apres-menu.png`});
 r.sessions_ouvertes=(await page.getByText(/SWIPER TOUTES/).count())>0;
 const t0=Date.now();await page.evaluate(()=>new Promise(r=>setTimeout(r,50)));r.page_reactive_ms=Date.now()-t0;
 if(r.sessions_ouvertes){await page.getByText('Session test',{exact:true}).first().tap();await page.waitForTimeout(3500);await page.screenshot({path:`${OUT}/3-recap.png`});
  r.recap_scrollX=await page.evaluate(()=>[document.documentElement.scrollWidth,window.innerWidth,window.scrollX]);
  r.swipe_ouvert_directement=await page.locator('[data-testid="story-player"]').last().isVisible().catch(()=>false);
  const open=page.getByText(/SWIPER \/ PRÉÉCOUTER/).first();if(!r.swipe_ouvert_directement && await open.isVisible().catch(()=>false)){await open.tap();await page.waitForTimeout(3500)}
  await page.screenshot({path:`${OUT}/3b-deck.png`});
  const title=async()=>{const t=await page.locator('[data-testid="story-player"]').last().innerText().catch(()=>'');const m=t.match(/Titre test (\d)/);return m?Number(m[1]):null};
  r.titre_avant=await title();const cdp=await ctx.newCDPSession(page);
  await page.evaluate(()=>{window.__seq=[];const mo=new MutationObserver(()=>{const el=[...document.querySelectorAll('[data-testid="story-player"]')].pop();const m=(el?.innerText||'').match(/Titre test (\d)|Swipe terminé/);const v=m?m[0]:'-';if(window.__seq[window.__seq.length-1]!==v)window.__seq.push(v)});mo.observe(document.body,{subtree:true,childList:true,characterData:true});});
  if(process.env.KEY){await page.keyboard.press('ArrowUp');await page.waitForTimeout(1200);r.apres_fleche=await title();await page.screenshot({path:`${OUT}/5-fleche.png`});}
  const vp0=page.viewportSize();const X=vp0.width/2,Y=vp0.height*0.55;r.trace=[];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:X,y:Y}]});
  for(const d of [5,10,20,30,40,50,60,80,100,140,180]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:X,y:Y-d}]});await page.waitForTimeout(40);r.trace.push([d,await title()]);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(800);r.trace.push(['fin',await title()]);r.seq=await page.evaluate(()=>window.__seq);

  const vp=page.viewportSize();await swipeUp(page,cdp,vp.width/2,vp.height*0.55,vp.height*0.25);await page.waitForTimeout(1500);
  r.titre_apres=await title();await page.screenshot({path:`${OUT}/4-apres-swipe.png`});
  await swipeUp(page,cdp,vp.width/2,vp.height*0.75,vp.height*0.45);await page.waitForTimeout(1500);r.titre_apres_2=await title();}
 r.erreurs=errs;}catch(e){r.exception=String(e.message||e).slice(0,400)}
 console.log(JSON.stringify(r,null,1));await browser.close();srv.close();})();
