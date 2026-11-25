// Local visual acceptance check. Start `PORT=3101 npm run dev` first.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.env.PREVIEW_URL || 'http://localhost:3101';
const profile = await mkdtemp(join(tmpdir(), 'hbh-phase1-qa-'));
const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
let nextId = 0;
const pending = new Map();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let port;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(250); }
  }
  if (!port) throw new Error('Chrome debugging port did not open');
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: 'PUT' }).then((r) => r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('hbh-consent', JSON.stringify({ value: 'denied', at: Date.now(), replay: true }));` });
  for (const width of [320, 360, 390, 430, 768, 981, 1024, 1100, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 980 });
    await send('Page.navigate', { url: base });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await send('Runtime.evaluate', { expression: 'document.readyState === "complete"', returnByValue: true });
      if (result.result.value) { ready = true; break; }
      await pause(250);
    }
    if (!ready) throw new Error(`Page load timed out at ${width}px`);
    const metrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const box = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, headline: box('.hero h1'), trust: box('.hero-trust'), form: box('#lead-form'), mobileBar: box('.mobile-bar'), honeypotLeft: getComputedStyle(document.querySelector('.hp')).left, actions: [...document.querySelectorAll('.hero-actions a')].map(a => a.textContent.trim()) };
      })()`, returnByValue: true,
    });
    const value = metrics.result.value;
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const shot = join(profile, `home-${width}.png`);
    await writeFile(shot, Buffer.from(screenshot.data, 'base64'));
    console.log(JSON.stringify({ ...value, screenshot: shot }));
    if (value.scrollWidth > width) throw new Error(`Horizontal overflow at ${width}px`);
    if (Number.parseInt(value.honeypotLeft, 10) >= 0) throw new Error(`Honeypot visible at ${width}px`);
    if (width < 980 && value.mobileBar?.top < 700) throw new Error(`Unexpected sticky bar placement at ${width}px`);
    if (width < 980 && value.form?.top >= value.mobileBar?.top) throw new Error(`Form start is hidden behind the sticky bar at ${width}px`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: base });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await send('Runtime.evaluate', { expression: 'document.readyState === "complete" && !!document.querySelector("[data-lead-form]")', returnByValue: true });
    if (ready.result.value) break;
    await pause(250);
  }
  const flow = await send('Runtime.evaluate', {
    expression: `(() => {
      const form = document.querySelector('[data-lead-form]');
      const steps = [...form.querySelectorAll('.fstep')];
      steps[0].querySelector('[data-next]').click();
      const emptyAddressRejected = !steps[0].hidden && form.querySelector('.form-status').classList.contains('error');
      form.elements.street.value = '123 Example St';
      form.elements.city.value = 'Bakersfield';
      form.elements.zip.value = '93301';
      steps[0].querySelector('[data-next]').click();
      const situationVisible = !steps[1].hidden;
      form.querySelector('[name=situation][value="Inherited / Probate"]').checked = true;
      form.elements.timeline.value = 'Within 30 days';
      steps[1].querySelector('[data-next]').click();
      const contactVisible = !steps[2].hidden;
      const textDefault = form.querySelector('[name=contact_pref][value=Text]').checked;
      const honeypotOffscreen = Number.parseInt(getComputedStyle(form.querySelector('.hp')).left, 10) < 0;
      steps[2].querySelector('[data-back]').click();
      return { emptyAddressRejected, situationVisible, contactVisible, textDefault, honeypotOffscreen, situationPreserved: form.querySelector('[name=situation][value="Inherited / Probate"]').checked, timelinePreserved: form.elements.timeline.value === 'Within 30 days' };
    })()`, returnByValue: true,
  });
  console.log(JSON.stringify({ formFlow: flow.result.value }));
  if (Object.values(flow.result.value).some((ok) => ok !== true)) throw new Error('Progressive form flow failed');
} finally {
  socket?.close();
  child.kill();
  // Keep screenshots for visual inspection, then remove the unique temp folder manually.
  console.log(`QA screenshots: ${profile}`);
}
