// 健身房的程序化贴图：器材图集（跑步机屏幕 / 控制台 / 哑铃端面 / 纯色格子）、跑带、滚花、软木、瑜伽垫、橡胶地垫。
import { perlin, fbm, worley, mulberry } from './noise.js';
import { GYM_ATLAS, YOGA } from './atlas.js';
import { painter, sdRoundRect, sdSeg, sdPoly } from './laundry-textures.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const fract = (x) => x - Math.floor(x);

function alloc(S, extra = []) {
  const o = { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
  for (const k of extra) o[k] = new Float32Array(k === 'emit' ? S * S * 3 : S * S);
  return o;
}
function put(out, i, c, h, r) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h;
  out.rough[i] = r;
}

// ——————————————————————— 细线字体 ———————————————————————
// 数字和几个大写字母：每个字是几条折线（圆弧用折线近似），坐标在 w × 1 的框里（y 向下，1 是基线）。
// 琴房的乐谱标题、钢琴上的铭牌（几何的金字）也用它
const arc = (cx, cy, rx, ry, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
const bowlP = [[0.06, 1], [0.06, 0], [0.3, 0], ...arc(0.3, 0.26, 0.24, 0.26, -90, 90, 8).slice(1), [0.06, 0.52]];
export const GLYPHS = {
  '0': { w: 0.6, s: [arc(0.3, 0.5, 0.27, 0.5, 0, 360, 18)] },
  '1': { w: 0.42, s: [[[0.06, 0.18], [0.28, 0], [0.28, 1]]] },
  '2': { w: 0.6, s: [[...arc(0.3, 0.29, 0.26, 0.29, 195, 375, 10), [0.03, 1], [0.58, 1]]] },
  '3': { w: 0.6, s: [[[0.05, 0], [0.54, 0], [0.26, 0.4]], arc(0.3, 0.69, 0.28, 0.31, -100, 150, 12)] },
  '4': { w: 0.62, s: [[[0.44, 1], [0.44, 0], [0.02, 0.68], [0.6, 0.68]]] },
  '5': { w: 0.6, s: [[[0.54, 0], [0.09, 0], [0.07, 0.48]], arc(0.3, 0.69, 0.28, 0.31, -140, 150, 12)] },
  '6': { w: 0.6, s: [arc(0.3, 0.69, 0.27, 0.31, 0, 360, 14), [[0.04, 0.66], [0.42, 0]]] },
  '7': { w: 0.6, s: [[[0.03, 0], [0.57, 0], [0.2, 1]]] },
  '8': { w: 0.6, s: [arc(0.3, 0.25, 0.23, 0.25, 0, 360, 12), arc(0.3, 0.74, 0.27, 0.26, 0, 360, 14)] },
  '9': { w: 0.6, s: [arc(0.3, 0.31, 0.27, 0.31, 0, 360, 14), [[0.56, 0.34], [0.18, 1]]] },
  ':': { w: 0.2, dots: [[0.1, 0.3], [0.1, 0.82]] },
  '.': { w: 0.2, dots: [[0.1, 0.92]] },
  '/': { w: 0.42, s: [[[0.38, 0], [0.04, 1]]] },
  '-': { w: 0.46, s: [[[0.06, 0.56], [0.4, 0.56]]] },
  '%': { w: 0.72, s: [[[0.64, 0], [0.08, 1]], arc(0.16, 0.18, 0.1, 0.17, 0, 360, 10), arc(0.56, 0.82, 0.1, 0.17, 0, 360, 10)] },
  ' ': { w: 0.3, s: [] },
  A: { w: 0.62, s: [[[0.02, 1], [0.31, 0], [0.6, 1]], [[0.12, 0.66], [0.5, 0.66]]] },
  B: { w: 0.58, s: [[[0.06, 1], [0.06, 0], [0.3, 0], ...arc(0.3, 0.245, 0.22, 0.245, -90, 90, 8).slice(1), [0.06, 0.49]], [[0.3, 0.49], ...arc(0.3, 0.745, 0.25, 0.255, -90, 90, 8).slice(1), [0.06, 1]]] },
  C: { w: 0.6, s: [arc(0.33, 0.5, 0.29, 0.5, -45, -315, 16)] },
  D: { w: 0.62, s: [[[0.06, 0], [0.06, 1], [0.26, 1], ...arc(0.26, 0.5, 0.32, 0.5, 90, -90, 12).slice(1), [0.06, 0]]] },
  E: { w: 0.54, s: [[[0.52, 0], [0.06, 0], [0.06, 1], [0.52, 1]], [[0.06, 0.5], [0.44, 0.5]]] },
  G: { w: 0.62, s: [arc(0.33, 0.5, 0.29, 0.5, -45, -330, 16), [[0.6, 0.75], [0.6, 0.56], [0.38, 0.56]]] },
  H: { w: 0.6, s: [[[0.06, 0], [0.06, 1]], [[0.54, 0], [0.54, 1]], [[0.06, 0.5], [0.54, 0.5]]] },
  I: { w: 0.14, s: [[[0.07, 0], [0.07, 1]]] },
  K: { w: 0.58, s: [[[0.06, 0], [0.06, 1]], [[0.54, 0], [0.06, 0.62]], [[0.24, 0.44], [0.56, 1]]] },
  L: { w: 0.5, s: [[[0.06, 0], [0.06, 1], [0.48, 1]]] },
  M: { w: 0.72, s: [[[0.06, 1], [0.06, 0], [0.36, 0.62], [0.66, 0], [0.66, 1]]] },
  N: { w: 0.6, s: [[[0.06, 1], [0.06, 0], [0.54, 1], [0.54, 0]]] },
  O: { w: 0.66, s: [arc(0.33, 0.5, 0.3, 0.5, 0, 360, 18)] },
  P: { w: 0.56, s: [bowlP] },
  R: { w: 0.58, s: [bowlP, [[0.3, 0.52], [0.56, 1]]] },
  S: { w: 0.58, s: [[...arc(0.29, 0.255, 0.25, 0.255, -25, -270, 12), ...arc(0.29, 0.75, 0.27, 0.25, -90, 155, 12).slice(1)]] },
  T: { w: 0.6, s: [[[0.02, 0], [0.58, 0]], [[0.3, 0], [0.3, 1]]] },
  U: { w: 0.6, s: [[[0.06, 0], [0.06, 0.68], ...arc(0.3, 0.68, 0.24, 0.32, 180, 0, 10).slice(1), [0.54, 0]]] },
  V: { w: 0.6, s: [[[0.02, 0], [0.3, 1], [0.58, 0]]] },
  Y: { w: 0.6, s: [[[0.02, 0], [0.3, 0.52], [0.58, 0]], [[0.3, 0.52], [0.3, 1]]] },
};
const TRACK = 0.2;
export const textWidth = (str, h) => ([...str].reduce((s, ch) => s + (GLYPHS[ch]?.w ?? 0.5) + TRACK, 0) - TRACK) * h;
// 一行字：x, y 是左上角（米），h 是字高；align 'left' | 'center' | 'right'
export function text(fill, str, x, y, h, { stroke = 0.13, align = 'left', ...style } = {}) {
  const width = textWidth(str, h);
  let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const sw = stroke * h;
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (!g) throw new Error(`细线字体里没有 “${ch}”`);
    const segs = [];
    for (const line of g.s ?? []) for (let i = 0; i + 1 < line.length; i++) {
      segs.push([[cx + line[i][0] * h, y + line[i][1] * h], [cx + line[i + 1][0] * h, y + line[i + 1][1] * h]]);
    }
    const dots = (g.dots ?? []).map(([dx, dy]) => [cx + dx * h, y + dy * h]);
    if (segs.length || dots.length) {
      fill((px, py) => {
        let d = Infinity;
        for (const [a, b] of segs) d = Math.min(d, sdSeg(px, py, a, b, sw));
        for (const [dx, dy] of dots) d = Math.min(d, Math.hypot(px - dx, py - dy) - sw * 0.75);
        return d;
      }, [cx - sw, y - sw, cx + g.w * h + sw, y + h + sw], style);
    }
    cx += (g.w + TRACK) * h;
  }
  return width;
}
// 规则六边形（上下是平边）：外接圆半径 R
const sdHex = (x, y, cx, cy, R) => {
  const ax = Math.abs(x - cx), ay = Math.abs(y - cy), a = R * Math.cos(Math.PI / 6);
  return Math.max(ay, ax * Math.cos(Math.PI / 6) + ay * 0.5) - a;
};
// 心形（心率图标）：两个圆 + 一个倒三角
const sdHeart = (x, y, cx, cy, s) => {
  const l = Math.hypot(x - (cx - s * 0.5), y - (cy - s * 0.2)) - s * 0.52;
  const r = Math.hypot(x - (cx + s * 0.5), y - (cy - s * 0.2)) - s * 0.52;
  const t = sdPoly(x, y, [[cx - s * 0.98, cy - s * 0.05], [cx + s * 0.98, cy - s * 0.05], [cx, cy + s]]);
  return Math.min(l, r, t);
};

