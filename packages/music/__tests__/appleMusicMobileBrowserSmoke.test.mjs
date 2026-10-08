import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

test("export mobile : rendu Chromium desktop/Android et recharge sans page blanche", {
  skip: !process.env.KEEP_MOBILE_TOKEN_SMOKE_URL,
  timeout: 60000,
}, async () => {
  const profile = resolve("packages/mobile/.browser-token-smoke");
  mkdirSync(profile, { recursive: true });
  const chrome = spawn(process.env.CHROME_BIN || "google-chrome", [
    "--headless", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9226",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  const exited = new Promise((resolveExit) => chrome.once("exit", resolveExit));
  let socket;
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  const errors = [];
  const command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve: resolveCommand, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  try {
    let targets;
    for (let i = 0; i < 200; i++) {
      try {
        targets = await (await fetch("http://127.0.0.1:9226/json")).json();
        break;
      } catch {}
      await new Promise((wait) => setTimeout(wait, 100));
    }
    assert.ok(targets, "Chrome doit démarrer");
    socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
    await new Promise((open) => socket.addEventListener("open", open, { once: true }));
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
      if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push("console.error");
    });
    await command("Runtime.enable");
    await command("Page.enable");
    const evaluate = async (expression) => {
      const response = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      assert.ok(!response.exceptionDetails, response.exceptionDetails?.text);
      return response.result.value;
    };
    const waitForRender = async () => {
      for (let i = 0; i < 150; i++) {
        if (await evaluate("Boolean(document.getElementById('root')?.textContent.trim().length > 40)")) return;
        await new Promise((wait) => setTimeout(wait, 100));
      }
      const body = await evaluate("document.body.innerText.slice(0, 500)");
      assert.fail(`React doit afficher une interface non vide : ${JSON.stringify({ body, exceptions, errors })}`);
    };
    for (const viewport of [
      { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    ]) {
      await command("Emulation.setDeviceMetricsOverride", viewport);
      if (viewport.mobile) await command("Emulation.setUserAgentOverride", {
        userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      });
      await command("Page.navigate", { url: process.env.KEEP_MOBILE_TOKEN_SMOKE_URL });
      await waitForRender();
      await command("Page.reload", { ignoreCache: true });
      await waitForRender();
      assert.deepEqual(exceptions, [], `aucune exception JavaScript à ${viewport.width}px`);
      assert.deepEqual(errors, [], `aucune erreur console à ${viewport.width}px`);
    }
  } finally {
    socket?.close();
    chrome.kill("SIGTERM");
    await Promise.race([exited, new Promise((wait) => setTimeout(wait, 3000))]);
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
});
