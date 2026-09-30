// 酒吧的程序化贴图：酒吧图集（十二种酒瓶的瓶身展开、柠檬和青柠的皮与切面、一块拼木小砧板、纯色格子），红砖墙。
import { perlin, fbm, mulberry, worley } from './noise.js';
import { BAR_ATLAS } from './atlas.js';
import { sdRoundRect } from './laundry-textures.js';
import { text, textWidth } from './gym-textures.js';
import { BOTTLES, arcTable } from '../bar/bottles.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const add = (c, k) => [c[0] + k, c[1] + k, c[2] + k];
const fract = (x) => x - Math.floor(x);

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
function region(out, S, box, W, H, f) {
  const [x0, y0, x1, y1] = box, sx = (x1 - x0) / W, sy = (y1 - y0) / H;
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const [c, h, r, m, e] = f((i + 0.5 - x0) / sx, (j + 0.5 - y0) / sy);
    put(out, j * S + i, c, h, r, m ?? 0, e ?? null);
  }
}
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

// 高度 y 在外形上对应的弧长（外形的 y 自下而上不减）
function sAtY(pts, tab, y) {
  for (let i = 1; i < pts.length; i++) {
    const y0 = pts[i - 1][1], y1 = pts[i][1];
    if (y <= y1 && y1 > y0) return tab.s[i - 1] + ((tab.s[i] - tab.s[i - 1]) * (y - y0)) / (y1 - y0);
  }
  return tab.L;
}

export function barAtlas(S, P) {
  const A = BAR_ATLAS, k = S / A.size;
  const out = alloc(S, true);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nA = perlin(P.seed + 1), nB = perlin(P.seed + 2), nC = perlin(P.seed + 3);
  const wo = worley(P.seed + 4);

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

  // —— 酒瓶：每格按物理尺寸画 —— 宽 = 最粗处的一圈周长，高 = 外形全长（图的上沿是瓶盖顶）。
  //    玻璃带一点颜色和两道竖的高光（不透明的瓶子靠它看起来像玻璃），液面以下叠上酒色、液面一道亮线，
  //    瓶盖 / 锡封一种颜色，正面一张酒标：细边框、上面一行小字的牌子、中间酒名、下面年份 / 度数
  {
    const [bx0, by0, bx1, by1] = box('bottles'), cw = (bx1 - bx0) / A.bottleCols, ch = (by1 - by0) / A.bottleRows;
    BOTTLES.forEach((b, bi) => {
      const cell = [bx0 + Math.round((bi % A.bottleCols) * cw), by0 + Math.round(Math.floor(bi / A.bottleCols) * ch), bx0 + Math.round(((bi % A.bottleCols) + 1) * cw), by0 + Math.round((Math.floor(bi / A.bottleCols) + 1) * ch)];
      const tab = arcTable(b.pts), L = tab.L, rmax = Math.max(...b.pts.map((p) => p[0])), C = 2 * Math.PI * rmax;
      const glass = rgb(b.glass), liquid = b.liquid ? rgb(b.liquid) : null, cap = rgb(b.capColor);
      const capMetal = b.capColor[0] > 180 && b.capColor[2] < 130 ? 1 : 0.2;
      const sCap = sAtY(b.pts, tab, b.cap), sFill = sAtY(b.pts, tab, b.fill);
      region(out, S, cell, C, L, (X, Y) => {
        const s = L - Y, u = X / C;
        const grain = nA(u * 60, s * 300) * 0.5 + nB(u * 8, s * 40) * 0.5;
        if (s >= sCap) return [mul(cap, 0.92 + 0.1 * grain), 0.2 * grain, 0.4, capMetal];
        let c = mul(glass, 0.9 + 0.06 * grain), r = 0.08;
        if (liquid && s < sFill) c = mix3(c, mul(liquid, 0.8), 0.72);
        if (liquid) c = mix3(c, add(c, 0.18), Math.exp(-(((s - sFill) / 0.0012) ** 2)));
        const hi = 0.38 * Math.exp(-(((u - 0.38) / 0.016) ** 2)) + 0.22 * Math.exp(-(((u - 0.63) / 0.006) ** 2));
        return [add(c, hi), 0, r];
      });
      // 酒标
      const fill = gp(out, S, cell, C, L);
      const lw = b.label[2] * C, lx0 = C / 2 - lw / 2, lx1 = C / 2 + lw / 2;
      const ly0 = L - sAtY(b.pts, tab, b.label[1]), ly1 = L - sAtY(b.pts, tab, b.label[0]), lh = ly1 - ly0;
      const paper = rgb(b.paper), ink = rgb(b.ink);
      fill((x, y) => sdRoundRect(x, y, C / 2, (ly0 + ly1) / 2, lw / 2, lh / 2, 0.002), [lx0, ly0, lx1, ly1], { color: paper, rough: 0.7, height: 0.2, metal: 0 });
      fill((x, y) => Math.abs(sdRoundRect(x, y, C / 2, (ly0 + ly1) / 2, lw / 2 - 0.004, lh / 2 - 0.004, 0.0015)) - 0.0004, [lx0, ly0, lx1, ly1], { color: ink });
      // 字高按标签的高和宽两头取小：窄长的标签上字不会顶到边框
      const fit = (str, hMax, share) => Math.min(hMax, (lw * share) / textWidth(str, 1));
      const nameH = fit(b.name, lh * 0.26, 0.8), subH = fit(b.sub, lh * 0.1, 0.62), yearH = fit(b.year, lh * 0.1, 0.62);
      text(fill, b.sub, C / 2, ly0 + lh * 0.19 - subH / 2, subH, { align: 'center', stroke: 0.16, color: ink });
      fill((x, y) => Math.abs(y - (ly0 + lh * 0.31)) - 0.0003, [C / 2 - lw * 0.25, ly0 + lh * 0.3, C / 2 + lw * 0.25, ly0 + lh * 0.32], { color: ink });
      text(fill, b.name, C / 2, ly0 + lh * 0.55 - nameH / 2, nameH, { align: 'center', stroke: 0.17, color: ink });
      text(fill, b.year, C / 2, ly0 + lh * 0.83 - yearH / 2, yearH, { align: 'center', stroke: 0.16, color: ink });
    });
  }

  // —— 柠檬 / 青柠：果皮（一粒粒油胞）和切面（一瓣瓣果肉、白色的瓤、外面一圈皮）——
  for (const [name, peel, flesh] of [['lemon', [238, 200, 60], [246, 226, 120]], ['lime', [112, 160, 48], [196, 214, 110]]]) {
    region(out, S, box(`${name}Peel`), 1, 1, (u, v) => {
      const c = wo(u * 40, v * 40, 40, 40), pore = sstep(0.35, 0.1, c.f1);
      return [mul(rgb(peel), 0.92 + 0.08 * nA(u * 8, v * 8, 8, 8) - 0.08 * pore), 0.5 - pore * 0.6, 0.45];
    });
    region(out, S, box(`${name}Cut`), 1, 1, (u, v) => {
      const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2, a = Math.atan2(dy, dx);
      if (r > 0.97) return [mul(rgb(peel), 0.9), 0.3, 0.5];
      if (r > 0.86) return [rgb([248, 244, 226]), 0.4, 0.6];
      const seg = 10, f = fract((a / (2 * Math.PI)) * seg + 0.5), mem = sstep(0.06, 0.02, Math.min(f, 1 - f)) * sstep(0.1, 0.25, r);
      const pulp = 0.85 + 0.15 * nB(u * 60, v * 60) + 0.1 * Math.sin(r * 90 + a * 3);
      const c = mix3(mul(rgb(flesh), pulp), rgb([250, 246, 228]), Math.max(mem, sstep(0.14, 0.05, r)));
      return [c, 0.5 - 0.5 * mem, 0.2];
    });
  }

  // —— 小砧板：枫木和胡桃木一条条拼起来 ——
  {
    const { w: W, d: D } = A.board;
    region(out, S, box('board'), W, D, (x, y) => {
      const strip = Math.floor(x / 0.025), dark = strip % 3 === 1;
      const g = nA(strip * 7.3 + y * 6, x * 400) * 0.5 + nB(x * 60, y * 8) * 0.5;
      const base = dark ? rgb([96, 64, 42]) : rgb([218, 186, 140]);
      const joint = sstep(0.0008, 0.0003, Math.min(fract(x / 0.025), 1 - fract(x / 0.025)) * 0.025);
      return [mul(base, 0.9 + 0.12 * g - 0.3 * joint), 0.2 * g - joint, 0.6];
    });
  }
  return out;
}