// ——————————————————————— 跑步机屏幕上的画面 ———————————————————————
// 一帧“晨跑”的风景视频：天边的朝霞和太阳、三层远近不同的山（越远越淡、越偏蓝）、林子、草地，
// 一条弯弯的小路伸向远方（近宽远窄，中间一道虚线，越远虚线越密），路两边几棵杉树（越远越小）。
// u, v ∈ [0, 1]（v 向下），aspect = 宽 / 高
function scenery(P, aspect) {
  const n1 = perlin(P.seed + 1), n2 = perlin(P.seed + 2), n3 = perlin(P.seed + 3), n4 = perlin(P.seed + 4), n5 = perlin(P.seed + 5);
  const rnd = mulberry(P.seed + 6);
  const vh = 0.53; // 路消失的高度（地平线）
  const road = (s) => ({ hw: 0.004 + 0.3 * s, uc: 0.5 + 0.13 * (1 - s) * (1 - s) + 0.05 * Math.sin(5.5 * (1 - s)) * (1 - s) });
  const trees = [];
  for (let i = 0; i < 14; i++) {
    const s = 0.08 + 0.85 * rnd() ** 1.6, side = i % 2 ? 1 : -1;
    const { hw, uc } = road(s);
    trees.push({ s, u: uc + side * (hw * (1.5 + rnd() * 1.4) + 0.01), h: 0.05 + 0.34 * s, w: 0.018 + 0.09 * s });
  }
  trees.sort((a, b) => a.s - b.s); // 远的先画
  const sky0 = rgb([70, 120, 192]), sky1 = rgb([250, 206, 160]);
  const haze = rgb([214, 190, 186]);
  return (u, v) => {
    // 天空：朝霞渐变 + 太阳的光晕 + 几缕云
    let c = mix3(sky0, sky1, Math.pow(clamp01(v / 0.5), 1.7));
    const du = (u - 0.72) * aspect, dv = v - 0.43, d2 = du * du + dv * dv;
    const glow = Math.exp(-d2 / 0.003) * 0.9 + Math.exp(-d2 / 0.05) * 0.35;
    c = c.map((m, i) => Math.min(1, m + [1, 0.86, 0.62][i] * glow * 0.6));
    if (d2 < 0.018 * 0.018) c = rgb([255, 246, 224]);
    const cloud = sstep(0.1, 0.5, fbm(n5, u * 1.2, v * 4, 3, 5, 4)) * sstep(0.08, 0.2, v) * (1 - sstep(0.3, 0.42, v));
    c = mix3(c, rgb([255, 226, 204]), cloud * 0.45);
    // 三层山：远处淡、偏紫灰，近处深、偏青绿
    const far = 0.405 + 0.05 * n1(u * 3, 0.5) + 0.018 * n1(u * 11, 3.5);
    const mid = 0.455 + 0.045 * n2(u * 4 + 7, 0.5) + 0.012 * n2(u * 16, 5.5);
    const near = 0.52 + 0.025 * n3(u * 5 + 3, 0.5) + 0.012 * n3(u * 22, 2.5);
    if (v > far) c = mix3(rgb([176, 164, 186]), haze, 0.35 + 0.3 * (1 - clamp01((v - far) / 0.1)));
    if (v > mid) c = mix3(rgb([98, 118, 132]), rgb([150, 150, 164]), 0.25 * (1 - clamp01((v - mid) / 0.06)));
    if (v > near) {
      // 林子：树冠一粒一粒的
      const canopy = fbm(n4, u * 18, v * 30, 4, 4, 3);
      c = rgb([54, 90, 62]).map((m) => m * (0.85 + 0.3 * canopy));
    }
    if (v > vh) {
      const s = (v - vh) / (1 - vh);
      // 草地：近处亮、远处暗一点，有透视的横条纹
      const g = fbm(n4, u * 6, 1 / (s + 0.08), 5, 5, 3);
      const grassTop = 0.02 + 0.03 * n3(u * 8, 9.5);
      if (s > grassTop) c = mix3(rgb([84, 128, 66]), rgb([128, 170, 88]), clamp01(s * 0.8 + g * 0.3));
      // 小路：柏油路面 + 路肩 + 两边白线 + 中间虚线（越远越密）
      const { hw, uc } = road(s);
      const x = Math.abs(u - uc);
      if (x < hw * 1.1) c = mix3(rgb([176, 164, 142]), rgb([150, 140, 122]), 0.5 + 0.5 * n5(u * 60, v * 60));
      if (x < hw) {
        c = rgb([96, 96, 100]).map((m) => m * (0.92 + 0.12 * n5(u * 90, v * 140)));
        if (Math.abs(x - hw * 0.93) < hw * 0.025 + 0.0006) c = rgb([226, 226, 222]);
        const z = 1 / (s + 0.06);
        if (x < hw * 0.022 + 0.0005 && fract(z * 0.9) < 0.5) c = rgb([238, 226, 170]);
      }
    }
    // 杉树：一层层的三角形
    for (const t of trees) {
      const base = vh + t.s * (1 - vh);
      const top = base - t.h;
      if (v < top || v > base + 0.004 || Math.abs(u - t.u) * aspect > t.w) continue;
      const k = (v - top) / t.h; // 0 在树尖，1 在树底
      const tier = fract(k * 3.2);
      const half = t.w * (0.25 + 0.75 * k) * (0.55 + 0.45 * tier);
      if (Math.abs(u - t.u) * aspect < half) c = rgb([30, 62, 44]).map((m) => m * (0.8 + 0.4 * (1 - k) * t.s));
      else if (k > 0.97 && Math.abs(u - t.u) * aspect < t.w * 0.08) c = rgb([60, 44, 34]);
    }
    return c;
  };
}

