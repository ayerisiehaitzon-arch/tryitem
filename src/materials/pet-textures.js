// 宠物房的程序化贴图：宠物房图集（橘猫的虎斑、猫脸、三种鱼的侧面、网球、狗粮袋、爪印硅胶垫、一碗狗粮、鱼缸的背景膜、纯色格子），
// 猫爬架柱子上缠的剑麻、平台上的短毛绒、狗窝的羊羔绒、绳结玩具的三色拧绳、鱼缸底砂、软木地板。
import { perlin, fbm, mulberry, worley } from './noise.js';
import { PET_ATLAS } from './atlas.js';
import { sdRoundRect, sdSeg } from './laundry-textures.js';
import { text } from './gym-textures.js';
import { signedDist } from '../band/outline.js';
import { ANGEL, tennisSeam } from '../pets/shapes.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const fract = (x) => x - Math.floor(x);
const hash2 = (x, y, s) => fract(Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453);

function alloc(S, emit = false) {
  const o = { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S), metal: new Float32Array(S * S) };
  if (emit) o.emit = new Float32Array(S * S * 3);
  return o;
}
function put(out, i, c, h, r, m = 0, e = null) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h; out.rough[i] = r; out.metal[i] = m;
  if (out.emit) { const q = e ?? [0, 0, 0]; out.emit[i * 3] = q[0]; out.emit[i * 3 + 1] = q[1]; out.emit[i * 3 + 2] = q[2]; }
}
// 区域逐像素：f(x, y) → [color, height, rough, metal?, emit?]，(x, y) 是区域里的物理坐标（左上原点、y 向下）
function region(out, S, box, W, H, f) {
  const [x0, y0, x1, y1] = box, sx = (x1 - x0) / W, sy = (y1 - y0) / H;
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const [c, h, r, m, e] = f((i + 0.5 - x0) / sx, (j + 0.5 - y0) / sy);
    put(out, j * S + i, c, h, r, m ?? 0, e ?? null);
  }
}
// SDF 画笔（物理坐标，左上原点、y 向下）
function gp(out, S, box, W, H) {
  const [bx0, by0, bx1, by1] = box;
  const sx = (bx1 - bx0) / W, sy = (by1 - by0) / H, px = 1 / Math.min(sx, sy);
  return (sdf, bb, { color = null, rough = null, height = null, metal = null, alpha = 1 } = {}) => {
    const i0 = Math.max(bx0, Math.floor(bx0 + (bb[0] - px) * sx)), i1 = Math.min(bx1 - 1, Math.ceil(bx0 + (bb[2] + px) * sx));
    const j0 = Math.max(by0, Math.floor(by0 + (bb[1] - px) * sy)), j1 = Math.min(by1 - 1, Math.ceil(by0 + (bb[3] + px) * sy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = clamp01(0.5 - sdf((i + 0.5 - bx0) / sx, (j + 0.5 - by0) / sy) / px) * alpha;
      if (a <= 0) continue;
      const k = j * S + i;
      if (color) for (let q = 0; q < 3; q++) out.color[k * 3 + q] = mix(out.color[k * 3 + q], color[q], a);
      if (rough !== null) out.rough[k] = mix(out.rough[k], rough, a);
      if (height !== null) out.height[k] = mix(out.height[k], height, a);
      if (metal !== null) out.metal[k] = mix(out.metal[k], metal, a);
    }
  };
}
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const sdEllipse = (x, y, cx, cy, rx, ry, a = 0) => {
  const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
  const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
  return (Math.hypot(u, v) - 1) * Math.min(rx, ry);
};
// 一个爪印（主垫 + 四个趾垫），中心 (cx, cy)、大小 s（主垫宽）、转角 a（弧度，0 = 趾头朝上 / 图上方）
function paw(fill, cx, cy, s, a, style) {
  const rot = (dx, dy) => [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
  const [px, py] = rot(0, 0.18 * s);
  fill((x, y) => sdEllipse(x, y, px, py, 0.5 * s, 0.4 * s, a), [px - s, py - s, px + s, py + s], style);
  for (const [dx, dy, r] of [[-0.52, -0.3, 0.17], [-0.19, -0.56, 0.18], [0.19, -0.56, 0.18], [0.52, -0.3, 0.17]]) {
    const [tx, ty] = rot(dx * s, dy * s);
    fill((x, y) => sdEllipse(x, y, tx, ty, r * s, r * s * 1.25, a), [tx - s * 0.4, ty - s * 0.4, tx + s * 0.4, ty + s * 0.4], style);
  }
}

export function petAtlas(S, P) {
  const A = PET_ATLAS, k = S / A.size;
  const out = alloc(S, true);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nA = perlin(P.seed + 1), nB = perlin(P.seed + 2), nC = perlin(P.seed + 3), nD = perlin(P.seed + 4);
  const rnd = mulberry(P.seed + 5);
  const orange = rgb([222, 134, 62]), dark = rgb([156, 72, 26]), cream = rgb([246, 218, 180]);

  // —— 纯色格子 ——
  {
    const [x0, y0, x1, y1] = box('swatch');
    const rows = Math.ceil(A.swatches.length / A.cols);
    const w = (x1 - x0) / A.cols, h = (y1 - y0) / rows;
    A.swatches.forEach((s, i) => {
      const cx = x0 + Math.round((i % A.cols) * w), cy = y0 + Math.round(Math.floor(i / A.cols) * h);
      for (let y = cy; y < cy + Math.round(h); y++) for (let x = cx; x < cx + Math.round(w); x++) put(out, y * S + x, rgb(s.c), 0, s.rough, s.metal ?? 0, s.emit ? rgb(s.emit) : null);
    });
  }

  // —— 猫身子：橘色虎斑。一道道深色的条纹横过脊背，往两肋慢慢变细、往后弯，到肚子上淡成奶白 ——
  {
    const N = A.fur.stripes;
    region(out, S, box('fur'), 1, 1, (u, v) => {
      const back = 0.5 + 0.5 * Math.cos((v - 0.25) * 2 * Math.PI);          // 背上 1，肚子上 0
      const ph = u * N + 0.14 * nA(u * 7, v * 5, 4096, 5) - 0.3 * (1 - back) * (1 - back);   // 两肋上往屁股那边弯
      const d = Math.abs(fract(ph) - 0.5) * 2;                                // 0 在条纹中间
      const wid = 0.22 * sstep(0.28, 0.75, back) + 0.06 + 0.05 * nD(u * 30, v * 10, 4096, 10);
      const stripe = sstep(wid + 0.14, wid - 0.04, 1 - d) * sstep(0.34, 0.58, back);
      const fiber = nB(u * 420, v * 60, 4096, 60) * 0.5 + nC(u * 900, v * 130, 4096, 130) * 0.5;
      let c = mix3(orange, dark, stripe * 0.72);
      c = mix3(c, cream, sstep(0.22, 0.06, back));
      c = mul(c, 0.94 + 0.08 * fiber + 0.04 * nD(u * 12, v * 8, 4096, 8));
      return [c, 0.35 * fiber + 0.2 * back, 0.86];
    });
  }

  // —— 猫脑袋：球面展开（u = 绕脸的朝向转的角，0.5 是头顶；v = 离鼻尖的角度）。额头上几道细条纹一直梳到后脑勺，
  //    两颊各两道，鼻子、嘴一圈和下巴是奶白 ——
  {
    region(out, S, box('head'), 1, 1, (u, v) => {
      const phi = (u - 0.5) * 2 * Math.PI, up = Math.cos(phi);
      const fiber = nB(u * 200, v * 260, 200, 4096) * 0.5 + nC(u * 500, v * 600, 500, 4096) * 0.5;
      let stripe = 0;
      for (const p0 of [-0.3, -0.12, 0.06, 0.24]) {
        const pc = p0 * (1 - 0.35 * v) + 0.04 * nA(v * 9, p0 * 3);
        stripe = Math.max(stripe, sstep(0.07, 0.025, Math.abs(phi - pc)) * sstep(0.2, 0.3, v) * sstep(0.9, 0.6, v));
      }
      for (const s of [-1, 1]) for (const p0 of [1.2, 1.55]) {
        const pc = s * (p0 + 0.3 * (v - 0.3));
        stripe = Math.max(stripe, sstep(0.09, 0.035, Math.abs(phi - pc)) * sstep(0.24, 0.3, v) * sstep(0.5, 0.4, v));
      }
      const muzzle = sstep(0.24, 0.12, v) * sstep(0.35, -0.4, up);
      const chin = sstep(-0.1, -0.6, up) * sstep(0.62, 0.4, v);
      let c = mix3(orange, dark, stripe * 0.8);
      c = mix3(c, cream, Math.max(muzzle, chin) * 0.95);
      c = mul(c, 0.94 + 0.08 * fiber);
      return [c, 0.3 * fiber, 0.86];
    });
  }

  // —— 红绿灯鱼（侧面：x 从尾到嘴，y 从背到肚子）：橄榄色的背，眼睛一直到脂鳍一道发光的蓝，后半截肚子是红的，前半截肚子银白 ——
  {
    const W = 0.03, H = 0.009;
    region(out, S, box('neon'), W, H, (x, y) => {
      const u = x / W, v = y / H;
      let c = mix3(rgb([150, 140, 96]), rgb([226, 228, 232]), sstep(0.35, 0.6, v));
      const blue = sstep(0.27, 0.32, v) * sstep(0.47, 0.42, v) * sstep(0.22, 0.3, u) * sstep(0.95, 0.88, u);
      const red = sstep(0.44, 0.5, v) * sstep(0.97, 0.9, v) * sstep(0.03, 0.08, u) * sstep(0.58, 0.5, u);
      c = mix3(c, rgb([226, 34, 46]), red);
      c = mix3(c, rgb([54, 196, 255]), blue);
      c = mul(c, 0.95 + 0.06 * nA(x * 900, y * 900));
      return [c, 0, 0.3, 0, mul([0.1, 0.5, 0.8], blue * 0.55)];
    });
    const fill = gp(out, S, box('neon'), W, H);
    fill((x, y) => sdCircle(x, y, 0.0268, 0.0037, 0.0013), [0.024, 0.001, 0.03, 0.007], { color: rgb([200, 204, 210]), rough: 0.2 });
    fill((x, y) => sdCircle(x, y, 0.0269, 0.0037, 0.0008), [0.024, 0.001, 0.03, 0.007], { color: [0.03, 0.03, 0.04], rough: 0.1 });
  }
  // —— 鼠鱼：古铜绿的身子撒满黑点，肚子银白，一只黑眼睛 ——
  {
    const W = 0.045, H = 0.014, w = worley(P.seed + 7);
    region(out, S, box('cory'), W, H, (x, y) => {
      const u = x / W, v = y / H;
      let c = mix3(rgb([118, 110, 78]), rgb([214, 214, 206]), sstep(0.55, 0.75, v));
      const cell = w(u * 22, v * 7, 22, 7), spot = cell.id < 0.45 ? sstep(0.32, 0.18, cell.f1) * sstep(0.7, 0.5, v) : 0;
      c = mix3(c, rgb([40, 38, 30]), spot * 0.85);
      return [mul(c, 0.95 + 0.08 * nB(x * 600, y * 600)), -spot * 0.2, 0.4];
    });
    const fill = gp(out, S, box('cory'), W, H);
    fill((x, y) => sdCircle(x, y, 0.039, 0.0052, 0.0017), [0.035, 0.002, 0.043, 0.009], { color: [0.04, 0.04, 0.05], rough: 0.1 });
  }
  // —— 神仙鱼：珍珠银的身子、四道黑竖纹（穿过眼睛、身子中间、后半截、尾柄），鳍是半透明的灰，竖纹一直延到鳍上；红眼睛 ——
  {
    const Z = A.angel.size, poly = ANGEL.body(4);
    region(out, S, box('angel'), Z, Z, (x, y) => {
      const px = x - Z / 2, py = Z / 2 - y;
      const inside = sstep(-0.0008, 0.0008, signedDist(poly, px, py));
      let bar = 0;
      for (const [cx, hw] of ANGEL.bars) bar = Math.max(bar, sstep(hw + 0.0012, hw - 0.0006, Math.abs(px - cx + 0.004 * py)));
      const body = mix3(rgb([222, 222, 214]), rgb([196, 198, 190]), sstep(0.02, -0.02, py));
      const finC = mix3(rgb([176, 184, 190]), rgb([150, 160, 170]), 0.5 + 0.5 * nA(px * 300, py * 60));
      const ray = 0.5 + 0.5 * Math.sin(Math.atan2(py, px + 0.02) * 60);
      let c = mix3(mul(finC, 0.94 + 0.06 * ray), body, inside);
      c = mix3(c, rgb([24, 24, 26]), bar * (inside ? 0.92 : 0.75));
      return [mul(c, 0.96 + 0.05 * nB(px * 500, py * 500)), inside * 0.2, 0.3 + (1 - inside) * 0.1];
    });
    const fill = gp(out, S, box('angel'), Z, Z);
    const [ex, ey] = [Z / 2 + ANGEL.eye[0], Z / 2 - ANGEL.eye[1]];
    fill((x, y) => sdCircle(x, y, ex, ey, 0.0034), [ex - 0.005, ey - 0.005, ex + 0.005, ey + 0.005], { color: rgb([190, 40, 36]), rough: 0.15 });
    fill((x, y) => sdCircle(x, y, ex, ey, 0.0017), [ex - 0.004, ey - 0.004, ex + 0.004, ey + 0.004], { color: [0.03, 0.03, 0.04], rough: 0.1 });
  }

  // —— 网球：黄绿色的毛毡，一条白色的缝线（球面曲线）——
  {
    const seam = tennisSeam(500);
    region(out, S, box('tennis'), 1, 1, (u, v) => {
      // 和车削的展开方式一致：u 是车削的圆周（从 -z 开始），v 从北极（顶）到南极
      const phi = u * 2 * Math.PI, th = v * Math.PI;
      const q = [-Math.sin(th) * Math.sin(phi), Math.cos(th), -Math.sin(th) * Math.cos(phi)];
      let d = Infinity;
      for (const p of seam) d = Math.min(d, (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2);
      const line = sstep(0.1, 0.07, Math.sqrt(d));
      const fuzz = nA(u * 160, v * 80) * 0.5 + nB(u * 400, v * 200) * 0.5;
      const c = mix3(mul(rgb([204, 226, 70]), 0.92 + 0.12 * fuzz), rgb([238, 238, 226]), line);
      return [c, 0.4 * fuzz - line * 0.3, 0.95 - line * 0.3];
    });
  }

  // —— 一碗狗粮：圆圆的棕色颗粒挤在一起（周期平铺）——
  {
    const Pd = A.kibble.period, b = box('kibble');
    region(out, S, b, Pd, Pd, () => [rgb([58, 36, 20]), -0.5, 0.8]);
    const fill = gp(out, S, b, Pd, Pd);
    for (let i = 0; i < 460; i++) {
      const cx = rnd() * Pd, cy = rnd() * Pd, r = 0.0038 + 0.002 * rnd(), tone = 0.8 + 0.35 * rnd();
      const col = mul(rnd() < 0.3 ? rgb([118, 70, 36]) : rgb([150, 96, 52]), tone);
      for (const ox of [-Pd, 0, Pd]) for (const oy of [-Pd, 0, Pd]) {
        const x = cx + ox, y = cy + oy;
        if (x < -0.01 || x > Pd + 0.01 || y < -0.01 || y > Pd + 0.01) continue;
        fill((px, py) => sdCircle(px, py, x, y, r), [x - r, y - r, x + r, y + r], { color: col, height: 0.5, rough: 0.7 });
        fill((px, py) => sdCircle(px, py, x - r * 0.3, y - r * 0.3, r * 0.45), [x - r, y - r, x + r, y + r], { color: mul(col, 1.18), height: 0.8, alpha: 0.6 });
      }
    }
  }

  // —— 鱼缸背景膜：上浅下深的蓝绿渐变，几道从水面斜照下来的光 ——
  {
    const { w: W, h: H } = A.tankBack;
    region(out, S, box('tankBack'), W, H, (x, y) => {
      const t = y / H;
      let c = mix3(rgb([52, 124, 138]), rgb([10, 40, 54]), Math.pow(t, 0.8));
      const ray = Math.pow(0.5 + 0.5 * Math.sin((x + 0.35 * y) * 22 + 2 * nA(x * 3, y * 2)), 6) * (1 - t) * 0.12;
      c = mul(c, 1 + ray + 0.05 * fbm(nB, x / W, y / H, 4, 2, 3));
      return [c, 0, 0.5];
    });
  }

  // —— 狗粮袋正面：牛皮纸，一块白标签（TRYITEM、DOG FOOD、爪印、WITH CHICKEN），底下印着 2 KG ——
  {
    const { w: W, h: H } = A.bag, b = box('bag');
    region(out, S, b, W, H, (x, y) => {
      const fib = nA(x * 400, y * 90) * 0.5 + nB(x * 60, y * 700) * 0.5;
      return [mul(rgb([180, 140, 96]), 0.93 + 0.08 * fib), 0.2 * fib, 0.85];
    });
    const fill = gp(out, S, b, W, H);
    const ink = { color: rgb([60, 40, 28]), rough: 0.6 };
    fill((x, y) => sdRoundRect(x, y, W / 2, 0.14, 0.078, 0.082, 0.01), [0.01, 0.05, 0.19, 0.23], { color: rgb([244, 240, 230]), rough: 0.5 });
    text(fill, 'TRYITEM', W / 2, 0.066, 0.018, { align: 'center', stroke: 0.22, color: rgb([196, 50, 40]), rough: 0.5 });
    text(fill, 'DOG FOOD', W / 2, 0.093, 0.012, { align: 'center', stroke: 0.2, ...ink });
    paw(fill, W / 2, 0.155, 0.028, 0, ink);
    text(fill, 'WITH CHICKEN', W / 2, 0.196, 0.0075, { align: 'center', stroke: 0.18, ...ink });
    text(fill, '2 KG', W / 2, 0.255, 0.014, { align: 'center', stroke: 0.2, color: rgb([244, 240, 230]), rough: 0.6 });
  }

  // —— 硅胶垫：灰绿色，一串爪印沿着前沿（图的下边，餐桌挡不住的那一条）从左走到右 ——
  {
    const { w: W, h: H } = A.mat, b = box('mat');
    region(out, S, b, W, H, (x, y) => [mul(rgb([128, 160, 136]), 0.96 + 0.05 * nC(x * 80, y * 80)), 0, 0.6]);
    const fill = gp(out, S, b, W, H);
    const style = { color: rgb([104, 136, 114]), height: 0.4, rough: 0.55 };
    const prints = [[0.06, 0.352, 1.75], [0.135, 0.322, 1.45], [0.215, 0.356, 1.7], [0.295, 0.326, 1.42], [0.375, 0.358, 1.72], [0.455, 0.328, 1.46], [0.535, 0.356, 1.68]];
    prints.forEach(([x, y, a]) => paw(fill, x, y, 0.028, a, style));
  }
  return out;
}

// ——————————————————————— 剑麻 ———————————————————————
// 周期 0.1m：14 圈剑麻绳一圈圈缠上去（沿 u 走），每圈绳子是圆的、三股斜着拧，满是毛刺；圈和圈之间一道暗缝
export function sisal(S, P) {
  const out = alloc(S), n = perlin(P.seed), m = perlin(P.seed + 1);
  const wraps = 14;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const w = Math.floor(v * wraps), f = fract(v * wraps);
    const round = Math.sin(Math.PI * f);
    const ply = 0.5 + 0.5 * Math.sin(2 * Math.PI * fract(u * 9 + f * 0.9 + w * 0.37) * 3);
    const hair = n(u * 700, v * 180, 700, 180) * 0.6 + m(u * 1400, v * 900, 1400, 900) * 0.4;
    const tone = 0.9 + 0.1 * hash2(w, 3, P.seed) + 0.05 * fbm(m, u, v, 3, 3, 3);
    const k = (0.62 + 0.38 * Math.pow(round, 0.6)) * (0.9 + 0.1 * ply) * (1 + 0.1 * hair) * tone;
    put(out, y * S + x, mul(P.color, k), round * 0.8 + ply * 0.2 + hair * 0.15, 0.95);
  }
  return out;
}

// ——————————————————————— 短毛绒（猫爬架平台）———————————————————————
// 周期 0.2m：细密的绒毛，一小撮一小撮深浅不一，顺着一个方向略微倒伏
export function plush(S, P) {
  const out = alloc(S), n = perlin(P.seed), w = worley(P.seed + 1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const cl = w(u * 90, v * 90, 90, 90);
    const clump = 0.5 + 0.5 * (cl.id - 0.5) * 2 * sstep(0.9, 0.3, cl.f1);
    const hair = n(u * 600 + v * 120, v * 600, 600, 600) * 0.6 + n(u * 1300, v * 1300, 1300, 1300) * 0.4;
    const k = 0.88 + 0.12 * clump + 0.08 * hair + 0.04 * fbm(n, u, v, 5, 5, 3);
    put(out, y * S + x, mul(P.color, k), clump * 0.5 + hair * 0.4, 1);
  }
  return out;
}

// ——————————————————————— 羊羔绒（狗窝）———————————————————————
// 周期 0.15m：密密的一粒粒卷曲的小毛团（Worley 格子里一个圆鼓包，中间亮、边上柔和地暗下去），毛团上细细的卷纹
export function sherpa(S, P) {
  const out = alloc(S), n = perlin(P.seed), w = worley(P.seed + 1), w2 = worley(P.seed + 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const c = w(u * 60, v * 60, 60, 60), d = w2(u * 150 + 0.5, v * 150 + 0.3, 150, 150);
    const bump = sstep(0.95, 0.15, c.f1), fine = sstep(0.9, 0.2, d.f1);
    const curl = 0.5 + 0.5 * Math.sin(Math.atan2(v * 60 - Math.floor(v * 60), u * 60 - Math.floor(u * 60)) * 3 + c.f1 * 14 + c.id * 30);
    const hair = n(u * 800, v * 800, 800, 800);
    const k = (0.8 + 0.14 * bump + 0.06 * fine) * (0.96 + 0.05 * curl) * (0.97 + 0.04 * hair) * (0.97 + 0.06 * c.id);
    put(out, y * S + x, mul(P.color, k), bump * 0.6 + fine * 0.3 + curl * 0.1, 1);
  }
  return out;
}

// ——————————————————————— 绳结玩具（三股拧绳，每股一种颜色）———————————————————————
// u 沿绳子：一格是三个捻距（每股绕回原位，三种颜色才能首尾接上）；v 正好绕绳子一圈
export function ropeToy(S, P) {
  const out = alloc(S), n = perlin(P.seed);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = (px + 0.5) / S, v = (py + 0.5) / S;
    const g = 3 * (u + v), f = fract(g), strand = Math.floor(g) % 3;
    const ply = Math.sin(Math.PI * f); // 每股的圆拱
    // 纤维顺着股走：跨股方向变化快、沿股方向变化慢
    const fiber = n((u + v) * 96, (u - v) * 12, 96, 12) * 0.5 + n(u * 64, v * 64, 64, 64) * 0.5;
    const k = (0.7 + 0.3 * ply) * (1 + fiber * 0.1);
    put(out, py * S + px, mul(P.colors[strand], k), ply + fiber * 0.15, 0.95 - ply * 0.05);
  }
  return out;
}

// ——————————————————————— 鱼缸底砂 ———————————————————————
// 周期 0.12m：三四毫米的圆砾石（Worley 格子里一颗圆的石子，上半边亮一点），米黄、浅棕、灰、偶尔一颗白石英；石子之间是暗的缝
export function gravel(S, P) {
  const out = alloc(S), n = perlin(P.seed), w = worley(P.seed + 1);
  const pal = [[184, 166, 136], [158, 134, 104], [132, 118, 100], [104, 98, 92], [206, 200, 188], [170, 150, 122], [120, 104, 86]].map(rgb);
  const C = 30;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const c = w(u * C, v * C, C, C);
    const r = 0.58 + 0.14 * fract(c.id * 7.3);
    const stone = sstep(r + 0.08, r - 0.08, c.f1) * sstep(0.0, 0.1, c.f2 - c.f1);
    const col = pal[Math.floor(fract(c.id * 3.7) * pal.length)];
    const shade = 0.82 + 0.18 * (1 - c.f1 / (r + 0.1)) + 0.05 * n(u * 400, v * 400, 400, 400);
    const k = mix(0.28, shade, stone);
    put(out, y * S + x, mul(col, k), stone * (1 - (c.f1 / (r + 0.1)) ** 2), mix(0.9, 0.6, stone));
  }
  return out;
}