// ——————————————————————— 红砖墙 ———————————————————————
// 周期 1 × 0.6m：一块砖 24 × 6.5cm、灰缝 1cm，每层错半块（顺砖砌法），四块宽、八层高（三十二块砖各不相同）；
// 每块砖颜色不一样（红、橘红、深褐，偶尔一块发黑的过火砖），表面有砂眼、边角略圆；灰缝是凹进去的浅灰砂浆
export function brick(S, P) {
  const out = alloc(S), n = perlin(P.seed), rnd = mulberry(P.seed + 1);
  const W = 1, H = 0.6, BL = 0.25, CH = 0.075, J = 0.01, NC = 4, NR = 8;
  const pal = [[150, 64, 44], [168, 78, 50], [134, 56, 40], [176, 96, 64], [120, 58, 42], [158, 84, 58], [96, 44, 34]];
  const bricks = Array.from({ length: NC * NR }, () => ({ c: pal[Math.floor(rnd() * pal.length)], k: 0.9 + 0.2 * rnd(), soot: rnd() < 0.15 ? 0.35 * rnd() : 0 }));
  region(out, S, [0, 0, S, S], W, H, (x, y) => {
    const row = Math.floor(y / CH), off = row % 2 ? BL / 2 : 0;
    const bx = x + off, col = Math.floor(bx / BL), cm = col % NC;   // 奇数行最右边那半块和最左边的是同一块（平铺接得上）
    const lx = bx - col * BL, ly = y - row * CH;
    const b = bricks[cm + (row % NR) * NC];
    // 离灰缝的距离（砖面内是正的）
    const d = Math.min(lx - J / 2, BL - J / 2 - lx, ly - J / 2, CH - J / 2 - ly);
    const u = x / W, v = y / H;
    const sand = 0.5 * n(u * 600, v * 360, 600, 360) + 0.5 * n(u * 120, v * 72, 120, 72);
    if (d < 0) return [mul(rgb([186, 178, 164]), 0.9 + 0.12 * sand), -1 + 0.1 * sand, 1];
    const edge = sstep(0, 0.004, d);
    const pits = n(u * 1800, v * 1080, 1800, 1080) > 0.55 ? 0.3 : 0;
    const face = 0.5 * n(u * 120 + cm * 3.1, v * 72 + row * 1.7, 120, 72) + 0.3 * fbm(n, u, v, 10, 6, 3);
    const mottle = n(u * 40 + cm * 5.3, v * 24 + row * 2.9, 40, 24);
    let c = mul(rgb(b.c), b.k * (0.88 + 0.2 * face + 0.08 * mottle) * (1 - 0.12 * pits));
    c = mix3(c, rgb([40, 30, 26]), b.soot * (0.6 + 0.4 * face));
    return [c, -1 + 2 * edge - 0.3 * pits + 0.15 * face, 0.95];
  });
  return out;
}