// ——————————————————————— 健身器材图集 ———————————————————————
export function gymAtlas(S, P) {
  const A = GYM_ATLAS, k = S / A.size;
  const out = alloc(S, ['metal', 'emit']);
  const box = (r) => r.map((v) => Math.round(v * k));
  const nQ = perlin(P.seed);

  // —— 纯色格子 ——
  {
    const [x0, y0, x1, y1] = box(A.regions.swatch);
    const rows = Math.ceil(A.swatches.length / A.cols);
    const w = (x1 - x0) / A.cols, h = (y1 - y0) / rows;
    A.swatches.forEach((s, i) => {
      const c = rgb(s.c);
      const cx = x0 + Math.round((i % A.cols) * w), cy = y0 + Math.round(Math.floor(i / A.cols) * h);
      for (let y = cy; y < cy + Math.round(h); y++) for (let x = cx; x < cx + Math.round(w); x++) {
        put(out, y * S + x, c, 0, s.rough);
        out.metal[y * S + x] = s.metal ?? 0;
      }
    });
  }

  // —— 屏幕：风景画面整块画进颜色和自发光；上面叠一层运动数据 ——
  {
    const b = box(A.regions.screen);
    const W = A.screen.w, H = A.screen.h;
    const scene = scenery(P, W / H);
    for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) {
      const u = (x + 0.5 - b[0]) / (b[2] - b[0]), v = (y + 0.5 - b[1]) / (b[3] - b[1]);
      const c = scene(u, v);
      const q = y * S + x;
      // 防眩光的哑光屏：反射柔和，不会把画面冲白
      put(out, q, c.map((m) => m * 0.85), 0, 0.32);
      out.emit[q * 3] = c[0]; out.emit[q * 3 + 1] = c[1]; out.emit[q * 3 + 2] = c[2];
    }
    const { fill } = painter(out, S, b, W, H);
    const shade = (a) => ({ color: [0, 0, 0], emit: [0, 0, 0], alpha: a });
    const white = { color: rgb([236, 236, 236]), emit: rgb([245, 245, 245]) };
    const grey = { color: rgb([150, 152, 158]), emit: rgb([168, 170, 176]) };
    const accent = { color: rgb([236, 126, 54]), emit: rgb([255, 142, 64]) };
    // 底部的数据栏：半透明的黑底，四栏（时间、距离、速度、坡度），栏与栏之间一道细线
    const y0 = H * 0.8;
    fill((x, y) => -Math.min(y - y0, H - y, x, W - x), [0, y0, W, H], shade(0.62));
    const stats = [['TIME', '24:18'], ['KM', '4.62'], ['KM/H', '11.4'], ['INCLINE', '2.5%']];
    stats.forEach(([label, value], i) => {
      const cx = (W * (i + 0.5)) / 4;
      text(fill, label, cx, y0 + 0.0055, 0.0055, { align: 'center', stroke: 0.15, ...grey });
      text(fill, value, cx, y0 + 0.0185, 0.022, { align: 'center', stroke: 0.12, ...white });
      if (i) fill((x, y) => sdSeg(x, y, [(W * i) / 4, y0 + 0.008], [(W * i) / 4, H - 0.008], 0.0006), [(W * i) / 4 - 0.001, y0, (W * i) / 4 + 0.001, H], grey);
    });
    // 进度条：已经跑完的一段是橙色
    const py = y0 - 0.003;
    fill((x, y) => sdRoundRect(x, y, W / 2, py, W / 2, 0.0014, 0.0014), [0, py - 0.002, W, py + 0.002], { color: rgb([70, 70, 74]), emit: rgb([80, 80, 84]) });
    fill((x, y) => sdRoundRect(x, y, W * 0.31, py, W * 0.31, 0.0014, 0.0014), [0, py - 0.002, W * 0.62, py + 0.002], accent);
    fill((x, y) => Math.hypot(x - W * 0.62, y - py) - 0.0036, [W * 0.62 - 0.004, py - 0.004, W * 0.62 + 0.004, py + 0.004], accent);
    // 左上角：课程名（半透明的圆角底）
    const tw = textWidth('HILL RUN', 0.0085);
    fill((x, y) => sdRoundRect(x, y, 0.014 + tw / 2 + 0.008, 0.02, tw / 2 + 0.008, 0.0085, 0.0085), [0.006, 0.01, 0.03 + tw, 0.03], shade(0.45));
    text(fill, 'HILL RUN', 0.022, 0.0158, 0.0085, { stroke: 0.14, ...white });
    // 右上角：心率
    const hx = W - 0.064;
    fill((x, y) => sdRoundRect(x, y, W - 0.036, 0.02, 0.028, 0.0095, 0.0095), [W - 0.066, 0.01, W - 0.006, 0.03], shade(0.45));
    fill((x, y) => sdHeart(x, y, hx + 0.008, 0.0196, 0.0045), [hx, 0.013, hx + 0.016, 0.026], { color: rgb([226, 64, 74]), emit: rgb([255, 84, 96]) });
    text(fill, '148', hx + 0.017, 0.0155, 0.009, { stroke: 0.13, ...white });
    // 右上角下面：一段路线的高程图（跑过的部分实心、橙色的点是现在的位置）
    const gx0 = W - 0.11, gx1 = W - 0.012, gy0 = 0.036, gy1 = 0.066;
    fill((x, y) => sdRoundRect(x, y, (gx0 + gx1) / 2, (gy0 + gy1) / 2, (gx1 - gx0) / 2 + 0.004, (gy1 - gy0) / 2 + 0.004, 0.004), [gx0 - 0.005, gy0 - 0.005, gx1 + 0.005, gy1 + 0.005], shade(0.4));
    const elev = (t) => gy1 - 0.004 - (0.012 + 0.009 * Math.sin(t * 5.2 + 0.4) + 0.005 * Math.sin(t * 13 + 1)) ;
    const graph = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; graph.push([gx0 + (gx1 - gx0) * t, elev(t)]); }
    fill((x, y) => { const t = clamp01((x - gx0) / (gx1 - gx0)); return x < gx0 || x > gx1 ? 1 : elev(t) - y; }, [gx0, gy0, gx1 * 0.62 + gx0 * 0.38, gy1], { color: rgb([120, 124, 130]), emit: rgb([130, 134, 140]), alpha: 0.7 });
    for (let i = 0; i + 1 < graph.length; i++) {
      const a = graph[i], bb = graph[i + 1];
      fill((x, y) => sdSeg(x, y, a, bb, 0.0008), [Math.min(a[0], bb[0]) - 0.001, Math.min(a[1], bb[1]) - 0.001, Math.max(a[0], bb[0]) + 0.001, Math.max(a[1], bb[1]) + 0.001], white);
    }
    const cur = [gx0 + (gx1 - gx0) * 0.62, elev(0.62)];
    fill((x, y) => Math.hypot(x - cur[0], y - cur[1]) - 0.0024, [cur[0] - 0.003, cur[1] - 0.003, cur[0] + 0.003, cur[1] + 0.003], accent);
  }

  // —— 控制台面板：石墨色的底，左边速度、右边坡度（各一对 ▲▼ 按键），中间开始（绿）/ 停止（红）——
  {
    const b = box(A.regions.console);
    const W = A.console.w, H = A.console.h;
    for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) {
      const n = fbm(nQ, x / S, y / S, 64, 64, 2) * 0.01;
      put(out, y * S + x, rgb([46, 48, 52]).map((m) => m * (1 + n)), 0, 0.5);
    }
    const { fill } = painter(out, S, b, W, H);
    const ink = { color: rgb([176, 178, 184]) };
    const key = { color: rgb([66, 68, 74]), rough: 0.35, height: 0.6 };
    const tri = (cx, cy, up, s) => fill((x, y) => sdPoly(x, y, up ? [[cx, cy - s], [cx + s, cy + s * 0.7], [cx - s, cy + s * 0.7]] : [[cx, cy + s], [cx - s, cy - s * 0.7], [cx + s, cy - s * 0.7]]),
      [cx - s - 0.001, cy - s - 0.001, cx + s + 0.001, cy + s + 0.001], ink);
    const pair = (label, x0) => {
      text(fill, label, x0 + 0.03, 0.012, 0.0075, { align: 'center', stroke: 0.15, ...ink });
      for (const [i, up] of [[0, true], [1, false]]) {
        const cx = x0 + 0.012 + i * 0.036, cy = 0.047;
        fill((x, y) => Math.hypot(x - cx, y - cy) - 0.0135, [cx - 0.015, cy - 0.015, cx + 0.015, cy + 0.015], key);
        tri(cx, cy, up, 0.0048);
      }
    };
    pair('SPEED', 0.05);
    pair('INCLINE', W - 0.11);
    const btn = (cx, col, glyph) => {
      fill((x, y) => Math.hypot(x - cx, y - 0.043) - 0.017, [cx - 0.019, 0.024, cx + 0.019, 0.062], { color: rgb(col), rough: 0.3, height: 0.8 });
      glyph(cx);
    };
    btn(W / 2 - 0.028, [58, 168, 92], (cx) => fill((x, y) => sdPoly(x, y, [[cx - 0.004, 0.037], [cx + 0.006, 0.043], [cx - 0.004, 0.049]]), [cx - 0.006, 0.035, cx + 0.008, 0.051], { color: rgb([240, 240, 240]) }));
    btn(W / 2 + 0.028, [200, 44, 46], (cx) => fill((x, y) => sdRoundRect(x, y, cx, 0.043, 0.0045, 0.0045, 0.0008), [cx - 0.006, 0.036, cx + 0.006, 0.05], { color: rgb([240, 240, 240]) }));
    text(fill, 'START', W / 2 - 0.028, 0.066, 0.005, { align: 'center', stroke: 0.15, ...ink });
    text(fill, 'STOP', W / 2 + 0.028, 0.066, 0.005, { align: 'center', stroke: 0.15, ...ink });
  }

  // —— 哑铃头的端面：黑色橡胶，一圈凸起的六边形边框，中间白色的重量和 KG ——
  {
    const [hx0, hy0, hx1, hy1] = box(A.regions.hex);
    const c = (hx1 - hx0) / A.weights.length;
    const nR = perlin(P.seed + 20);
    A.weights.forEach((wt, i) => {
      const b = [hx0 + Math.round(i * c), hy0, hx0 + Math.round((i + 1) * c), hy1];
      for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) {
        const n = nR((x / S) * 900, (y / S) * 900) * 0.04;
        put(out, y * S + x, rgb([30, 31, 33]).map((m) => m * (1 + n)), n, 0.86);
      }
      // 这一格按“外接圆半径 = 1”作画：格子宽 = 1 / 0.45
      const U = 1 / 0.45;
      const { fill } = painter(out, S, b, U, U);
      const cx = U / 2, cy = U / 2;
      fill((x, y) => Math.abs(sdHex(x, y, cx, cy, 0.8)) - 0.035, [cx - 0.9, cy - 0.9, cx + 0.9, cy + 0.9], { color: rgb([46, 47, 50]), height: 0.6, rough: 0.8 });
      const ink = { color: rgb([226, 226, 222]), rough: 0.6, height: 0.3 };
      const h = wt.length > 2 ? 0.34 : 0.42;
      text(fill, wt, cx, cy - h * 0.78, h, { align: 'center', stroke: 0.16, ...ink });
      text(fill, 'KG', cx, cy + h * 0.4, 0.2, { align: 'center', stroke: 0.2, ...ink });
    });
  }
  return out;
}

