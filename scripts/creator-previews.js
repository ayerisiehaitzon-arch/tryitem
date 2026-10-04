// 角色创建器的预览图：node scripts/creator-previews.js
//   docs/previews/creator.jpg              创建器界面（桌面 + 手机）
//   docs/previews/creator-presets.jpg      八个预设角色的全身（待机动作里的一帧）
//   docs/previews/creator-faces.jpg        八个预设角色的脸
//   docs/previews/creator-heritage.jpg     遗传：同一对父母，“长相”从像母亲拉到像父亲
//   docs/previews/creator-expressions.jpg  表情
//   docs/previews/creator-hair.jpg         头发（沿发丝的高光、自遮挡、染色）和帽子
//   docs/previews/creator-hair2.jpg        发型（二）：社区资源包里的 22 款发型（有的换了发色、转到背面），最后两格戴帽子
//   docs/previews/creator-beards.jpg       胡子：社区资源包里的 6 款胡须、3 款小胡子（跟着发色染色），搭着用、大笑、侧面
//   docs/previews/creator-clothes.jpg      衣服款式：连衣裙、大衣，上衣和下装随意搭，雪地靴
//   docs/previews/creator-clothes-men.jpg  男装：几套男装拆成单件上衣、下装重新搭，工装背带裤
//   docs/previews/creator-clothes-men2.jpg 男装（二）：社区资源包里的卫衣、毛衣、Polo 衫、短裤、礼服、西装、鞋、帽子
//   docs/previews/creator-clothes-women2.jpg 女装（二）：旗袍、连衣裙、西装套装，上衣、半身裙、裤子随意搭，平底鞋、马靴、帽子
//   docs/previews/creator-colors.jpg       衣服配色（同一套衣服换几种颜色）
//   docs/previews/creator-shoes.jpg        鞋按部位换色（鞋面、鞋底、袜子）
//   docs/previews/creator-shoes2.jpg       鞋（二）：社区资源包里的 12 双鞋（孟克鞋、凉拖、训练鞋、网球鞋、骑行鞋、短靴，女款平底鞋、长靴）
//   docs/previews/creator-shoeways.jpg     鞋的配色方案（一点换整双）：球鞋、皮鞋和靴子、女款平底鞋和凉拖各几套，再加一排后来加的
//   docs/previews/creator-hats.jpg         帽子的款式和配色
//   docs/previews/creator-hats2.jpg        帽子（二）：社区资源包里的 12 顶帽子（棒球帽、平顶帽、圣诞帽、宽松毛线帽、高礼帽、厨师帽、迷彩帽、护耳帽、马术头盔、泳帽、皮飞行帽、女巫帽）
//   docs/previews/creator-motion.jpg       动作（Quaternius 的动作库换到 MakeHuman 的骨架上；走、跑的时候地上的格子往后滚；坐着、蹲下修理带着琴凳和工具箱）
//   docs/previews/creator-demos.jpg        动作演示（几段动作连着播）：走路跑步、蹲下站起、跳跃、捡箱子、坐下站起，各取几帧
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
  // 发型（二）：MakeHuman 社区资源包里的发型
  const hair2 = [
    ['h2-male02', 'preset=0&hair=male02&hc=2b1d14', '纹理短发'],
    ['h2-maxwell', 'preset=6&hair=maxwell', '刺猬头'],
    ['h2-grump', 'preset=4&hair=grump', '三七分'],
    ['h2-keylth', 'preset=6&hair=keylth&az=150', '半扎发（背面）'],
    ['h2-jungle', 'preset=0&hair=jungle', '中长碎发'],
    ['h2-cornrows', 'preset=4&hair=cornrows&az=50', '玉米辫'],
    ['h2-tousled', 'preset=3&hair=tousled&hc=100d0b', '蓬松长发 · 黑'],
    ['h2-adrienne', 'preset=7&hair=adrienne', '侧分长卷发'],
    ['h2-hazel', 'preset=5&hair=hazel&hc=c08a52', '长波浪 · 金棕'],
    ['h2-island', 'preset=1&hair=island&hc=100d0b', '公主头 · 黑'],
    ['h2-lara', 'preset=3&hair=lara&az=150', '长辫子（背面）'],
    ['h2-double', 'preset=7&hair=double_braid&az=150', '双麻花辫（背面）'],
    ['h2-blunt', 'preset=1&hair=blunt_bob&hc=100d0b', '齐刘海波波头 · 黑'],
    ['h2-curled', 'preset=3&hair=curled_bob', '内扣短发'],
    ['h2-inverted', 'preset=5&hair=inverted_bob&hc=d8b47a&az=60', '前长后短波波头 · 金'],
    ['h2-ashley', 'preset=7&hair=ashley', '羽毛剪'],
    ['h2-katherine', 'preset=1&hair=katherine&hc=c96f86', '斜刘海中长发 · 粉'],
    ['h2-daisy', 'preset=5&hair=daisy', '中长发'],
    ['h2-updo', 'preset=3&hair=updo50s&az=60', '复古盘发'],
    ['h2-braidbun', 'preset=1&hair=braid_bun&az=60', '编发丸子头'],
    ['h2-puffs', 'preset=5&hair=afro_puffs&hc=100d0b', '双丸子头'],
    ['h2-bun', 'preset=7&hair=bun&az=120', '发髻（背面）'],
    ['h2-hat1', 'preset=1&hair=island&hc=100d0b&hat=cloche', '公主头 + 钟形帽'],
    ['h2-hat2', 'preset=4&hair=cornrows&hat=newsboy', '玉米辫 + 报童帽'],
  ];
  const h2 = await shoot(hair2.map(([n, q]) => [n, `${q}${q.includes('az=') ? '' : '&az=30'}&bare=1&cam=bust&anim=idle&t=0.5`]), [420, 460]);
  await grid(h2, 6, 300, 330, path.join(out, 'creator-hair2.jpg'), { labels: hair2.map((h) => h[2]) });
  // 胡子：MakeHuman 社区资源包里的胡须、小胡子，颜色跟着头发
  const beards = [
    ['b-faun', 'preset=0&beardStyle=faun', '山羊胡'],
    ['b-scruffy', 'preset=6&beardStyle=scruffy', '蓬乱长须'],
    ['b-sigmund', 'preset=2&beardStyle=sigmund', '短络腮胡（老周）'],
    ['b-full', 'preset=4&beardStyle=full', '络腮胡（大力）'],
    ['b-viking', 'preset=6&beardStyle=viking&hc=d8b47a', '维京长须 · 金'],
    ['b-messy', 'preset=0&beardStyle=messy', '粗犷络腮胡'],
    ['b-dali', 'preset=6&moustache=dali&hc=100d0b', '达利胡 · 黑'],
    ['b-thin', 'preset=0&moustache=thin', '八字胡'],
    ['b-mviking', 'preset=2&moustache=viking&beardStyle=', '一字胡'],
    ['b-combo', 'preset=4&beardStyle=full&moustache=viking', '络腮胡 + 一字胡'],
    ['b-laugh', 'preset=6&beardStyle=sigmund&expr=laugh', '大笑时跟着嘴动'],
    ['b-side', 'preset=6&beardStyle=viking&hc=d8b47a&az=90', '维京长须（侧面）'],
  ];
  const bs = await shoot(beards.map(([n, q]) => [n, `${q}${q.includes('az=') ? '' : '&az=25'}&bare=1&cam=face&anim=idle&t=0.5`]), [420, 460]);
  await grid(bs, 6, 300, 330, path.join(out, 'creator-beards.jpg'), { labels: beards.map((h) => h[2]) });
  // 衣服款式：MakeHuman 社区的连衣裙、大衣、上衣、下装和雪地靴（上衣和下装可以随意搭）
  const wear = [
    ['wear-0', 'preset=3&outfit=dress_wine', '酒红连衣裙'],
    ['wear-1', 'preset=1&outfit=dress_mint', '薄荷绿背心裙'],
    ['wear-2', 'preset=5&outfit=dress_black&shoes=shoes03', '黑色小礼服'],
    ['wear-3', 'preset=7&outfit=tube_dress&shoes=shoes05', '白色抹胸裙'],
    ['wear-4', 'preset=3&outfit=coat&shoes=winter_boots', '毛领大衣 · 雪地靴'],
    ['wear-5', 'preset=7&top=tunic&bottom=tight_jeans&shoes=shoes05', '碎花长衫 · 紧身牛仔裤'],
    ['wear-6', 'preset=5&top=tank_top&bottom=jean_shorts', '运动背心 · 牛仔短裤'],
    ['wear-7', 'preset=1&top=sleeveless&bottom=jean_skirt', '无袖系带衬衫 · 牛仔短裙'],
    ['wear-8', 'preset=3&top=tube_top&bottom=miniskirt', '抹胸 · 黑色短裙'],
    ['wear-9', 'preset=7&top=vneck_top&bottom=tight_jeans&shoes=winter_boots', 'V 领背心 · 雪地靴'],
    ['wear-10', 'preset=1&top=cami&bottom=jean_shorts&tc=e3a7b4', '吊带衫（粉）· 牛仔短裤'],
    ['wear-11', 'preset=5&top=camo_tee&bottom=miniskirt', '迷彩短 T · 黑色短裙'],
  ];
  const ws = await shoot(wear.map(([n, q]) => [n, `${q}&bare=1&az=18&frameH=1.9&anim=idle&t=0.6`]), [420, 720]);
  await grid(ws, 6, 300, 520, path.join(out, 'creator-clothes.jpg'), { labels: wear.map((c) => c[2]) });
  // 男装：几套男装拆成单件的上衣、下装，再加工装背带裤
  const men = [
    ['men-0', 'preset=2', '衬衫 · 工装背带裤'],
    ['men-1', 'preset=0&outfit=male_worksuit01', '白 T 恤工装背带裤'],
    ['men-2', 'preset=6&top=m_suit_jacket&bottom=m_jeans', '西装外套 · 牛仔裤'],
    ['men-3', 'preset=4&top=m_jacket&bottom=m_suit_trousers&shoes=shoes02', '夹克 · 西裤'],
    ['men-4', 'preset=0&top=m_shirt_stripe&bottom=m_jeans_grey', '条纹衬衫 · 灰牛仔裤'],
    ['men-5', 'preset=4&top=tank_top&bottom=m_jeans&shoes=winter_boots', '运动背心 · 雪地靴'],
    ['men-6', 'preset=6&top=m_longsleeve&bottom=m_suit_trousers', '长袖 T 恤 · 西裤'],
    ['men-7', 'preset=0&top=m_tee_blue&bottom=m_overalls&bc=1d2a44', '蓝 T 恤 · 深蓝背带裤'],
  ];
  const mw = await shoot(men.map(([n, q]) => [n, `${q}&bare=1&az=18&frameH=1.95&anim=idle&t=0.6`]), [420, 720]);
  await grid(mw, 8, 300, 520, path.join(out, 'creator-clothes-men.jpg'), { labels: men.map((c) => c[2]) });
  // 男装（二）：MakeHuman 社区资源包里的男装、鞋、帽子；卫衣、毛衣、开衫男女都能穿（最后一排有两格女生）
  const men2 = [
    ['men2-0', 'preset=4', '连帽卫衣 · 休闲短裤 · 跑鞋'],
    ['men2-1', 'preset=0&top=sweater_grey&bottom=worn_jeans&shoes=chelsea&hat=beanie', '粗针毛衣 · 做旧牛仔裤 · 毛线帽'],
    ['men2-2', 'preset=2&top=polo&bottom=wool_pants&shoes=chelsea&hat=newsboy', '报童帽 · Polo 衫 · 羊毛西裤'],
    ['men2-3', 'preset=0&top=shirt_casual&bottom=board_shorts&shoes=slipons', '休闲衬衫 · 沙滩短裤 · 一脚蹬'],
    ['men2-4', 'preset=6&top=fisherman&bottom=cargo&shoes=biker_boots', '罗纹毛衣 · 工装裤 · 机车靴'],
    ['men2-5', 'preset=0&top=lusekofta&bottom=m_jeans&shoes=hightops', '挪威毛衣开衫 · 高帮球鞋'],
    ['men2-6', 'preset=6&outfit=dinner_jacket&shoes=oxford', '白色礼服 · 牛津鞋'],
    ['men2-7', 'preset=0&outfit=suit_navy&shoes=oxford', '藏青西装'],
    ['men2-8', 'preset=2&outfit=suit_db&shoes=chelsea&hat=', '双排扣西装 · 切尔西靴'],
    ['men2-9', 'preset=0&top=hoodie&bottom=cargo&shoes=hightops&tc=8c1d24&bc=c9b38f&sc=2b59c3', '换色：红卫衣 · 卡其工装裤'],
    ['men2-10', 'preset=1&top=hoodie&bottom=tight_jeans&shoes=hightops', '女生穿连帽卫衣'],
    ['men2-11', 'preset=3&top=lusekofta&bottom=miniskirt&shoes=winter_boots', '女生穿挪威毛衣开衫'],
  ];
  const mw2 = await shoot(men2.map(([n, q]) => [n, `${q}&bare=1&az=18&frameH=1.95&anim=idle&t=0.6`]), [420, 720]);
  await grid(mw2, 6, 300, 520, path.join(out, 'creator-clothes-men2.jpg'), { labels: men2.map((c) => c[2]) });
  // 女装（二）：MakeHuman 社区资源包里的连衣裙、旗袍、套装，女装拆出来的单件和新的上衣、半身裙、裤子随意搭
  const women2 = [
    ['women2-0', 'preset=7', '旗袍 · 芭蕾平底鞋'],
    ['women2-1', 'preset=3&outfit=camisole_dress&shoes=mary_janes&hat=cloche', '碎花吊带裙 · 钟形帽'],
    ['women2-2', 'preset=1&outfit=tiered_dress&shoes=ballet_flats', '挂脖蛋糕裙'],
    ['women2-3', 'preset=5&outfit=red_halter&shoes=mary_janes', '红色挂脖裙'],
    ['women2-4', 'preset=3&outfit=evening_gown&shoes=ballet_flats', '晚礼服长裙'],
    ['women2-5', 'preset=1&outfit=f_suit_skirt&shoes=mary_janes', '黑色西装套裙'],
    ['women2-6', 'preset=5&outfit=f_suit_db&shoes=chelsea', '灰色双排扣套装'],
    ['women2-7', 'preset=7&outfit=tweed_dress&shoes=riding_boots', '格纹连衣裙 · 马靴'],
    ['women2-8', 'preset=1&top=off_shoulder&bottom=pleated_plaid&shoes=mary_janes', '露肩上衣 · 蓝格子百褶裙'],
    ['women2-9', 'preset=3&top=retro_top&bottom=polka_skirt&shoes=ballet_flats', '复古上衣 · 波点裙'],
    ['women2-10', 'preset=5&top=breton&bottom=bootcut&shoes=ankle_boots_f', '条纹短上衣 · 喇叭牛仔裤'],
    ['women2-11', 'preset=7&top=lace_blouse&bottom=long_skirt&shoes=ballet_flats&hat=bowler', '系带衬衫 · 碎花长裙'],
  ];
  const ww2 = await shoot(women2.map(([n, q]) => [n, `${q}&bare=1&az=18&frameH=1.85&anim=idle&t=0.6`]), [420, 720]);
  await grid(ww2, 6, 300, 520, path.join(out, 'creator-clothes-women2.jpg'), { labels: women2.map((c) => c[2]) });
  // 衣服配色：同一个人、同一套衣服换几种颜色（第一格是原色）
  const col = [
    ['col-0', 'preset=0', '原色'],
    ['col-1', 'preset=0&oc=8c1d24,1a1a1a', '红 T 恤 · 黑牛仔裤'],
    ['col-2', 'preset=0&oc=1f2f52,c2a77d', '藏青 T 恤 · 卡其'],
    ['col-3', 'preset=3&outfit=coat&oc=8a2030', '红大衣（毛边不换色）'],
    ['col-4', 'preset=6', '原色（黑西装）'],
    ['col-5', 'preset=6&oc=22304a', '藏青西装'],
    ['col-6', 'preset=6&oc=c8b89a&hat=fedora01&hatc=6b4a32', '米色西装 · 棕礼帽'],
    ['col-7', 'preset=3&outfit=female_elegantsuit01&oc=,8c1d24', '红半裙'],
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
  // 鞋（二）：资源包里后来补的鞋（男女都能穿的放在短裤、热裤底下，女款配裙子；长靴的镜头按靴筒高度自己往上拉）
  const shoe2 = [
    ['shoe2-0', 'preset=4&shoes=monk', '孟克鞋'],
    ['shoe2-1', 'preset=4&shoes=flip_flops', '凉拖'],
    ['shoe2-2', 'preset=1&shoes=kill_bill', '复古训练鞋'],
    ['shoe2-3', 'preset=4&shoes=tennis', '网球鞋'],
    ['shoe2-4', 'preset=5&shoes=cycling', '骑行鞋'],
    ['shoe2-5', 'preset=1&shoes=medieval', '翻边短靴'],
    ['shoe2-6', 'preset=1&shoes=t_bar', 'T 字带鞋'],
    ['shoe2-7', 'preset=7&shoes=flats_bow', '蝴蝶结芭蕾鞋'],
    ['shoe2-8', 'preset=3&shoes=two_tone', '拼色平底鞋'],
    ['shoe2-9', 'preset=1&shoes=woven', '编织平底鞋'],
    ['shoe2-10', 'preset=1&shoes=overknee', '过膝长靴'],
    ['shoe2-11', 'preset=3&shoes=calf_boots&sc=6b4a32,', '中筒靴 · 换成棕色'],
  ];
  const ss2 = await shoot(shoe2.map(([n, q]) => [n, `${q}&bare=1&cam=feet&az=25&el=16&anim=idle&t=0.5`]), [480, 420]);
  await grid(ss2, 4, 360, 315, path.join(out, 'creator-shoes2.jpg'), { labels: shoe2.map((c) => c[2]) });
  // 鞋的配色方案：页面上一点就把鞋面、鞋底、袜子一起换掉；sc 就是那套方案的三个颜色（creator.html 的 SHOE_WAYS）。
  // 一排球鞋（小满的热裤），一排皮鞋和靴子（大力的短裤），一排女鞋和凉拖，最后一排是后来加的几套
  const way = [
    ['way-0', 'preset=1&shoes=shoes05', '白色运动鞋 · 原色'],
    ['way-1', 'preset=1&shoes=shoes05&sc=1c1c1e,f2f0eb,f2f0eb', '白色运动鞋 · 黑白'],
    ['way-2', 'preset=1&shoes=shoes05&sc=b0262c,f2f0eb,f2f0eb', '白色运动鞋 · 大学红'],
    ['way-3', 'preset=1&shoes=shoes05&sc=c9b38f,a8743c,f2f0eb', '白色运动鞋 · 沙色生胶底'],
    ['way-4', 'preset=1&shoes=kill_bill&sc=1f2f52,f2f0eb', '复古训练鞋 · 藏青'],
    ['way-5', 'preset=1&shoes=hightops&sc=f2f0eb,f2f0eb', '高帮球鞋 · 纯白'],
    ['way-6', 'preset=4&shoes=shoes01', '棕色皮鞋 · 原色'],
    ['way-7', 'preset=4&shoes=shoes01&sc=151515,1c1c1e,1c1c1e', '棕色皮鞋 · 黑色'],
    ['way-8', 'preset=4&shoes=shoes01&sc=4a1a1c,1c1c1e,1c1c1e', '棕色皮鞋 · 酒红'],
    ['way-9', 'preset=4&shoes=oxford&sc=9a6a3c,3b2418,1f2f52', '牛津鞋 · 焦糖'],
    ['way-10', 'preset=4&shoes=chelsea&sc=c9b38f,a8743c', '切尔西靴 · 沙色'],
    ['way-11', 'preset=4&shoes=biker_boots&sc=3b2418,3b2418', '机车靴 · 深棕'],
    ['way-12', 'preset=1&shoes=ballet_flats&sc=d9b8a0', '芭蕾平底鞋 · 裸色'],
    ['way-13', 'preset=1&shoes=mary_janes&sc=b0262c,1c1c1e', '玛丽珍鞋 · 正红'],
    ['way-14', 'preset=1&shoes=flats_bow&sc=ece8e0', '蝴蝶结芭蕾鞋 · 奶白'],
    ['way-15', 'preset=3&shoes=riding_boots&sc=3b2418,3b2418', '马靴 · 深棕'],
    ['way-16', 'preset=3&shoes=calf_boots&sc=9a6a3c,3b2418', '中筒靴 · 焦糖'],
    ['way-17', 'preset=4&shoes=flip_flops&sc=d9682b', '凉拖 · 橙色'],
    ['way-18', 'preset=1&shoes=shoes05&sc=1c1c1e,b0262c,1c1c1e', '白色运动鞋 · 黑红'],
    ['way-19', 'preset=1&shoes=kill_bill&sc=8fb7d9,f2f0eb', '复古训练鞋 · 天蓝'],
    ['way-20', 'preset=4&shoes=shoes01&sc=151515,c9a77d,1c1c1e', '棕色皮鞋 · 黑面浅底'],
    ['way-21', 'preset=4&shoes=biker_boots&sc=b5843f,3b2418', '机车靴 · 小麦色'],
    ['way-22', 'preset=1&shoes=mary_janes&sc=a8d5c2,c9a77d', '玛丽珍鞋 · 薄荷绿'],
    ['way-23', 'preset=1&shoes=ballet_flats&sc=a99ad0', '芭蕾平底鞋 · 薰衣草'],
  ];
  const sw = await shoot(way.map(([n, q]) => [n, `${q}&bare=1&cam=feet&az=25&el=16&anim=idle&t=0.5`]), [400, 380]);
  await grid(sw, 6, 300, 285, path.join(out, 'creator-shoeways.jpg'), { labels: way.map((c) => c[2]) });
  // 帽子：四种款式，再换几个颜色、几种发型
  const hat = [
    ['hat-0', 'preset=6&hat=fedora01', '礼帽'],
    ['hat-1', 'preset=6&hat=fedora01_cocked&hatc=22304a', '歪戴礼帽 · 藏青'],
    ['hat-2', 'preset=2', '渔夫帽 · 卡其'],
    ['hat-3', 'preset=0&hat=fishing_hat', '渔夫帽 · 原色'],
    ['hat-4', 'preset=1&hat=pith_helmet', '探险帽'],
    ['hat-5', 'preset=4&hat=pith_helmet&hatc=ece8e0', '探险帽 · 白'],
    ['hat-6', 'preset=5&hat=fishing_hat&hatc=d9682b&az=140', '马尾 + 渔夫帽（背面）'],
    ['hat-7', 'preset=3&hat=fedora01_cocked&hatc=4a1f26', '长发 + 歪戴礼帽'],
  ];
  const hs2 = await shoot(hat.map(([n, q]) => [n, `${q}&bare=1&cam=bust${q.includes('az=') ? '' : '&az=30'}&anim=idle&t=0.5`]), [420, 460]);
  await grid(hs2, 4, 300, 330, path.join(out, 'creator-hats.jpg'), { labels: hat.map((h) => h[2]) });
  // 帽子（二）：资源包里后来补的帽子，各戴在一位预设角色头上（帽子里的头发压进去，帽檐下面露出来），再换两个颜色、转两个背面
  const hat2 = [
    ['hat2-0', 'preset=4&hat=baseball_cap', '棒球帽'],
    ['hat2-1', 'preset=0&hat=baseball_cap&hatc=22304a', '棒球帽 · 藏青'],
    ['hat2-2', 'preset=2&hat=flat_cap', '平顶帽'],
    ['hat2-3', 'preset=6&hat=flat_cap&hatc=6b4a32', '平顶帽 · 棕'],
    ['hat2-4', 'preset=0&hat=slouchy_beanie', '宽松毛线帽'],
    ['hat2-5', 'preset=1&hat=santa_hat', '圣诞帽'],
    ['hat2-6', 'preset=6&hat=top_hat', '高礼帽'],
    ['hat2-7', 'preset=4&hat=chef_hat', '厨师帽'],
    ['hat2-8', 'preset=5&hat=patrol_cap', '迷彩帽'],
    ['hat2-9', 'preset=5&hat=patrol_cap&az=150', '马尾 + 迷彩帽（背面）'],
    ['hat2-10', 'preset=7&hat=sherpa_hat', '护耳帽'],
    ['hat2-11', 'preset=3&hat=riding_helmet', '马术头盔'],
    ['hat2-12', 'preset=1&hat=swim_cap', '泳帽'],
    ['hat2-13', 'preset=0&hat=leather_helmet', '皮飞行帽'],
    ['hat2-14', 'preset=3&hat=witch_hat', '女巫帽'],
    ['hat2-15', 'preset=3&hat=witch_hat&az=160', '女巫帽（背面）'],
  ];
  const hs3 = await shoot(hat2.map(([n, q]) => [n, `${q}&bare=1&cam=bust${q.includes('az=') ? '' : '&az=30'}&anim=idle&t=0.5`]), [420, 460]);
  await grid(hs3, 4, 300, 330, path.join(out, 'creator-hats2.jpg'), { labels: hat2.map((h) => h[2]) });
  // 动作（坐着、蹲下修理带着道具：琴凳、工具箱）
  // 第四项是这一格的视角（工具箱在人面前：正侧面看过去箱子和人一样远，不会比人的脚还低、被画面底边切掉）
  const mo = [['walk', 0.35, '走路'], ['jog_fwd', 0.2, '慢跑'], ['dance', 0.4, '跳舞'], ['punch_cross', 0.45, '直拳'], ['crouch_idle', 0.8, '蹲下'], ['idle_talking', 1.4, '说话'], ['sitting_idle', 0.6, '坐着（琴凳）'], ['fixing_kneeling', 0.6, '蹲下修理（工具箱）', 90]];
  const ms = await shoot(mo.map(([a, t, , az = 30]) => [`mo-${a}`, `preset=5&bare=1&az=${az}&frameH=1.9&anim=${a}&t=${t}`]), [420, 720]);
  await grid(ms, 8, 300, 520, path.join(out, 'creator-motion.jpg'), { labels: mo.map((m) => m[2]) });
  // 动作演示“全套”里的几帧（第一项是演示的第几秒）；演示的镜头上面留出跳起来的高度，左右放得下纸箱和琴凳
  const dm = [[3, '走路'], [6.5, '慢跑'], [9, '冲刺'], [17.6, '蹲下'], [19.3, '蹲着走'], [25.1, '起跳'], [25.66, '腾空'],
    [26.1, '落地'], [30.72, '弯腰抓住箱子'], [32.42, '抱起来'], [34.02, '跪下放回去'], [38.8, '坐下'], [40.31, '坐着聊天'], [42.7, '站起来']];
  const ds = await shoot(dm.map(([t]) => [`demo-${t}`, `preset=4&bare=1&cam=demo&az=20&anim=demo_all&t=${t}`]), [360, 480]);
  await grid(ds, 7, 300, 400, path.join(out, 'creator-demos.jpg'), { labels: dm.map((d) => d[1]) });
} finally {
  await browser.close();
  server.close();
}
