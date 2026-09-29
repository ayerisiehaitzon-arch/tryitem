// 游戏室的程序化贴图：游戏室图集（街机屏幕 / 顶灯箱 / 侧板画 / 控制面板 / 投币门、桌上足球的场地、台球的展开图、纯色格子）。
import { perlin, fbm, mulberry } from './noise.js';
import { GAME_ATLAS } from './atlas.js';
import { sdRoundRect, sdSeg, sdPoly } from './laundry-textures.js';
import { text, textWidth, GLYPHS } from './gym-textures.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const fract = (x) => x - Math.floor(x);

function alloc(S) {
  return {
    color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S),
    metal: new Float32Array(S * S), emit: new Float32Array(S * S * 3),
  };
}
function put(out, i, c, h, r, m = 0, e = null) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h; out.rough[i] = r; out.metal[i] = m;
  if (e) { out.emit[i * 3] = e[0]; out.emit[i * 3 + 1] = e[1]; out.emit[i * 3 + 2] = e[2]; }
}
// 一块区域逐像素：f(u, v) → [color, height, rough, metal?, emit?]
function region(out, S, box, marginPx, f) {
  const [x0, y0, x1, y1] = box, W = x1 - x0 - 2 * marginPx, H = y1 - y0 - 2 * marginPx;
  for (let y = y0; y < y1; y++) {
    const v = (y + 0.5 - y0 - marginPx) / H;
    for (let x = x0; x < x1; x++) {
      const u = (x + 0.5 - x0 - marginPx) / W;
      const [c, h, r, m, e] = f(u, v);
      put(out, y * S + x, c, h, r, m ?? 0, e ?? null);
    }
  }
}
// 按米作画的 SDF 画笔（和洗衣房的 painter 一样），颜色 / 自发光可以是 (x, y) 的函数（渐变字）
function gp(out, S, box, W, H) {
  const [bx0, by0, bx1, by1] = box;
  const sx = (bx1 - bx0) / W, sy = (by1 - by0) / H, px = 1 / Math.min(sx, sy);
  const val = (v, x, y) => (typeof v === 'function' ? v(x, y) : v);
  const fill = (sdf, bb, { color = null, emit = null, rough = null, height = null, metal = null, alpha = 1 } = {}) => {
    const i0 = Math.max(bx0, Math.floor(bx0 + (bb[0] - px) * sx)), i1 = Math.min(bx1 - 1, Math.ceil(bx0 + (bb[2] + px) * sx));
    const j0 = Math.max(by0, Math.floor(by0 + (bb[1] - px) * sy)), j1 = Math.min(by1 - 1, Math.ceil(by0 + (bb[3] + px) * sy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5 - bx0) / sx, y = (j + 0.5 - by0) / sy;
      const a = clamp01(0.5 - sdf(x, y) / px) * alpha;
      if (a <= 0) continue;
      const k = j * S + i;
      const c = val(color, x, y), e = val(emit, x, y);
      if (c) for (let q = 0; q < 3; q++) out.color[k * 3 + q] = mix(out.color[k * 3 + q], c[q], a);
      if (e) for (let q = 0; q < 3; q++) out.emit[k * 3 + q] = mix(out.emit[k * 3 + q], e[q], a);
      if (rough !== null) out.rough[k] = mix(out.rough[k], rough, a);
      if (height !== null) out.height[k] = mix(out.height[k], height, a);
      if (metal !== null) out.metal[k] = mix(out.metal[k], metal, a);
    }
  };
  return { fill, px };
}
const inset = (box, m) => [box[0] + m, box[1] + m, box[2] - m, box[3] - m];

