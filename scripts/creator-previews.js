// 角色创建器的预览图：node scripts/creator-previews.js
//   docs/previews/creator.jpg              创建器界面（桌面 + 手机）
//   docs/previews/creator-presets.jpg      八个预设角色的全身（待机动作里的一帧）
//   docs/previews/creator-faces.jpg        八个预设角色的脸
//   docs/previews/creator-heritage.jpg     遗传：同一对父母，“长相”从像母亲拉到像父亲
//   docs/previews/creator-expressions.jpg  表情
//   docs/previews/creator-hair.jpg         头发（沿发丝的高光、自遮挡、染色）和帽子
//   docs/previews/creator-colors.jpg       衣服配色（同一套衣服换几种颜色）
//   docs/previews/creator-shoes.jpg        鞋的配色（鞋面、鞋底、袜子）
//   docs/previews/creator-motion.jpg       动作（Quaternius 的动作库换到 MakeHuman 的骨架上）
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
async function grid(files, cols, w, h, file, { gap = 0, bg = '#dedcd6', labels = null } = {}) {
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
  // 界面：桌面 1440×900（遗传）+ 手机 390×844（服装和配色）
  const [desk] = await shoot([['ui-desk', 'preset=3&tab=heritage&anim=idle&t=1.2']], [1440, 900]);
  const [phone] = await shoot([['ui-phone', 'preset=1&tab=outfit&anim=idle&t=0.6']], [390, 844]);
  {
    const d = await sharp(desk).resize(1440, 900).toBuffer();
    const p = await sharp(phone).resize(390, 844).toBuffer();
    await sharp({ create: { width: 1440 + 24 + 390, height: 900, channels: 3, background: '#cfcdc6' } })
      .composite([{ input: d, left: 0, top: 0 }, { input: p, left: 1440 + 24, top: 28 }])
      .jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(out, 'creator.jpg'));
  }
  const presets = [0, 1, 2, 3, 4, 5, 6, 7];
  // 全身图按同一个取景高度拍，高矮能直接比；放待机动作的一帧（不是 A 字静止姿势）
  const full = await shoot(presets.map((i) => [`full${i}`, `preset=${i}&bare=1&az=18&frameH=1.9&anim=idle&t=${0.4 + i * 0.17}`]), [420, 720]);
  await grid(full, 8, 300, 520, path.join(out, 'creator-presets.jpg'));
  const faces = await shoot(presets.map((i) => [`face${i}`, `preset=${i}&bare=1&cam=face&az=16&anim=idle&t=${0.4 + i * 0.17}`]), [520, 560]);
  await grid(faces, 4, 360, 388, path.join(out, 'creator-faces.jpg'), { gap: 4 });
  // 遗传：同一对父母，长相 0 → 1
  const her = [0, 0.25, 0.5, 0.75, 1];
  const hs = await shoot(her.map((t) => [`her-${t}`, `preset=0&bare=1&cam=face&az=12&mom=1&dad=2&shape=${t}&skin=${t}`]), [420, 460]);
  await grid(hs, 5, 300, 330, path.join(out, 'creator-heritage.jpg'), { labels: ['像母亲（苏菲）', '', '一半一半', '', '像父亲（科菲）'] });
  // 表情
  const ex = ['neutral', 'smile', 'laugh', 'surprise', 'angry', 'sad'];
  const es = await shoot(ex.map((e) => [`expr-${e}`, `preset=3&bare=1&cam=face&az=10&expr=${e}`]), [420, 460]);
  await grid(es, 6, 300, 330, path.join(out, 'creator-expressions.jpg'), { labels: ['平静', '微笑', '大笑', '惊讶', '生气', '难过'] });
  // 头发：几种发型、发色，最后一格戴礼帽
  const hair = [
    ['hair-long', 'preset=3&hair=long01&hc=100d0b&az=35', '长直发 · 黑'],
    ['hair-bob', 'preset=1&hair=bob02&hc=4a3020&az=30', '齐耳短发 · 棕'],
    ['hair-pony', 'preset=5&hair=ponytail01&hc=d8b47a&az=55', '马尾 · 金'],
    ['hair-short', 'preset=0&hair=short02&hc=2b1d14&az=30', '碎短发 · 深棕'],
    ['hair-braid', 'preset=7&hair=braid01&hc=8a5a33&az=150', '麻花辫（背面）'],
    ['hair-hat', 'preset=6&hair=short01&hat=fedora01&az=35', '戴礼帽'],
  ];
  const hh = await shoot(hair.map(([n, q]) => [n, `${q}&bare=1&cam=bust&anim=idle&t=0.5`]), [420, 460]);
  await grid(hh, 6, 300, 330, path.join(out, 'creator-hair.jpg'), { labels: hair.map((h) => h[2]) });
  // 衣服配色：同一个人、同一套衣服换几种颜色（第一格是原色）
  const col = [
    ['col-0', 'preset=0', '原色'],
    ['col-1', 'preset=0&oc=8c1d24,1a1a1a', '红 T 恤 · 黑牛仔裤'],
    ['col-2', 'preset=0&oc=1f2f52,c2a77d', '藏青 T 恤 · 卡其'],
    ['col-3', 'preset=0&oc=4b5a32,e8e4da', '橄榄绿 · 白牛仔裤'],
    ['col-4', 'preset=6', '原色（黑西装）'],
    ['col-5', 'preset=6&oc=22304a', '藏青西装'],
    ['col-6', 'preset=6&oc=c8b89a&hat=fedora01&hatc=6b4a32', '米色西装 · 棕礼帽'],
    ['col-7', 'preset=3&oc=,8c1d24', '红半裙'],
  ];
  const cs = await shoot(col.map(([n, q]) => [n, `${q}&bare=1&az=18&frameH=1.9&anim=idle&t=0.6`]), [420, 720]);
  await grid(cs, 8, 300, 520, path.join(out, 'creator-colors.jpg'), { labels: col.map((c) => c[2]) });
  // 鞋的配色：穿热裤的小满，袜子也看得见
  const shoe = [
    ['shoe-0', 'shoes=shoes05', '白色运动鞋 · 原色'],
    ['shoe-1', 'shoes=shoes05&sc=2b59c3,,1c1c1e', '蓝鞋面 · 黑袜子'],
    ['shoe-2', 'shoes=shoes06&sc=b0262c,,', '蓝色运动鞋换红色'],
    ['shoe-3', 'shoes=shoes02&sc=c9b38f,1c1c1e,f2f0eb', '旧运动鞋换米色'],
    ['shoe-4', 'shoes=shoes01', '棕色皮鞋 · 原色'],
    ['shoe-5', 'shoes=shoes01&sc=1f2a40,1c1c1e,b0262c', '藏青皮鞋 · 红袜子'],
    ['shoe-6', 'shoes=shoes03&sc=8e4a1e,c9a77d,f2f0eb', '黑皮鞋换焦糖色'],
    ['shoe-7', 'shoes=shoes04&sc=9a6a3c,,1f2f52', '黑休闲皮鞋换棕色'],
  ];
  const ss = await shoot(shoe.map(([n, q]) => [n, `preset=1&${q}&bare=1&cam=feet&az=25&el=16&anim=idle&t=0.5`]), [480, 420]);
  await grid(ss, 4, 360, 315, path.join(out, 'creator-shoes.jpg'), { labels: shoe.map((c) => c[2]) });
  // 动作
  const mo = [['walk', 0.35, '走路'], ['jog_fwd', 0.2, '慢跑'], ['dance', 0.4, '跳舞'], ['punch_cross', 0.45, '直拳'], ['crouch_idle', 0.8, '蹲下'], ['idle_talking', 1.4, '说话']];
  const ms = await shoot(mo.map(([a, t]) => [`mo-${a}`, `preset=5&bare=1&az=30&frameH=1.9&anim=${a}&t=${t}`]), [420, 720]);
  await grid(ms, 6, 300, 520, path.join(out, 'creator-motion.jpg'), { labels: mo.map((m) => m[2]) });
} finally {
  await browser.close();
  server.close();
}
