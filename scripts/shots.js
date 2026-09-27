// 截图：node scripts/shots.js [--out 目录] [--views a,b] [--size 1200x800] [item ...]
// 用本地 three（node_modules）替换 CDN，字体请求直接放弃，便于离线运行。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { serve } from './serve.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 预设视角（也可以直接传查询串，如 "&az=90&el=10"；多个参数值里用 : 分隔坐标）
export const VIEWS = {
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

export async function shoot({ items, views = ['hero'], size = [1200, 800], outDir, name = (id, v) => `${id}_${v}.png` }) {
  await fs.mkdir(outDir, { recursive: true });
  const server = await serve(0);
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // 2 倍超采样：页面按 2 倍像素渲染（预览器截图模式不开 MSAA），截图再缩小到目标尺寸
  const SS = 2;
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: SS });
  await page.route('https://cdn.jsdelivr.net/npm/three@*/**', async (route) => {
    const u = new URL(route.request().url());
    const rel = u.pathname.replace(/^\/npm\/three@[^/]+\//, '');
    const body = await fs.readFile(path.join(root, 'node_modules', 'three', rel));
    await route.fulfill({ body, contentType: 'text/javascript' });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  const files = [];
  try {
    for (const id of items) {
      for (const v of views) {
        await page.goto(`http://localhost:${port}/viewer/?shot=1&pr=${SS}&item=${id}${VIEWS[v] ?? v}`);
        await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
        const file = path.join(outDir, name(id, v));
        const png = await page.screenshot();
        await sharp(png).resize(size[0], size[1], { kernel: 'lanczos3' }).png().toFile(file);
        files.push(file);
        console.log(file);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : def; };
  const outDir = path.resolve(opt('--out', path.join(root, 'docs', 'shots')));
  const views = opt('--views', 'hero').split(',');
  const size = opt('--size', '1200x800').split('x').map(Number);
  const only = args.filter((a) => !a.startsWith('--'));
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'models', 'manifest.json'), 'utf8'));
  const items = manifest.items.map((i) => i.id).filter((id) => !only.length || only.includes(id));
  if (only.includes('room')) items.push('room');
  await shoot({ items, views, size, outDir });
}