// ——————————————————————— 像素游戏 ———————————————————————
// 5 × 7 的点阵字（街机屏幕上的分数）
const PIX = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
// 精灵（每个字符一种颜色，. 透明）
const SPR = {
  // 黄色的工蜂：蓝翅膀、红眼睛
  drone: ['..B.....B..', '...B...B...', '..YYYYYYY..', '.YYRYYYRYY.', 'YYYYYYYYYYY', 'Y.YYYYYYY.Y', 'Y.Y.....Y.Y', '...YY.YY...'],
  // 红色的毒刺：白肚子、蓝翅尖
  stinger: ['R.........R', '.R..WWW..R.', '..RWWWWWR..', 'BBRRWWWRRBB', 'BBRRRRRRRBB', '..RR...RR..', '.R.......R.', 'R.........R'],
  // 绿色的母舰：紫色的钳子、黄眼睛
  boss: ['....GGGGG....', '..GGGGGGGGG..', '.GGYGGGGGYGG.', 'GGGGGGGGGGGGG', 'PP.GG.G.GG.PP', 'PPP.GGGGG.PPP', '.PP..G.G..PP.', '..P.......P..'],
  // 玩家的战机：白机身、蓝座舱、红翼尖
  fighter: ['......W......', '......W......', '.....WWW.....', '.....WBW.....', '..R..WBW..R..', '..R.WWWWW.R..', '..WWWWRWWWW..', '.WWWWRRRWWWW.', 'WWW.WWWWW.WWW', 'WW..WW.WW..WW', 'W...R...R...W'],
  life: ['...W...', '..WBW..', 'R.WWW.R', 'WWWRWWW', 'W.W.W.W'],
  flag: ['R####', 'RYYY.', 'RYY..', 'R....', 'R....'],
  boom: ['W...O...W', '.W..Y..W.', '..OYWYO..', '.OYWWWYO.', 'OYWWWWWYO', '.OYWWWYO.', '..OYWYO..', '.W..Y..W.', 'W...O...W'],
};
const PAL = {
  B: [60, 110, 255], Y: [255, 214, 40], R: [240, 40, 40], W: [245, 245, 245], G: [40, 220, 120], P: [190, 70, 230], O: [255, 140, 30], '#': [255, 214, 40],
};

function gameFrame(gw, gh, seed) {
  const fb = new Float32Array(gw * gh * 3);
  const px = (x, y, c, k = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= gw || y >= gh) return;
    const i = (y * gw + x) * 3;
    fb[i] = (c[0] / 255) * k; fb[i + 1] = (c[1] / 255) * k; fb[i + 2] = (c[2] / 255) * k;
  };
  const sprite = (name, cx, cy, pal = PAL) => {
    const rows = SPR[name], w = rows[0].length, h = rows.length;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch !== '.') px(cx - Math.floor(w / 2) + x, cy - Math.floor(h / 2) + y, pal[ch]);
    }
  };
  const ptext = (x, y, str, c, align = 'left') => {
    const w = str.length * 6 - 1;
    let cx = align === 'right' ? x - w : align === 'center' ? x - Math.floor(w / 2) : x;
    for (const ch of str) {
      const g = PIX[ch];
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r][q] === '#') px(cx + q, y + r, c);
      cx += 6;
    }
  };
  // 星空：几种颜色的小点，亮度不一
  const rnd = mulberry(seed);
  const starC = [[255, 255, 255], [255, 80, 80], [90, 140, 255], [255, 220, 80], [90, 255, 140]];
  for (let i = 0; i < 110; i++) px(rnd() * gw, 22 + rnd() * (gh - 40), starC[Math.floor(rnd() * starC.length)], 0.35 + 0.65 * rnd());
  // 顶上：1UP / HIGH SCORE 和分数
  const red = [240, 40, 40], white = [240, 240, 240];
  ptext(10, 2, '1UP', red);
  ptext(gw / 2 + 8, 2, 'HIGH SCORE', red, 'center');
  ptext(40, 11, '12340', white, 'right');
  ptext(gw / 2 + 8, 11, '50000', white, 'center');
  // 编队：母舰一排、毒刺两排、工蜂两排；有几个位置空着（已经被打掉了）
  const cx = gw / 2;
  const gone = new Set(['b1', 's0-6', 's1-1', 'd0-3', 'd1-8', 'd1-0']);
  for (let i = 0; i < 4; i++) if (!gone.has(`b${i}`)) sprite('boss', cx + (i - 1.5) * 18, 42);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) if (!gone.has(`s${r}-${i}`)) sprite('stinger', cx + (i - 3.5) * 16, 58 + r * 12);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 10; i++) if (!gone.has(`d${r}-${i}`)) sprite('drone', cx + (i - 4.5) * 16, 84 + r * 12);
  // 俯冲下来的两只、一处爆炸、子弹
  sprite('stinger', 58, 150);
  sprite('drone', 152, 182);
  sprite('boom', cx - 9, 42);
  for (const [x, y] of [[104, 226], [104, 196]]) { px(x, y, [255, 214, 40]); px(x, y + 1, [255, 214, 40]); px(x, y + 2, [240, 40, 40]); }
  for (const [x, y] of [[64, 172], [150, 206], [152, 222]]) { px(x, y, [255, 255, 255]); px(x, y + 1, [240, 40, 40]); }
  // 玩家的战机，底下是剩余的命和关卡旗
  sprite('fighter', 104, 250);
  sprite('life', 6, gh - 7);
  sprite('life', 15, gh - 7);
  for (let i = 0; i < 3; i++) sprite('flag', gw - 8 - i * 7, gh - 7);
  return fb;
}