// ——————————————————————— 软木地板 ———————————————————————
// 周期 2m：40cm 见方的软木砖 5 × 5 块，每块深浅略不同；两种大小的软木颗粒挤在一起、偶尔一个小孔；
// 砖缝 1mm 一道暗线（贴图四边各半道，模块拼起来是一整道）
export function corkTiles(S, P) {
  const out = alloc(S), w1 = worley(P.seed), w2 = worley(P.seed + 1), n = perlin(P.seed + 2), rnd = mulberry(P.seed + 3);
  const tone = Array.from({ length: 25 }, () => 0.955 + 0.09 * rnd());
  const light = rgb([206, 164, 116]), darkC = rgb([150, 104, 64]);
  const C1 = 900, C2 = 2400, period = 2, T = 5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const a = w1(u * C1, v * C1, C1, C1), b = w2(u * C2 + 0.3, v * C2 + 0.6, C2, C2);
    let c = mix3(darkC, light, clamp01(a.id * 0.8 + 0.1 + (b.id - 0.5) * 0.25));
    const seam = 1 - sstep(0.02, 0.1, a.f2 - a.f1);
    const pore = b.id < 0.04 ? 1 - sstep(0.1, 0.3, b.f1) : 0;
    const t = tone[Math.min(T - 1, Math.floor(v * T)) * T + Math.min(T - 1, Math.floor(u * T))];
    const gu = Math.abs(fract(u * T + 0.5) - 0.5) / T * period, gv = Math.abs(fract(v * T + 0.5) - 0.5) / T * period;
    const joint = sstep(0.0006, 0.0003, Math.min(gu, gv));
    c = mul(c, t * (1 + 0.05 * fbm(n, u, v, 6, 6, 3)) * (1 - seam * 0.25) * (1 - pore * 0.5) * (1 - 0.5 * joint));
    put(out, y * S + x, c, 0.5 - seam * 0.4 - pore * 0.5 + (a.id - 0.5) * 0.2 - joint, 0.8 + seam * 0.08);
  }
  return out;
}
