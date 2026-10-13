/* Browser regression: one temporary pasted-link preview, not a kept session track.
 * Run in the dual-viewport guardian against the local Expo Web runtime.
 * Metadata API is mocked to test the client contract deterministically;
 * full-stack CI separately checks the live Supabase YouTube resolver.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.KEEP_TEST_WEB_ORIGIN || 'http://127.0.0.1:8081';

async function openHome(page) {
  await page.goto(BASE, { waitUntil:'domcontentloaded', timeout:60000 });
  const trial=page.getByText('ESSAYER GRATUITEMENT',{exact:true}).last();
  if (await trial.isVisible().catch(()=>false)) await trial.click({force:true,timeout:2000}).catch(()=>{});
  await page.getByText('Loki Music',{exact:true}).filter({visible:true}).first().waitFor({state:'visible',timeout:20000});
  // First-run tour is a real interactive sheet. Dismiss it as a user would,
  // rather than force-click through the help bubble covering the search control.
  const skipTour = page.getByLabel('Passer le mini-tour').filter({visible:true}).first();
  if (await skipTour.isVisible().catch(()=>false)) {
    await skipTour.click({timeout:5000});
  }
}

async function check(viewport,label,browser) {
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  await context.route('**/functions/v1/keep-music-keyless-source',route=>route.fulfill({
    status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'},
    body:JSON.stringify({ok:true,provider:'KEYLESS_SOURCE',strategy:'test-catalog',recognition:{
      title:'Never Gonna Give You Up',artist:'Rick Astley',confidence:0.95,
      artworkUrl:'',externalUrls:{source:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},providerIds:{},availableOn:[],
    }}),
  }));
  const page=await context.newPage();
  try {
    await openHome(page);
    const open=async()=>{
      await page.getByLabel('Chercher un morceau par son titre ou son lien').filter({visible:true}).first().click({timeout:15000});
      const field=page.getByPlaceholder(/Artiste.*Titre.*lien YouTube/).last();
      await field.waitFor({state:'visible',timeout:10000});
      await field.fill('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
      await page.getByText('Chercher',{exact:true}).filter({visible:true}).last().click({timeout:10000});
      await page.getByTestId('home-manual-search-result').waitFor({state:'visible',timeout:15000});
      await page.getByText('Aperçu non enregistré',{exact:false}).filter({visible:true}).last().waitFor({state:'visible',timeout:10000});
    };
    await open();
    const preview=page.getByTestId('home-manual-search-result');
    if (await preview.count()!==1) throw new Error(label+': duplicate search preview');
    await page.getByTestId('close-manual-search-preview').click();
    await preview.waitFor({state:'detached',timeout:10000});

    await open();
    await page.getByText('Découvertes',{exact:true}).filter({visible:true}).last().click();
    await page.getByText('Loki Music',{exact:true}).filter({visible:true}).last().click();
    await preview.waitFor({state:'detached',timeout:10000});

    await open();
    await page.reload({waitUntil:'domcontentloaded',timeout:60000});
    const trial=page.getByText('ESSAYER GRATUITEMENT',{exact:true}).last();
    if (await trial.isVisible().catch(()=>false)) await trial.click({force:true,timeout:2000}).catch(()=>{});
    await preview.waitFor({state:'detached',timeout:10000});
    fs.mkdirSync('artifacts/dual-viewport',{recursive:true});
    await page.screenshot({path:'artifacts/dual-viewport/temporary-link-'+label+'.png'});
    console.log(label+' PASS: link is a one-off preview, closes, clears on tab change, clears on reload');
  } finally { await context.close(); }
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    await check({width:390,height:844},'mobile-390x844',browser);
    await check({width:1440,height:900},'desktop-1440x900',browser);
  } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1});
