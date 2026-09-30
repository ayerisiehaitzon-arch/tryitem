// 理发店的程序化贴图：理发店图集（灯柱条纹、六种瓶子、消毒液罐标签、两盒发蜡的盖子、价目牌、脚踏板、毛巾、纯色格子），
// 白色斜边地铁砖。
import { perlin, worley } from './noise.js';
import { BARBER_ATLAS } from './atlas.js';
import { sdRoundRect, sdSeg } from './laundry-textures.js';
import { text, textWidth } from './gym-textures.js';
import { BARBER_BOTTLES, arcTable } from '../barber/bottles.js';

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
// 一块区域按物理尺寸 W × H（米）作画；m：四周留出的像素（取 UV 时两头各缩进 m 像素，留边里画的是图案往外的延续）
function region(out, S, box, W, H, f, m = 0) {
  const [x0, y0, x1, y1] = box, sx = (x1 - x0 - 2 * m) / W, sy = (y1 - y0 - 2 * m) / H;
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const [c, h, r, mt, e] = f((i + 0.5 - x0 - m) / sx, (j + 0.5 - y0 - m) / sy);
    put(out, j * S + i, c, h, r, mt ?? 0, e ?? null);
  }
}
// 往区域里叠一个形状（有符号距离 sdf，bb 是它的包围盒，米）：按覆盖率混进颜色 / 粗糙度 / 高度 / 金属度
function gp(out, S, box, W, H, m = 0) {
  const [bx0, by0, bx1, by1] = box;
  const sx = (bx1 - bx0 - 2 * m) / W, sy = (by1 - by0 - 2 * m) / H, px = 1 / Math.min(sx, sy);
  return (sdf, bb, { color = null, rough = null, height = null, metal = null, alpha = 1 } = {}) => {
    const i0 = Math.max(bx0, Math.floor(bx0 + m + (bb[0] - px) * sx)), i1 = Math.min(bx1 - 1, Math.ceil(bx0 + m + (bb[2] + px) * sx));
    const j0 = Math.max(by0, Math.floor(by0 + m + (bb[1] - px) * sy)), j1 = Math.min(by1 - 1, Math.ceil(by0 + m + (bb[3] + px) * sy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = clamp01(0.5 - sdf((i + 0.5 - bx0 - m) / sx, (j + 0.5 - by0 - m) / sy) / px) * alpha;
      if (a <= 0) continue;
      const k = j * S + i;
      if (color) for (let q = 0; q < 3; q++) out.color[k * 3 + q] = mix(out.color[k * 3 + q], color[q], a);
      if (rough !== null) out.rough[k] = mix(out.rough[k], rough, a);
      if (height !== null) out.height[k] = mix(out.height[k], height, a);
      if (metal !== null) out.metal[k] = mix(out.metal[k], metal, a);
    }
  };
}
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ring = (cx, cy, r, w) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - w / 2;
const bbC = (cx, cy, r) => [cx - r, cy - r, cx + r, cy + r];
const hline = (x0, x1, y, w) => [(x, yy) => sdSeg(x, yy, [x0, y], [x1, y], w / 2), [x0 - w, y - w, x1 + w, y + w]];
// 字高按宽度收一收：str 在 h 高时超过 maxW 就缩小
const fitH = (str, h, maxW) => Math.min(h, maxW / textWidth(str, 1));

// 高度 y 在外形上对应的弧长（外形的 y 自下而上不减）
function sAtY(pts, tab, y) {
  for (let i = 1; i < pts.length; i++) {
    const y0 = pts[i - 1][1], y1 = pts[i][1];
    if (y <= y1 && y1 > y0) return tab.s[i - 1] + ((tab.s[i] - tab.s[i - 1]) * (y - y0)) / (y1 - y0);
  }
  return tab.L;
}

export function barberAtlas(S, P) {
  const A = BARBER_ATLAS, k = S / A.size, M = Math.round(2 * k);
  const out = alloc(S, true);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const size = (name) => A.sizes[name];
  const nA = perlin(P.seed + 1), nB = perlin(P.seed + 2), nC = perlin(P.seed + 3);
  const wo = worley(P.seed + 4);
  const INK = rgb([30, 28, 26]), CREAM = rgb([236, 228, 206]), RED = rgb([156, 30, 32]);

  // —— 纯色格子 ——
  {
    const [x0, y0, x1, y1] = box('swatch');
    const rows = Math.ceil(A.swatches.length / A.cols), w = (x1 - x0) / A.cols, h = (y1 - y0) / rows;
    A.swatches.forEach((s, i) => {
      const cx = x0 + Math.round((i % A.cols) * w), cy = y0 + Math.round(Math.floor(i / A.cols) * h);
      for (let y = cy; y < cy + Math.round(h); y++) for (let x = cx; x < cx + Math.round(w); x++) put(out, y * S + x, rgb(s.c), 0, s.rough, s.metal ?? 0, s.emit ? rgb(s.emit) : null);
    });
  }

  // —— 灯柱里的转筒：红、白、蓝、白四道条纹斜着绕上去（一圈升 0.3m，和水平面大约成 34°），整张都自发光 ——
  //    u 绕一圈首尾相接：条纹的相位是 x / W + y / 0.3，留边里是条纹往外的延续
  {
    const [W, H] = size('pole'), b = box('pole'), rise = 0.3;
    const bands = [[214, 34, 38], [250, 246, 238], [36, 64, 170], [250, 246, 238]].map(rgb);
    region(out, S, b, W, H, (x, y) => {
      const t = fract(x / W + y / rise) * 4, i = Math.floor(t), f = t - i;
      // 条纹之间窄窄的一道过渡（印刷的边不是刀切的）
      const edge = sstep(0.97, 1, f);
      const c = mix3(bands[i % 4], bands[(i + 1) % 4], edge);
      const g = 0.97 + 0.03 * nA((x / W) * 60, y * 200, 60, 4096);
      return [mul(c, g), 0, 0.45, 0, mul(c, 0.85 * g)];
    }, M);
  }

  // —— 瓶子：每格按物理尺寸画 —— 宽 = 最粗处的一圈周长，高 = 外形全长（图的上沿是瓶盖顶）。
  //    瓶身带一点颜色和两道竖的高光（gloss 控制强弱：玻璃瓶亮、塑料瓶和铁皮罐淡），液面以下叠上液体的颜色、液面一道亮线，
  //    瓶盖一种颜色，正面一张标签：细边框、上面一行小字、中间名字、下面一行说明；绕满一圈的标签（爽身粉罐）只画上下两道色带
  {
    const [bx0, by0, bx1, by1] = box('bottles'), cw = (bx1 - bx0) / A.bottleCols, ch = (by1 - by0) / A.bottleRows;
    BARBER_BOTTLES.forEach((b, bi) => {
      const cell = [bx0 + Math.round((bi % A.bottleCols) * cw), by0 + Math.round(Math.floor(bi / A.bottleCols) * ch), bx0 + Math.round(((bi % A.bottleCols) + 1) * cw), by0 + Math.round((Math.floor(bi / A.bottleCols) + 1) * ch)];
      const tab = arcTable(b.pts), L = tab.L, rmax = Math.max(...b.pts.map((p) => p[0])), C = 2 * Math.PI * rmax;
      const glass = rgb(b.glass), liquid = b.liquid ? rgb(b.liquid) : null, cap = rgb(b.capColor);
      const sCap = sAtY(b.pts, tab, b.cap), sFill = sAtY(b.pts, tab, b.fill);
      region(out, S, cell, C, L, (X, Y) => {
        const s = L - Y, u = X / C;
        const grain = nA(u * 60, s * 300) * 0.5 + nB(u * 8, s * 40) * 0.5;
        if (s >= sCap) return b.capMetal ? [mul(cap, 0.94 + 0.06 * grain), 0.1 * grain, 0.2, 1] : [mul(cap, 0.92 + 0.1 * grain), 0.2 * grain, 0.4, 0.1];
        let c = mul(glass, 0.9 + 0.06 * grain);
        if (liquid && s < sFill) c = mix3(c, mul(liquid, 0.8), 0.72);
        if (liquid) c = mix3(c, add(c, 0.18), Math.exp(-(((s - sFill) / 0.0012) ** 2)));
        const hi = b.gloss * (0.38 * Math.exp(-(((u - 0.38) / 0.016) ** 2)) + 0.22 * Math.exp(-(((u - 0.63) / 0.006) ** 2)));
        return [add(c, hi), 0, b.gloss > 0.8 ? 0.08 : 0.3];
      });
      const fill = gp(out, S, cell, C, L);
      const paper = rgb(b.paper), ink = rgb(b.ink), accent = rgb(b.accent);
      const ly0 = L - sAtY(b.pts, tab, b.label[1]), ly1 = L - sAtY(b.pts, tab, b.label[0]), lh = ly1 - ly0;
      const full = b.label[2] >= 1, lw = full ? C * 0.5 : b.label[2] * C;
      if (full) {
        fill((x, y) => Math.abs(y - (ly0 + ly1) / 2) - lh / 2, [0, ly0, C, ly1], { color: paper, rough: 0.35, height: 0 });
        for (const yy of [ly0 + 0.006, ly1 - 0.006]) fill(...hline(-0.01, C + 0.01, yy, 0.008), { color: accent, rough: 0.35 });
      } else {
        fill((x, y) => sdRoundRect(x, y, C / 2, (ly0 + ly1) / 2, lw / 2, lh / 2, 0.002), [C / 2 - lw / 2, ly0, C / 2 + lw / 2, ly1], { color: paper, rough: 0.7, height: 0.2, metal: 0 });
        fill((x, y) => Math.abs(sdRoundRect(x, y, C / 2, (ly0 + ly1) / 2, lw / 2 - 0.004, lh / 2 - 0.004, 0.0015)) - 0.0004, [C / 2 - lw / 2, ly0, C / 2 + lw / 2, ly1], { color: accent });
      }
      const nameH = fitH(b.name, lh * 0.24, lw * 0.8), subH = fitH(b.sub, lh * 0.09, lw * 0.6), lineH = fitH(b.line, lh * 0.09, lw * 0.7);
      text(fill, b.sub, C / 2, ly0 + lh * 0.2 - subH / 2, subH, { align: 'center', stroke: 0.16, color: ink });
      fill(...hline(C / 2 - lw * 0.22, C / 2 + lw * 0.22, ly0 + lh * 0.31, 0.0006), { color: accent });
      text(fill, b.name, C / 2, ly0 + lh * 0.54 - nameH / 2, nameH, { align: 'center', stroke: 0.17, color: ink });
      fill(...hline(C / 2 - lw * 0.22, C / 2 + lw * 0.22, ly0 + lh * 0.72, 0.0006), { color: accent });
      text(fill, b.line, C / 2, ly0 + lh * 0.82 - lineH / 2, lineH, { align: 'center', stroke: 0.16, color: ink });
    });
  }

  // —— 消毒液罐的标签：白底，上下两道蓝边，TRYITEM / DISINFECTANT / FOR COMBS AND TOOLS ——
  {
    const [W, H] = size('jarLabel'), b = box('jarLabel'), fill = gp(out, S, b, W, H), blue = rgb([24, 70, 160]);
    region(out, S, b, W, H, (x, y) => [mul(rgb([242, 242, 238]), 0.98 + 0.03 * nC(x * 400, y * 400)), 0, 0.4, 0]);
    for (const yy of [0.0025, H - 0.0025]) fill(...hline(-0.01, W + 0.01, yy, 0.002), { color: blue });
    text(fill, 'TRYITEM', W / 2, 0.0042, fitH('TRYITEM', 0.0044, W * 0.5), { align: 'center', stroke: 0.16, color: blue });
    const mh = fitH('DISINFECTANT', 0.0102, W * 0.8);
    text(fill, 'DISINFECTANT', W / 2, 0.0104, mh, { align: 'center', stroke: 0.18, color: blue });
    text(fill, 'FOR COMBS AND TOOLS', W / 2, 0.0104 + mh + 0.0022, fitH('FOR COMBS AND TOOLS', 0.0038, W * 0.66), { align: 'center', stroke: 0.15, color: blue });
  }

  // —— 两盒发蜡的盖子（印刷的铁皮盖）：红底奶油色字 POMADE，黑底金字 HAIR WAX ——
  for (const [name, bg, ink, main, sub] of [['pomadeA', [176, 32, 34], [240, 228, 200], 'POMADE', 'STRONG HOLD'], ['pomadeB', [22, 22, 24], [214, 180, 108], 'HAIR WAX', 'MATTE FINISH']]) {
    const [W, H] = size(name), b = box(name), c = W / 2, fill = gp(out, S, b, W, H), col = rgb(ink);
    region(out, S, b, W, H, (x, y) => {
      const g = nC(x * 500, y * 500) * 0.5 + nA(x * 80, y * 80) * 0.5;
      return [mul(rgb(bg), 0.96 + 0.05 * g), 0, 0.3, 0.3];
    });
    fill(ring(c, c, 0.0385, 0.0014), bbC(c, c, 0.04), { color: col, height: 0.3 });
    fill(ring(c, c, 0.035, 0.0006), bbC(c, c, 0.036), { color: col });
    text(fill, 'TRYITEM', c, c - 0.02, fitH('TRYITEM', 0.0068, 0.04), { align: 'center', stroke: 0.16, color: col });
    const mh = fitH(main, 0.0135, 0.058);
    text(fill, main, c, c - mh / 2, mh, { align: 'center', stroke: 0.18, color: col });
    text(fill, sub, c, c + 0.0125, fitH(sub, 0.0052, 0.042), { align: 'center', stroke: 0.15, color: col });
  }

  // —— 价目牌：奶油色的搪瓷牌，暗红色的边框，TRYITEM BARBERSHOP / EST. 1926，五行价目（名字、点线、价钱），
  //    四角四颗螺丝，边角几处崩掉的搪瓷露出下面的黑铁 ——
  {
    const [W, H] = size('sign'), b = box('sign'), fill = gp(out, S, b, W, H);
    region(out, S, b, W, H, (x, y) => {
      const g = nA(x * 60, y * 60) * 0.5 + nB(x * 300, y * 300) * 0.5;
      const e = Math.min(x, W - x, y, H - y);
      // 崩瓷：只在离边 1.4cm 以内、噪声够高的地方
      const chip = e < 0.014 && wo(x * 90, y * 90).f1 < 0.22 && nC(x * 25, y * 25) > 0.35;
      if (chip) return [rgb([34, 34, 38]), -0.6, 0.7, 0.3];
      return [mul(CREAM, 0.97 + 0.04 * g), 0.1 * g, 0.16, 0];
    });
    const frame = (inset, w) => [(x, y) => Math.abs(sdRoundRect(x, y, W / 2, H / 2, W / 2 - inset, H / 2 - inset, 0.012)) - w / 2, [0, 0, W, H]];
    fill(...frame(0.014, 0.008), { color: RED, height: 0.2 });
    fill(...frame(0.026, 0.0015), { color: RED });
    const hh = fitH('TRYITEM BARBERSHOP', 0.028, W * 0.78);
    text(fill, 'TRYITEM BARBERSHOP', W / 2, 0.033, hh, { align: 'center', stroke: 0.18, color: RED });
    text(fill, 'EST. 1926', W / 2, 0.033 + hh + 0.009, 0.0105, { align: 'center', stroke: 0.16, color: INK });
    fill(...hline(0.07, W - 0.07, 0.101, 0.0012), { color: RED });
    const rows = [['HAIRCUT', '25'], ['SKIN FADE', '30'], ['HOT TOWEL SHAVE', '20'], ['BEARD TRIM', '15'], ['KIDS CUT', '18']];
    const th = 0.017, x0 = 0.07, x1 = W - 0.07;
    rows.forEach(([name, price], i) => {
      const y = 0.114 + i * 0.031;
      text(fill, name, x0, y, th, { stroke: 0.17, color: INK });
      text(fill, price, x1, y, th, { align: 'right', stroke: 0.17, color: INK });
      const a = x0 + textWidth(name, th) + 0.012, bEnd = x1 - textWidth(price, th) - 0.012;
      for (let x = a; x < bEnd; x += 0.009) fill(circle(x, y + th * 0.85, 0.0011), bbC(x, y + th * 0.85, 0.0012), { color: INK });
    });
    for (const [x, y] of [[0.007, 0.007], [W - 0.007, 0.007], [0.007, H - 0.007], [W - 0.007, H - 0.007]]) {
      fill(circle(x, y, 0.0036), bbC(x, y, 0.004), { color: rgb([210, 212, 216]), metal: 1, rough: 0.3, height: 0.9 });
      fill((xx, yy) => sdSeg(xx, yy, [x - 0.0026, y], [x + 0.0026, y], 0.0005), [x - 0.003, y - 0.001, x + 0.003, y + 0.001], { color: rgb([60, 60, 64]), height: 0.4 });
    }
  }

  // —— 理发椅的脚踏板：镀铬的铸件，四边一圈平的边，中间凸起的菱格；正中一块椭圆的铭牌（黑底、凸起的 TRYITEM）——
  {
    const [W, H] = size('footplate'), b = box('footplate'), fill = gp(out, S, b, W, H), c = [W / 2, H / 2];
    const oval = (x, y, a, bb) => (Math.hypot((x - c[0]) / a, (y - c[1]) / bb) - 1) * Math.min(a, bb);
    region(out, S, b, W, H, (x, y) => {
      const e = Math.min(x, W - x, y, H - y);
      const g = nA(x * 200, y * 200) * 0.5 + 0.5;
      if (e < 0.014) return [mul(rgb([226, 228, 232]), 0.96 + 0.04 * g), 0.8 * sstep(0, 0.004, e), 0.12, 1];
      const P = 0.022, a = (x + y) / P, bb = (x - y) / P;
      const d = Math.min(Math.abs(fract(a) - 0.5), Math.abs(fract(bb) - 0.5)) * P;   // 离菱格棱线的距离
      const rib = sstep(0.0028, 0.0012, d);
      // 凹下去的格子里积着一点灰，比凸起的棱暗、也更粗糙
      return [mul(rgb([150, 152, 158]), (0.8 + 0.4 * rib) * (0.95 + 0.05 * g)), 0.6 * rib, 0.32 - 0.2 * rib, 1];
    });
    fill((x, y) => oval(x, y, 0.08, 0.034), [c[0] - 0.08, c[1] - 0.034, c[0] + 0.08, c[1] + 0.034], { color: rgb([230, 232, 236]), height: 0.9, rough: 0.12, metal: 1 });
    fill((x, y) => oval(x, y, 0.071, 0.026), [c[0] - 0.071, c[1] - 0.026, c[0] + 0.071, c[1] + 0.026], { color: rgb([22, 22, 24]), height: 0.3, rough: 0.35, metal: 0 });
    const th = fitH('TRYITEM', 0.022, 0.11);
    text(fill, 'TRYITEM', c[0], c[1] - th / 2, th, { align: 'center', stroke: 0.19, color: rgb([232, 234, 238]), metal: 1, rough: 0.12, height: 1 });
  }

  // —— 毛巾：白色的毛圈（一个个小圈的高低起伏），靠一头一红一藏青两道彩条（周期 0.3m，可以平铺）——
  {
    const [W, H] = size('towel'), b = box('towel');
    const red = rgb([176, 34, 38]), navy = rgb([36, 46, 86]);
    region(out, S, b, W, H, (x, y) => {
      const loops = wo((x / W) * 150, (y / H) * 150, 150, 150), f = sstep(0.05, 0.5, loops.f1);
      const g = nA((x / W) * 20, (y / H) * 20, 20, 20) * 0.5 + 0.5;
      let c = rgb([242, 240, 234]);
      if (y > 0.24 && y < 0.254) c = red;
      else if (y > 0.262 && y < 0.276) c = navy;
      return [mul(c, (0.86 + 0.14 * (1 - f)) * (0.96 + 0.05 * g)), 1 - f, 0.95, 0];
    });
  }
  return out;
}

// ——————————————————————— 白色斜边地铁砖 ———————————————————————
// 周期 1 × 0.6m（整除 2m 宽的墙模块）：一行 7 块（14.3cm 长）、8 行（7.5cm 高），每行错开半块；
// 砖面是亮釉（很低的粗糙度、一点点起伏），四边 6mm 的斜边，灰缝 2.5mm、深灰色；每块砖的白略有不同
export function subway(S, P) {
  const out = alloc(S), n = perlin(P.seed), n2 = perlin(P.seed + 1);
  const W = 1, H = 0.6, NC = 7, NR = 8, TL = W / NC, TH = H / NR, J = 0.0025, BEV = 0.006;
  const rnd = (i, j) => fract(Math.sin(i * 127.1 + j * 311.7 + P.seed * 0.13) * 43758.5453);
  region(out, S, [0, 0, S, S], W, H, (x, y) => {
    const row = Math.floor(y / TH), off = row % 2 ? TL / 2 : 0;
    const bx = x + off, col = Math.floor(bx / TL), cm = ((col % NC) + NC) % NC;
    const lx = bx - col * TL, ly = y - row * TH;
    // 离灰缝的距离（砖面内是正的）
    const d = Math.min(lx - J / 2, TL - J / 2 - lx, ly - J / 2, TH - J / 2 - ly);
    const u = x / W, v = y / H;
    const sand = 0.5 * n(u * 500, v * 300, 500, 300) + 0.5 * n(u * 90, v * 54, 90, 54);
    if (d < 0) return [mul(rgb([96, 96, 98]), 0.92 + 0.1 * sand), -0.6 + 0.05 * sand, 0.9];
    const t = rnd(cm, row % NR);
    // 斜边：从灰缝边上往里 6mm 抬到砖面，截面是一段圆滑的斜坡
    const bevel = sstep(0, BEV, d);
    const wave = 0.06 * n2(u * 30 + cm * 2.3, v * 18 + row * 1.7, 30, 18);
    const c = mul(rgb([236, 236, 232]), (0.975 + 0.035 * t) * (0.985 + 0.015 * sand) * (0.93 + 0.07 * bevel));
    return [c, -0.35 + 1.35 * bevel + wave * bevel, 0.07 + 0.05 * (1 - bevel)];
  });
  return out;
}