// ——————————————————————— 跑带 ———————————————————————
// 黑色橡胶，细密的菱格防滑纹（2mm 一格）；沿跑动方向（u）有几道被磨亮的淡痕
export function belt(S, P) {
  const n = perlin(P.seed), nw = perlin(P.seed + 1);
  const out = alloc(S);
  const N = 20;
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const a = 1 - 2 * Math.abs(fract(u * N + v * N) - 0.5), b = 1 - 2 * Math.abs(fract(u * N - v * N) - 0.5);
      const h = Math.min(a, b);
      const wear = sstep(0.2, 0.8, fbm(nw, u, v, 1, 24, 3)) * 0.06;
      const k = (0.88 + 0.16 * h) * (1 + fbm(n, u, v, 4, 4, 3) * 0.05 + wear);
      put(out, y * S + x, rgb([34, 35, 37]).map((m) => m * k), h, mix(0.9, 0.7, h) - wear);
    }
  }
  return out;
}

// ——————————————————————— 滚花（哑铃握把）———————————————————————
// 45° 交叉的菱形滚花：一颗颗小金字塔，尖上亮、缝里暗一点、也粗糙一点；整张是金属
export function knurl(S, P) {
  const n = perlin(P.seed);
  const out = alloc(S, ['metal']);
  const N = 4;
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const a = 1 - 2 * Math.abs(fract(u * N + v * N) - 0.5), b = 1 - 2 * Math.abs(fract(u * N - v * N) - 0.5);
      const h = Math.min(a, b);
      const q = y * S + x;
      put(out, q, rgb([218, 220, 224]).map((m) => m * (0.78 + 0.22 * h) * (1 + n(u * 8, v * 8, 8, 8) * 0.02)), h, 0.16 + 0.26 * (1 - h));
      out.metal[q] = 1;
    }
  }
  return out;
}

