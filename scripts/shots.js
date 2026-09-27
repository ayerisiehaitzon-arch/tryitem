// 截图：node scripts/shots.js [--out 目录] [--views a,b] [item ...]
// 用本地 three（node_modules）替换 CDN，字体请求直接放弃，便于离线运行。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : def; };
const outDir = path.resolve(opt('--out', path.join(root, 'docs', 'shots')));
const views = opt('--views', 'hero').split(',');
const size = opt('--size', '1200x800').split('x').map(Number);
const only = args.filter((a) => !a.startsWith('--'));

const VIEWS = {
  hero: '',
  wire: '&wire=1',
  flat: '&flat=1',
  noao: '&ao=0',
  lod1: '&lod=1&wire=1',
  lod2: '&lod=2&wire=1',
  top: '&el=62&az=20',
  low: '&el=4&az=30&dist=0.9',
  back: '&az=200&el=20',
  side: '&az=90&el=10',
  close: '&dist=0.55&el=24',
  rt: '&shadow=realtime',
};

await fs.mkdir(outDir, { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'models', 'manifest.json'), 'utf8'));
const items = manifest.items.map((i) => i.id).filter((id) => !only.length || only.includes(id));
const server = await serve(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
await page.route('https://cdn.jsdelivr.net/npm/three@*/**', async (route) => {
  const u = new URL(route.request().url());
  const rel = u.pathname.replace(/^\/npm\/three@[^/]+\//, '');
  const body = await fs.readFile(path.join(root, 'node_modules', 'three', rel));
  await route.fulfill({ body, contentType: 'text/javascript' });
});
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });

for (const id of items) {
  for (const v of views) {
    await page.goto(`http://localhost:${port}/viewer/?shot=1&item=${id}${VIEWS[v] ?? v}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    const file = path.join(outDir, `${id}_${v}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
}
await browser.close();
server.close();
