// 角色创建器的预览图：node scripts/creator-previews.js
//   docs/previews/creator.jpg          创建器界面（桌面 + 手机）
//   docs/previews/creator-presets.jpg  八个预设角色的全身
//   docs/previews/creator-faces.jpg    八个预设角色的脸
//   docs/previews/creator-poses.jpg    六个姿势
//   docs/previews/creator-sliders.jpg  同一个人拉不同的滑杆（性别特征、胖瘦、肌肉、脸型、五官）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { serve } from './serve.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'previews');
const tmp = path.join(root, '.cache', 'creator-shots');
await fs.mkdir(out, { recursive: true });
await fs.mkdir(tmp, { recursive: true });

const server = await serve(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const SS = 2;

async function shoot(list, size) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: SS });
  await page.route('https://cdn.jsdelivr.net/npm/three@*/**', async (route) => {
    const u = new URL(route.request().url());
    const rel = u.pathname.replace(/^\/npm\/three@[^/]+\//, '');
    await route.fulfill({ body: await fs.readFile(path.join(root, 'node_modules', 'three', rel)), contentType: 'text/javascript' });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  const files = [];
  for (const [name, q] of list) {
    await page.goto(`http://localhost:${port}/viewer/creator.html?shot=1&pr=${SS}&${q}`, { timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
    const file = path.join(tmp, `${name}.png`);
    await sharp(await page.screenshot()).resize(size[0], size[1], { kernel: 'lanczos3' }).png().toFile(file);
    files.push(file);
    console.log(file);
  }
  await page.close();
  return files;
}

// 拼图：cols 列，每格 w × h，格子之间留 gap；有标题时每格上面多一条 40px 的标题栏（不压在人身上）
async function grid(files, cols, w, h, file, { gap = 0, bg = '#e3e2dd', labels = null } = {}) {
  const rows = Math.ceil(files.length / cols);
  const lh = labels ? 40 : 0, th = h + lh;
  const W = cols * w + (cols - 1) * gap, H = rows * th + (rows - 1) * gap;
  const parts = await Promise.all(files.map(async (f, i) => ({
    input: await sharp(f).resize(w, h, { fit: 'cover' }).toBuffer(),
    left: (i % cols) * (w + gap), top: Math.floor(i / cols) * (th + gap) + lh,
  })));
  if (labels) {
    labels.forEach((t, i) => {
      if (!t) return;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40"><text x="16" y="30" font-family="Noto Sans CJK SC, PingFang SC, sans-serif" font-size="20" fill="#3a3d40">${t}</text></svg>`;
      parts.push({ input: Buffer.from(svg), left: (i % cols) * (w + gap), top: Math.floor(i / cols) * (th + gap) });
    });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(parts).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  console.log(file, W, H);
}

try {
  // 界面：桌面 1440×900 + 手机 390×844
  const [desk] = await shoot([['ui-desk', 'preset=1&tab=feature&feat=eyes&cam=bust']], [1440, 900]);
  const [phone] = await shoot([['ui-phone', 'preset=4&tab=body']], [390, 844]);
  {
    const d = await sharp(desk).resize(1440, 900).toBuffer();
    const p = await sharp(phone).resize(390, 844).toBuffer();
    await sharp({ create: { width: 1440 + 24 + 390, height: 900, channels: 3, background: '#cfcdc6' } })
      .composite([{ input: d, left: 0, top: 0 }, { input: p, left: 1440 + 24, top: 28 }])
      .jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(out, 'creator.jpg'));
  }
  const presets = [0, 1, 2, 3, 4, 5, 6, 7];
  // 全身图按同一个取景高度拍，高矮能直接比
  const full = await shoot(presets.map((i) => [`full${i}`, `preset=${i}&bare=1&az=20&frameH=1.86`]), [420, 720]);
  await grid(full, 8, 300, 520, path.join(out, 'creator-presets.jpg'));
  const faces = await shoot(presets.map((i) => [`face${i}`, `preset=${i}&bare=1&cam=face&az=18`]), [520, 560]);
  await grid(faces, 4, 360, 388, path.join(out, 'creator-faces.jpg'), { gap: 4 });
  const poses = ['stand', 'relaxed', 'hips', 'pockets', 'wave', 'think'];
  const ps = await shoot(poses.map((p) => [`pose-${p}`, `preset=6&bare=1&pose=${p}&az=24`]), [420, 720]);
  await grid(ps, 6, 300, 520, path.join(out, 'creator-poses.jpg'), { labels: ['站立', '稍息', '叉腰', '插兜', '打招呼', '托腮'] });
  // 同一个人，拉不同的滑杆
  const sl = [
    ['s-base', 'preset=0&bare=1&az=20&frameH=1.98'],
    ['s-fem', 'preset=0&bare=1&az=20&frameH=1.98&sex=1'],
    ['s-fat', 'preset=0&bare=1&az=20&frameH=1.98&weight=1'],
    ['s-thin', 'preset=0&bare=1&az=20&frameH=1.98&weight=-1'],
    ['s-mus', 'preset=0&bare=1&az=20&frameH=1.98&muscle=1&shoulders=1'],
    ['s-tall', 'preset=0&bare=1&az=20&frameH=1.98&height=196&legs=1'],
  ];
  const sls = await shoot(sl, [420, 720]);
  await grid(sls, 6, 300, 520, path.join(out, 'creator-sliders.jpg'), { labels: ['默认', '性别特征 → 女性', '胖瘦 → 胖', '胖瘦 → 瘦', '肌肉、肩宽', '身高 196、腿长'] });
} finally {
  await browser.close();
  server.close();
}