// ——————————————————————— 软木（瑜伽砖）———————————————————————
// 压制软木：一粒粒 1~3mm 的软木颗粒，每粒深浅不同，颗粒之间的缝和小孔是暗的
export function cork(S, P) {
  const w1 = worley(P.seed), w2 = worley(P.seed + 1), n = perlin(P.seed + 2);
  const out = alloc(S);
  const C1 = 56, C2 = 150;
  const light = rgb([214, 170, 122]), dark = rgb([160, 110, 70]);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const a = w1(u * C1, v * C1, C1, C1), b = w2(u * C2 + 0.3, v * C2 + 0.6, C2, C2);
      let c = mix3(dark, light, clamp01(a.id * 0.8 + 0.1 + (b.id - 0.5) * 0.25));
      const seam = 1 - sstep(0.02, 0.1, a.f2 - a.f1);
      const pore = b.id < 0.05 ? 1 - sstep(0.1, 0.3, b.f1) : 0;
      const mott = fbm(n, u, v, 4, 4, 3) * 0.06;
      c = c.map((m) => m * (1 + mott) * (1 - seam * 0.28) * (1 - pore * 0.5));
      put(out, y * S + x, c, 0.6 - seam * 0.5 - pore * 0.6 + (a.id - 0.5) * 0.2, 0.86 + seam * 0.06);
    }
  }
  return out;
}