export function gameAtlas(S, P) {
  const A = GAME_ATLAS, k = S / A.size, m = Math.round(2 * k);
  const out = alloc(S);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nA = perlin(P.seed + 1), nB = perlin(P.seed + 2), nC = perlin(P.seed + 3);
  const rnd = mulberry(P.seed + 4);

  // —— 纯色格子 ——
  {
    const [x0, y0, x1, y1] = box('swatch');
    const rows = Math.ceil(A.swatches.length / A.cols);
    const w = (x1 - x0) / A.cols, h = (y1 - y0) / rows;
    A.swatches.forEach((s, i) => {
      const c = rgb(s.c), e = s.emit ? rgb(s.emit) : null;
      const cx = x0 + Math.round((i % A.cols) * w), cy = y0 + Math.round(Math.floor(i / A.cols) * h);
      for (let y = cy; y < cy + Math.round(h); y++) for (let x = cx; x < cx + Math.round(w); x++) put(out, y * S + x, c, 0, s.rough, s.metal ?? 0, e);
    });
  }

  // —— 街机屏幕：像素游戏放大到显像管上 —— 弧面（桶形畸变）、扫描线、辉光、暗角、圆角的管口 ——
  {
    const b = box('screen'), { gw, gh } = A.screen;
    const fb = gameFrame(gw, gh, P.seed + 5);
    // 辉光：把画面模糊一遍（可分离的盒式模糊，半径 2 个游戏像素）
    const blur = new Float32Array(fb.length), tmp = new Float32Array(fb.length), R = 2;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let d = -R; d <= R; d++) s += fb[(y * gw + Math.min(gw - 1, Math.max(0, x + d))) * 3 + c];
      tmp[(y * gw + x) * 3 + c] = s / (2 * R + 1);
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let d = -R; d <= R; d++) s += tmp[(Math.min(gh - 1, Math.max(0, y + d)) * gw + x) * 3 + c];
      blur[(y * gw + x) * 3 + c] = s / (2 * R + 1);
    }
    const sample = (buf, u, v) => {
      const x = Math.min(gw - 1, Math.max(0, Math.floor(u * gw))), y = Math.min(gh - 1, Math.max(0, Math.floor(v * gh)));
      const i = (y * gw + x) * 3;
      return [buf[i], buf[i + 1], buf[i + 2]];
    };
    region(out, S, b, 0, (u, v) => {
      const cu = u - 0.5, cv = v - 0.5, r2 = cu * cu + cv * cv;
      const gu = 0.5 + cu * (1 + 0.09 * r2), gv = 0.5 + cv * (1 + 0.09 * r2);
      // 管口：圆角矩形外面是黑的
      const tube = sdRoundRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.07);
      const inside = gu >= 0 && gu <= 1 && gv >= 0 && gv <= 1 && tube < 0;
      if (!inside) return [[0.01, 0.01, 0.012], 0, 0.1, 0, [0, 0, 0]];
      const c = sample(fb, gu, gv), g = sample(blur, gu, gv);
      const scan = 0.62 + 0.38 * Math.sin(Math.PI * fract(gv * gh));
      const vig = 1 - 0.55 * r2;
      const edge = sstep(0, 0.012, -tube);
      const e = [0, 1, 2].map((q) => ((c[q] * scan + g[q] * 0.55) * vig + 0.012) * edge);
      return [mul(e, 0.15), 0, 0.55, 0, e];
    });
  }

  // —— 顶灯箱：深空的渐变、星云、带环的行星，STAR RAID 的大字（深色描边 + 黄到橙红的渐变），底下一行小字 ——
  {
    const b = box('marquee'), { w: W, h: H } = A.marquee;
    region(out, S, b, m, (u, v) => {
      const neb = fbm(nA, u, v, 6, 2, 4);
      let c = mix3(rgb([18, 8, 58]), rgb([96, 18, 88]), clamp01(v * 0.9 + 0.25 * neb));
      c = add3(c, mul(rgb([60, 20, 120]), Math.max(0, neb) * 0.6));
      return [c, 0, 0.3, 0, c];
    });
    const { fill } = gp(out, S, b, W, H);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W, y = rnd() * H, r = 0.0004 + rnd() * 0.0009, s = 0.6 + 0.4 * rnd();
      const c = mul([1, 1, 1], s);
      fill((px, py) => Math.hypot(px - x, py - y) - r, [x - r, y - r, x + r, y + r], { color: c, emit: c });
    }
    // 行星：左边，球面明暗 + 一道斜着的环
    const pc = [0.075, 0.082], pr = 0.05;
    fill((px, py) => Math.hypot(px - pc[0], py - pc[1]) - pr, [pc[0] - pr, pc[1] - pr, pc[0] + pr, pc[1] + pr], {
      color: (px, py) => { const l = clamp01(0.75 - ((px - pc[0]) + (py - pc[1])) / (1.6 * pr)); const c = mix3(rgb([60, 20, 80]), rgb([255, 150, 70]), l); return c; },
      emit: (px, py) => { const l = clamp01(0.75 - ((px - pc[0]) + (py - pc[1])) / (1.6 * pr)); return mix3(rgb([60, 20, 80]), rgb([255, 150, 70]), l); },
    });
    const ring = (px, py) => {
      const dx = px - pc[0], dy = py - pc[1], a = -0.35, x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a);
      return Math.abs(Math.hypot(x / 1.9, y / 0.42) - pr * 0.95) - 0.0018;
    };
    fill((px, py) => {
      // 环在行星后面那一半被挡住
      const dx = px - pc[0], dy = py - pc[1], behind = Math.hypot(dx, dy) < pr && dy < 0.35 * dx;
      return behind ? 1 : ring(px, py);
    }, [pc[0] - 0.1, pc[1] - 0.04, pc[0] + 0.1, pc[1] + 0.04], { color: rgb([255, 214, 140]), emit: rgb([255, 214, 140]) });
    // 大字
    const h = 0.066, y0 = 0.03, x0 = 0.155;
    const grad = (px, py) => mix3(rgb([255, 236, 80]), rgb([242, 60, 34]), clamp01((py - y0) / h));
    text(fill, 'STAR RAID', x0, y0, h, { stroke: 0.34, color: rgb([26, 0, 34]), emit: rgb([8, 0, 10]) });
    text(fill, 'STAR RAID', x0, y0, h, { stroke: 0.2, color: grad, emit: grad });
    text(fill, 'STAR RAID', x0 + 0.002, y0 - 0.001, h, { stroke: 0.05, color: rgb([255, 250, 210]), emit: rgb([255, 250, 210]), alpha: 0.6 });
    const tw = textWidth('STAR RAID', h);
    text(fill, 'TRYITEM ARCADE', x0 + tw / 2, y0 + h + 0.02, 0.016, { align: 'center', stroke: 0.16, color: rgb([90, 235, 255]), emit: rgb([90, 235, 255]) });
  }

  // —— 侧板画：黑底，三道从后下方扫向前上方的速度线（橙 / 品红 / 青），一颗带环的大行星、星星、一艘战机的剪影 ——
  // 坐标是侧板上的 (z, y)：u = (z + W/2) / W（+z 是机台正面），v 从顶往下
  {
    const b = box('side'), { w: W, h: H } = A.side;
    region(out, S, b, 0, () => [rgb([16, 16, 18]), 0, 0.35, 0]);
    const { fill } = gp(out, S, b, W, H);
    const P2 = (z, y) => [z + W / 2, H - y];   // 侧板坐标 → 画笔坐标（米，y 向下）
    const stripe = (a0, a1, w, c) => {
      const A0 = P2(...a0), A1 = P2(...a1);
      fill((px, py) => sdSeg(px, py, A0, A1, w), [Math.min(A0[0], A1[0]) - w, Math.min(A0[1], A1[1]) - w, Math.max(A0[0], A1[0]) + w, Math.max(A0[1], A1[1]) + w], { color: c, rough: 0.3 });
    };
    stripe([-0.42, 0.28], [0.1, 1.2], 0.06, rgb([242, 120, 30]));
    stripe([-0.42, 0.14], [0.2, 1.12], 0.04, rgb([226, 40, 130]));
    stripe([-0.42, 0.03], [0.26, 1.02], 0.025, rgb([40, 200, 235]));
    for (let i = 0; i < 90; i++) {
      const z = -0.4 + rnd() * 0.5, y = 1.0 + rnd() * 0.72, r = 0.0015 + rnd() * 0.003;
      const [x, yy] = P2(z, y);
      fill((px, py) => Math.hypot(px - x, py - yy) - r, [x - r, yy - r, x + r, yy + r], { color: mul([1, 1, 1], 0.5 + 0.5 * rnd()), rough: 0.3 });
    }
    const [pcx, pcy] = P2(-0.16, 1.38), pr = 0.13;
    const lit = (px, py) => clamp01(0.7 - ((px - pcx) * 0.8 + (py - pcy)) / (1.7 * pr));
    fill((px, py) => Math.hypot(px - pcx, py - pcy) - pr, [pcx - pr, pcy - pr, pcx + pr, pcy + pr], {
      color: (px, py) => mix3(rgb([40, 16, 70]), rgb([250, 150, 80]), lit(px, py)), rough: 0.3,
    });
    fill((px, py) => {
      const dx = px - pcx, dy = py - pcy, a = -0.3, x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a);
      const behind = Math.hypot(dx, dy) < pr && y < 0;
      return behind ? 1 : Math.abs(Math.hypot(x / 1.8, y / 0.38) - pr * 1.02) - 0.006;
    }, [pcx - 0.26, pcy - 0.1, pcx + 0.26, pcy + 0.1], { color: rgb([255, 214, 140]), rough: 0.3 });
    // 战机的剪影（和屏幕上的是同一个造型，放大成矢量）
    const ship = [[0, -0.07], [0.012, -0.035], [0.014, 0.0], [0.05, 0.03], [0.052, 0.05], [0.014, 0.04], [0.01, 0.06], [-0.01, 0.06], [-0.014, 0.04], [-0.052, 0.05], [-0.05, 0.03], [-0.014, 0.0], [-0.012, -0.035]];
    const [sx, sy] = P2(0.12, 0.62), sa = 0.55;
    const shipPts = ship.map(([x, y]) => [sx + x * Math.cos(sa) - y * Math.sin(sa), sy + x * Math.sin(sa) + y * Math.cos(sa)].map((v) => v));
    fill((px, py) => sdPoly(px, py, shipPts), [sx - 0.08, sy - 0.08, sx + 0.08, sy + 0.08], { color: rgb([236, 236, 232]), rough: 0.3 });
  }

  // —— 控制面板：黑底，两头的速度线，摇杆和按键底下印的圈，1 PLAYER / 2 PLAYERS / FIRE ——
  // 按键的位置（u, v）和模型里的一致：摇杆 (0.2, 0.55)，三颗开火键 v 0.55，开始键 v 0.22
  {
    const b = box('cpanel'), { w: W, h: H } = A.cpanel;
    region(out, S, b, m, (u, v) => [rgb([18, 18, 20]), 0.2, 0.35, 0]);
    const { fill } = gp(out, S, b, W, H);
    const band = (x0, c) => fill((px, py) => sdPoly(px, py, [[x0, 0], [x0 + 0.03, 0], [x0 + 0.03 - 0.09, H], [x0 - 0.09, H]]), [x0 - 0.09, 0, x0 + 0.03, H], { color: c, rough: 0.3 });
    band(0.1, rgb([242, 120, 30])); band(0.14, rgb([226, 40, 130])); band(0.18, rgb([40, 200, 235]));
    band(W - 0.02, rgb([242, 120, 30])); band(W + 0.02, rgb([226, 40, 130]));
    const ringAt = (u, v, r, c) => fill((px, py) => Math.abs(Math.hypot(px - u * W, py - v * H) - r) - 0.0015, [u * W - r - 0.003, v * H - r - 0.003, u * W + r + 0.003, v * H + r + 0.003], { color: c, rough: 0.3 });
    const white = rgb([235, 235, 230]), yel = rgb([255, 214, 40]);
    ringAt(0.2, 0.55, 0.038, yel);
    for (const u of [0.56, 0.68, 0.8]) ringAt(u, 0.55, 0.024, white);
    for (const u of [0.42, 0.54]) ringAt(u, 0.22, 0.017, white);
    text(fill, '1 PLAYER', 0.42 * W, 0.34 * H, 0.0105, { align: 'center', stroke: 0.15, color: white, rough: 0.3 });
    text(fill, '2 PLAYERS', 0.54 * W + 0.012, 0.34 * H, 0.0105, { align: 'center', stroke: 0.15, color: white, rough: 0.3 });
    text(fill, 'FIRE', 0.68 * W, 0.72 * H, 0.013, { align: 'center', stroke: 0.15, color: yel, rough: 0.3 });
  }

  // —— 投币门：拉丝的深灰铁板，一圈压边，两个投币口（红色的灯 + 黑色的缝），INSERT COIN，底下一把锁 ——
  {
    const b = box('coin'), { w: W, h: H } = A.coin;
    region(out, S, b, m, (u, v) => {
      const brush = 0.5 + 0.5 * nB(u * 3, v * 260);
      const c = mul(rgb([70, 72, 76]), 0.85 + 0.15 * brush);
      return [c, 0.3, 0.38, 1];
    });
    const { fill } = gp(out, S, b, W, H);
    fill((px, py) => Math.abs(sdRoundRect(px, py, W / 2, H / 2, W / 2 - 0.012, H / 2 - 0.012, 0.01)) - 0.003, [0, 0, W, H], { color: rgb([110, 112, 116]), height: 0.7, rough: 0.3, metal: 1 });
    for (const cx of [W * 0.3, W * 0.7]) {
      fill((px, py) => sdRoundRect(px, py, cx, 0.1, 0.034, 0.05, 0.004), [cx - 0.04, 0.04, cx + 0.04, 0.16], { color: rgb([20, 20, 22]), height: 0.2, rough: 0.4, metal: 0 });
      fill((px, py) => sdRoundRect(px, py, cx, 0.085, 0.024, 0.016, 0.003), [cx - 0.03, 0.06, cx + 0.03, 0.11], { color: rgb([230, 40, 40]), emit: rgb([255, 60, 50]), height: 0.5, rough: 0.2 });
      fill((px, py) => sdRoundRect(px, py, cx, 0.085, 0.0018, 0.012, 0.0015), [cx - 0.004, 0.07, cx + 0.004, 0.1], { color: rgb([10, 6, 6]), emit: rgb([20, 4, 4]) });
      text(fill, '25', cx, 0.066, 0.008, { align: 'center', stroke: 0.16, color: rgb([255, 240, 230]), emit: rgb([255, 240, 230]) });
      fill((px, py) => sdRoundRect(px, py, cx, 0.13, 0.016, 0.01, 0.002), [cx - 0.02, 0.115, cx + 0.02, 0.145], { color: rgb([34, 34, 36]), height: 0.1 });
    }
    text(fill, 'INSERT COIN', W / 2, 0.2, 0.017, { align: 'center', stroke: 0.15, color: rgb([255, 214, 40]), rough: 0.4, metal: 0 });
    fill((px, py) => Math.hypot(px - W / 2, py - 0.29) - 0.014, [W / 2 - 0.016, 0.274, W / 2 + 0.016, 0.306], { color: rgb([190, 192, 196]), height: 0.8, rough: 0.2, metal: 1 });
    fill((px, py) => sdRoundRect(px, py, W / 2, 0.29, 0.0018, 0.007, 0.001), [W / 2 - 0.004, 0.28, W / 2 + 0.004, 0.3], { color: rgb([12, 12, 14]), height: 0.3, metal: 0 });
  }

  // —— 桌上足球的场地：割草纹的绿地、白线（边线、中线、中圈、禁区、小禁区、罚球点、角球弧）——
  // 坐标：x 沿球台长边（1.2m），y 沿宽边（0.682m）
  {
    const b = box('field'), { w: W, h: H } = A.field;
    region(out, S, b, m, (u, v) => {
      const x = u * W, y = v * H;
      const stripe = Math.floor(x / 0.1) % 2 ? 0.93 : 1.04;
      const g = fbm(nC, u, v, 16, 9, 4);
      const c = mul(rgb([34, 128, 56]), stripe * (1 + 0.06 * g));
      return [c, 0.3 + 0.1 * g, 0.62, 0];
    });
    const { fill } = gp(out, S, b, W, H);
    const line = { color: rgb([236, 238, 230]), rough: 0.5, height: 0.5 }, lw = 0.006, e = 0.02;
    const rectLine = (x0, y0, x1, y1) => fill((px, py) => Math.abs(sdRoundRect(px, py, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0)) - lw / 2, [x0 - lw, y0 - lw, x1 + lw, y1 + lw], line);
    rectLine(e, e, W - e, H - e);
    fill((px, py) => sdSeg(px, py, [W / 2, e], [W / 2, H - e], lw), [W / 2 - lw, e, W / 2 + lw, H - e], line);
    fill((px, py) => Math.abs(Math.hypot(px - W / 2, py - H / 2) - 0.085) - lw / 2, [W / 2 - 0.09, H / 2 - 0.09, W / 2 + 0.09, H / 2 + 0.09], line);
    fill((px, py) => Math.hypot(px - W / 2, py - H / 2) - 0.008, [W / 2 - 0.01, H / 2 - 0.01, W / 2 + 0.01, H / 2 + 0.01], line);
    for (const s of [0, 1]) {
      const X = (x) => (s ? W - x : x);
      const bx = [X(e), X(e + 0.15)].sort((a, c) => a - c), sb = [X(e), X(e + 0.055)].sort((a, c) => a - c);
      rectLine(bx[0], H / 2 - 0.19, bx[1], H / 2 + 0.19);
      rectLine(sb[0], H / 2 - 0.1, sb[1], H / 2 + 0.1);
      fill((px, py) => Math.hypot(px - X(e + 0.11), py - H / 2) - 0.006, [X(e + 0.11) - 0.008, H / 2 - 0.008, X(e + 0.11) + 0.008, H / 2 + 0.008], line);
      // 禁区外的弧
      fill((px, py) => {
        const d = Math.abs(Math.hypot(px - X(e + 0.11), py - H / 2) - 0.07) - lw / 2;
        return (s ? px > X(e + 0.15) : px < X(e + 0.15)) ? 1 : d;
      }, [X(e + 0.11) - 0.08, H / 2 - 0.08, X(e + 0.11) + 0.08, H / 2 + 0.08], line);
      for (const cy of [e, H - e]) {
        fill((px, py) => Math.abs(Math.hypot(px - X(e), py - cy) - 0.025) - lw / 2, [X(e) - 0.03, cy - 0.03, X(e) + 0.03, cy + 0.03], line);
      }
    }
  }

  // —— 台球：白球 + 1 ~ 15 号。实色球整只一个颜色，花色球是白球中间一道色带；前后各一个白圈印着号码 ——
  {
    const [x0, y0, x1, y1] = box('balls');
    const { cols, rows } = A.balls, cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
    const C = [null, [247, 190, 20], [22, 64, 176], [204, 26, 32], [84, 36, 134], [242, 104, 26], [16, 112, 58], [118, 26, 32], [20, 20, 22]];
    const white = rgb([244, 241, 232]);
    for (let n = 0; n < 16; n++) {
      const bx = x0 + Math.round((n % cols) * cw), by = y0 + Math.round(Math.floor(n / cols) * ch);
      const base = n === 0 ? white : n <= 8 ? rgb(C[n]) : white, band = n > 8 ? rgb(C[n - 8]) : null;
      // 号码的笔画（细线字体），在白圈的切平面里画
      const label = String(n), gh = 0.34, tw = textWidth(label, gh);
      const segs = [];
      let cx = -tw / 2;
      for (const c of label) {
        const g = GLYPHS[c];
        for (const l of g.s) for (let i = 0; i + 1 < l.length; i++) segs.push([[cx + l[i][0] * gh, -0.5 * gh + l[i][1] * gh], [cx + l[i + 1][0] * gh, -0.5 * gh + l[i + 1][1] * gh]]);
        cx += (g.w + 0.2) * gh;
      }
      const R0 = 0.3;   // 白圈半径（切平面里，球半径 = 1）
      for (let y = by; y < by + Math.round(ch); y++) {
        const v = (y + 0.5 - by - 1) / (ch - 2), lat = (0.5 - v) * Math.PI;
        for (let x = bx; x < bx + Math.round(cw); x++) {
          const u = (x + 0.5 - bx - 1) / (cw - 2), lon = (u - 0.5) * 2 * Math.PI;
          let c = band && Math.abs(lat) < 0.5 ? band : base;
          if (n > 0) {
            // 前后两个号码圈：各自的切平面坐标
            for (const lon0 of [0, Math.PI]) {
              const dl = lon - lon0, cosd = Math.cos(lat) * Math.cos(dl);
              if (cosd <= 0.5) continue;
              const tx = (Math.cos(lat) * Math.sin(dl)) / cosd, ty = -Math.sin(lat) / cosd;
              const d = Math.hypot(tx, ty);
              const a = clamp01((R0 - d) / 0.03 + 0.5);
              if (a <= 0) continue;
              c = mix3(c, white, a);
              let ds = Infinity;
              for (const [p, q] of segs) ds = Math.min(ds, sdSeg(tx, ty, p, q, 0.06));
              c = mix3(c, rgb([18, 18, 20]), clamp01(0.5 - ds / 0.03) * a);
            }
          }
          put(out, y * S + x, c, 0, 0.07, 0);
        }
      }
    }
  }
  return out;
}
