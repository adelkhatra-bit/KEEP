const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { generateKeyPairSync } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Run against the real Next export, with synthetic auth/provider responses only.
// Requires Node 22+, Chrome, and an existing export served at KEEP_ADMIN_SMOKE_URL.
test('export admin : import .p8, contrôles et rendu 390/1440', {
  skip: !process.env.KEEP_ADMIN_SMOKE_URL,
  timeout: 60000,
}, async () => {
  const directory = path.resolve('packages/admin/.browser-smoke');
  const debugPort = Number(process.env.KEEP_ADMIN_SMOKE_CDP_PORT || 9225);
  fs.mkdirSync(directory, { recursive: true });
  const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
    '--headless', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${directory}`, 'about:blank',
  ], { stdio: 'ignore' });
  const chromeExited = new Promise((resolve) => chrome.once('exit', resolve));
  let ws;
  let id = 0;
  const pending = new Map();
  const errors = [];
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  try {
    let targets;
    for (let i = 0; i < 200; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(targets, 'Chrome doit démarrer');
    ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push('console.error');
    });
    await command('Runtime.enable');
    await command('Page.enable');
    const evaluate = async (expression) => {
      const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
      return response.result.value;
    };
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__integrationCalls = [];
      const user = { id: '00000000-0000-4000-8000-000000000055', email: 'smoke@example.invalid' };
      const token = btoa(JSON.stringify({alg:'HS256',typ:'JWT'})) + '.' + btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:user.id})) + '.synthetic';
      localStorage.setItem('keep-superadmin-auth-v1', JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,user}));
      const keys = ['APPLE_MUSICKIT_PRIVATE_KEY','APPLE_MUSICKIT_KEY_ID','APPLE_MUSICKIT_TEAM_ID','APPLE_IAP_PRIVATE_KEY','APPLE_IAP_KEY_ID','APPLE_IAP_ISSUER_ID','SPOTIFY_CLIENT_SECRET','MAILJET_API_KEY'];
      window.__smokeRows = keys.map(key => ({key,category:key.includes('IAP')?'payments':'music',label:key,secret:key.includes('PRIVATE')||key.includes('SECRET'),configured:key==='SPOTIFY_CLIENT_SECRET',hint:null,updatedAt:null}));
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (url, options = {}) => {
        const value = String(url);
        if (!value.includes('supabase.co')) return originalFetch(url, options);
        let data = null;
        if (value.includes('get_my_admin_role')) data = 'SUPER_ADMIN';
        else if (value.includes('/auth/')) data = user;
        else if (value.includes('/functions/')) {
          const body = JSON.parse(options.body || '{}');
          window.__integrationCalls.push(body);
          if (body.action === 'integrations.list') data = {ok:true,data:window.__smokeRows};
          else if (body.action === 'integrations.test') {
            await new Promise(resolve => setTimeout(resolve, 200));
            data = {ok:true,data:window.__smokeRows.map(row=>({key:row.key,status:row.configured?'ERROR':'NOT_CONFIGURED',message:'Autorisation fournisseur refusée pour cette clé',checkedAt:new Date().toISOString()}))};
          } else if (body.action === 'integrations.set') data = {ok:true};
          else data = {ok:true,data:[]};
        } else data = [];
        return new Response(JSON.stringify(data), {status:200,headers:{'Content-Type':'application/json'}});
      };
      window.WebSocket = class extends EventTarget { static CONNECTING=0; static OPEN=1; static CLOSED=3; readyState=0; send() {} close() { this.readyState=3; } };
    ` });
    await command('Page.navigate', { url: process.env.KEEP_ADMIN_SMOKE_URL });
    const waitFor = async (expression) => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(expression)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.fail(`Attente navigateur : ${expression}`);
    };
    await waitFor(`document.querySelectorAll('textarea').length === 2 && !document.body.innerText.includes('Vérification en cours')`);
    assert.equal(await evaluate(`document.body.innerText.includes('À tester')`), false);
    assert.equal(await evaluate(`document.querySelector('details').open`), false);
    await evaluate(`document.querySelector('details').open = true`);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).filter(b=>b.textContent==='📂 Choisir le fichier .p8').length`), 2);

    const pem = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    const drop = (key, name, content) => evaluate(`(() => {
      const input = document.getElementById(${JSON.stringify(`file-${key}`)});
      const transfer = new DataTransfer();
      transfer.items.add(new File([${JSON.stringify(content)}], ${JSON.stringify(name)}));
      input.closest('[style*="border-top"]').dispatchEvent(new DragEvent('drop', {bubbles:true,dataTransfer:transfer}));
    })()`);
    await drop('APPLE_MUSICKIT_PRIVATE_KEY', 'AuthKey_MWL46J72TM.p8', pem);
    await waitFor(`document.querySelector('input[aria-label="APPLE_MUSICKIT_KEY_ID"]').value==='MWL46J72TM'`);
    assert.equal(await evaluate(`document.querySelector('textarea[aria-label="APPLE_MUSICKIT_PRIVATE_KEY"]').value.includes('PRIVATE KEY')`), false);
    await evaluate(`(() => {
      const input=document.querySelector('input[aria-label="APPLE_MUSICKIT_KEY_ID"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'AAAAAAAAAA');
      input.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
    await waitFor(`document.body.innerText.includes('Clé ID différente du fichier')`);
    await drop('APPLE_MUSICKIT_PRIVATE_KEY', 'AuthKey_MWL46J72TM.p8', pem);
    await waitFor(`!document.body.innerText.includes('Clé ID différente du fichier')`);
    await evaluate(`document.getElementById('file-APPLE_MUSICKIT_PRIVATE_KEY').closest('[style*="border-top"]').querySelectorAll('button')[2].click()`);
    await waitFor(`window.__integrationCalls.some(call=>call.action==='integrations.set')`);
    assert.deepEqual(await evaluate(`(() => { const call=window.__integrationCalls.find(call=>call.action==='integrations.set'); return {key:call.key,keyId:call.keyId,fileName:call.fileName}; })()`), {
      key: 'APPLE_MUSICKIT_PRIVATE_KEY', keyId: 'MWL46J72TM', fileName: 'AuthKey_MWL46J72TM.p8',
    });
    await waitFor(`window.__integrationCalls.filter(call=>call.action==='integrations.test').length>=2 && !document.body.innerText.includes('Vérification en cours')`);
    await evaluate(`document.querySelector('details').open = true`);
    await drop('APPLE_IAP_PRIVATE_KEY', 'AuthKey_MWL46J72TM.p8', pem);
    await waitFor(`document.body.innerText.includes('Clé achat intégré requise')`);
    await drop('APPLE_IAP_PRIVATE_KEY', 'SubscriptionKey_MWL46J72TM.p8', pem);
    await waitFor(`document.querySelector('input[aria-label="APPLE_IAP_KEY_ID"]').value==='MWL46J72TM'`);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('textarea')).every(field => !field.value.includes('-----BEGIN'))`), true, 'Toutes les clés privées restent masquées');
    for (const width of [390, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 });
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `Pas de débordement à ${width}px`);
      if (process.env.KEEP_ADMIN_SMOKE_SCREENSHOTS) {
        const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        const screenshots = path.resolve('docs/screenshots');
        fs.mkdirSync(screenshots, { recursive: true });
        fs.writeFileSync(path.join(screenshots, `super-admin-keys-${width}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    if (ws?.readyState === WebSocket.OPEN) await command('Browser.close').catch(() => {});
    ws?.close();
    if (chrome.exitCode === null) chrome.kill();
    await chromeExited;
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