// ——————————————————————— 瑜伽垫 ———————————————————————
// 贴图布局见 YOGA：正面（鼠尾草绿、细细的颗粒、奶白色的对位线：一条中线、中间一段“梯子”、两条靠边的长线、垫头一个小圆标）、
// 背面（深一号的绿、斜向的波浪防滑纹）、最下面一窄条是切边（上半正面色、下半背面色）
export function yogaMat(S, P) {
  const n = perlin(P.seed), ng = perlin(P.seed + 1), nb = perlin(P.seed + 2);
  const out = alloc(S);
  const { L, W } = YOGA;
  const top = rgb(P.top), back = rgb(P.back), ink = rgb(P.ink);
  const [t0, t1] = YOGA.top, [b0, b1] = YOGA.bottom, [e0] = YOGA.edge;
  const pxU = L / S, pxV = W / ((t1 - t0) * S);
  // 对位线（在正面的物理坐标里：x 沿长 0 ~ L，y 横跨 0 ~ W）
  const lw = 0.003;
  const lines = [
    [[0.22, W / 2], [L - 0.22, W / 2]],
    [[0.34, W * 0.16], [L - 0.34, W * 0.16]], [[0.34, W * 0.84], [L - 0.34, W * 0.84]],
    ...[-0.3, -0.15, 0, 0.15, 0.3].map((d) => [[L / 2 + d, W * 0.36], [L / 2 + d, W * 0.64]]),
  ];
  const logo = [0.1, W / 2];
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const q = y * S + x;
      if (v < b0) {
        // 正面
        const px = u * L, py = clamp01((v - t0) / (t1 - t0)) * W;
        const grain = ng(u * 700, v * 900) * 0.035 + fbm(n, u, v, 6, 3, 3) * 0.03;
        let c = top.map((m) => m * (1 + grain));
        let d = Infinity;
        for (const [a, b] of lines) d = Math.min(d, sdSeg(px, py, a, b, lw));
        d = Math.min(d, Math.abs(Math.hypot(px - logo[0], py - logo[1]) - 0.018) - lw / 2, Math.hypot(px - logo[0], py - logo[1]) - 0.004);
        const a = clamp01(0.5 - d / Math.max(pxU, pxV));
        c = mix3(c, ink, a * 0.9);
        put(out, q, c, grain * 4 + a * 0.3, 0.74 - a * 0.1);
      } else if (v < e0) {
        // 背面：斜向的波浪纹
        const px = u * L, py = clamp01((v - b0) / (b1 - b0)) * W;
        const wave = Math.sin((px + py) * 260 + Math.sin(py * 40) * 2) * 0.5 + 0.5;
        const c = back.map((m) => m * (0.9 + 0.12 * wave) * (1 + nb(u * 300, v * 300) * 0.03));
        put(out, q, c, wave, 0.82);
      } else {
        // 切边：上半正面色、下半背面色
        const f = (v - e0) / (1 - e0);
        put(out, q, (f < 0.5 ? top : back).map((m) => m * 0.92), 0, 0.8);
      }
    }
  }
  return out;
}

// ——————————————————————— 橡胶地垫（一张贴图 = 一整块 2m 地板模块，4 × 4 块 50cm 的砖）———————————————————————
// 黑色的再生橡胶颗粒压成的地垫，混着一成左右灰色的 EPDM 彩点（偶尔一粒蓝的）；砖缝 1mm、砖边微微倒角，
// 每块砖深浅略有不同，表面哑光
export function rubberFloor(S, P) {
  const N = P.tiles, T = P.period / N, px = P.period / S;
  const wg = worley(P.seed), wf = worley(P.seed + 1), n = perlin(P.seed + 2);
  const rnd = mulberry(P.seed + 3);
  const tone = Array.from({ length: N * N }, () => 1 + (rnd() - 0.5) * 0.06);
  const base = rgb(P.base), fleck = rgb(P.fleck), blue = rgb(P.blue);
  const out = alloc(S);
  const G = Math.round(P.period / 0.0028), F = Math.round(P.period / 0.004); // 颗粒约 2.8mm、彩点约 4mm
  for (let y = 0; y < S; y++) {
    const wy = (y + 0.5) * px;
    const j = Math.min(N - 1, Math.floor(wy / T)), ty = wy - j * T;
    for (let x = 0; x < S; x++) {
      const wx = (x + 0.5) * px;
      const i = Math.min(N - 1, Math.floor(wx / T)), tx = wx - i * T;
      const u = wx / P.period, v = wy / P.period;
      const g = wg(u * G, v * G, G, G);
      // 颗粒之间的明暗差只给一点点：满屏的像素级噪点 JPEG 压不下去，远看也只是一层灰
      let c = base.map((m) => m * (0.97 + 0.06 * g.id) * tone[j * N + i]);
      let h = 0.5 + 0.3 * (1 - Math.min(1, g.f1 * 1.4));
      const f = wf(u * F + 0.37, v * F + 0.71, F, F);
      if (f.id < P.density) {
        const a = 1 - sstep(0.32, 0.46, f.f1);
        c = mix3(c, (f.id < P.density * 0.08 ? blue : fleck).map((m) => m * (0.9 + f.id)), a);
        h += a * 0.2;
      }
      c = c.map((m) => m * (1 + fbm(n, u, v, 8, 8, 3) * 0.04));
      const e = Math.min(tx, T - tx, ty, T - ty);
      const joint = 1 - sstep(P.joint / 2 - px * 0.5, P.joint / 2 + px * 0.5, e);
      const edge = 1 - sstep(P.joint / 2, P.joint / 2 + P.bevel, e);
      c = c.map((m) => m * (1 - joint * 0.6) * (1 - edge * 0.12));
      put(out, y * S + x, c, h - edge * 0.6 - joint * 0.8, 0.86 - (f.id < P.density ? 0.04 : 0));
    }
  }
  return out;
}
