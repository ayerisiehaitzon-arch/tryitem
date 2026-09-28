// 健身房二的程序化贴图：器材图集（单车触摸屏、划船机液晶表、配重片、刻度条、贴标、纯色格子）。
import { perlin, mulberry } from './noise.js';
import { GYM2_ATLAS } from './atlas.js';
import { painter, sdRoundRect, sdSeg, sdPoly } from './laundry-textures.js';
import { text, textWidth } from './gym-textures.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

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
// 一块区域上的 SDF 作画器（W × H 米，y 向下）
const areaPainter = (out, S, box, m, W, H) => painter(out, S, [box[0] + m, box[1] + m, box[2] - m, box[3] - m], W, H);
// 屏幕上的颜色：颜色图和自发光各一份（亮的地方颜色图也亮一点）
const lit = (c) => ({ color: mul(c, 0.8), emit: c });

// 七段数码（液晶表）：x, y 左上角，w × h 一位；段宽 st
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd' };
function segDigit(fill, ch, x, y, w, h, st, on, off) {
  const P = {
    a: [[x + st, y], [x + w - st, y]], d: [[x + st, y + h], [x + w - st, y + h]], g: [[x + st, y + h / 2], [x + w - st, y + h / 2]],
    f: [[x, y + st], [x, y + h / 2 - st]], b: [[x + w, y + st], [x + w, y + h / 2 - st]],
    e: [[x, y + h / 2 + st], [x, y + h - st]], c: [[x + w, y + h / 2 + st], [x + w, y + h - st]],
  };
  const sk = (p) => [p[0] + (h - (p[1] - y)) * 0.1, p[1]];
  for (const s of 'abcdefg') {
    const [a, b] = P[s].map(sk);
    fill((px, py) => sdSeg(px, py, a, b, st * 0.9), [Math.min(a[0], b[0]) - st, Math.min(a[1], b[1]) - st, Math.max(a[0], b[0]) + st, Math.max(a[1], b[1]) + st],
      SEG[ch].includes(s) ? on : off);
  }
}
function segText(fill, str, x, y, w, h, st, on, off) {
  let cx = x;
  for (const ch of str) {
    if (ch === ':' || ch === '.') {
      const dots = ch === ':' ? [y + h * 0.3, y + h * 0.72] : [y + h];
      for (const dy of dots) fill((px, py) => Math.hypot(px - cx - st, py - dy) - st * 0.7, [cx, dy - st, cx + 2 * st, dy + st], on);
      cx += st * 2.6;
      continue;
    }
    segDigit(fill, ch, cx, y, w, h, st, on, off);
    cx += w + st * 2.4;
  }
}

export function gym2Atlas(S, P) {
  const A = GYM2_ATLAS, k = S / A.size, m = Math.round(2 * k);
  const out = alloc(S);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nB = perlin(P.seed + 1), nC = perlin(P.seed + 2);
  const rnd = mulberry(P.seed + 3);

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

  // —— 单车触摸屏：“爬坡课”——课程名和进度条、路线的爬坡剖面、四块数据、功率区间 ——
  {
    const b = box('bikeScreen'), { w: W, h: H } = A.bikeScreen;
    region(out, S, b, m, (u, v) => {
      const c = mix3(rgb([10, 12, 20]), rgb([20, 24, 40]), v * 0.8 + 0.2 * u);
      return [mul(c, 0.8), 0, 0.12, 0, c];
    });
    const { fill } = areaPainter(out, S, b, m, W, H);
    const white = lit(rgb([240, 242, 246])), grey = lit(rgb([128, 136, 152])), red = lit(rgb([236, 52, 60]));
    const dim = lit(rgb([46, 52, 70]));
    // 顶上：课程名、第几分钟、进度条
    text(fill, 'HILL CLIMB', 0.018, 0.016, 0.012, { stroke: 0.14, ...white });
    text(fill, '30 MIN  CLASS', 0.018, 0.033, 0.0068, { stroke: 0.15, ...grey });
    text(fill, '18:36', W - 0.018, 0.014, 0.016, { align: 'right', stroke: 0.13, ...white });
    fill((x, y) => sdRoundRect(x, y, W / 2, 0.052, W / 2 - 0.018, 0.0022, 0.0022), [0, 0.048, W, 0.056], dim);
    const prog = 0.62;
    fill((x, y) => sdRoundRect(x, y, 0.018 + (W - 0.036) * prog / 2, 0.052, (W - 0.036) * prog / 2, 0.0022, 0.0022), [0, 0.048, W, 0.056], red);
    // 爬坡剖面：一条起伏的路线，已经骑过的那段亮、前面的暗；当前位置一根竖线和一个点
    {
      const x0 = 0.018, x1 = W - 0.018, yb = 0.15, yt = 0.075;
      const prof = (t) => 0.25 + 0.2 * Math.sin(t * 7.1 + 0.4) + 0.15 * Math.sin(t * 17 + 1.3) + 0.35 * Math.exp(-(((t - 0.7) / 0.12) ** 2)) + 0.05 * nB(t * 30, 0.5);
      const hAt = (x) => yb - (yb - yt) * clamp01(prof((x - x0) / (x1 - x0)));
      const xNow = x0 + (x1 - x0) * prog;
      const done = rgb([46, 196, 182]), ahead = rgb([40, 70, 96]);
      // 已骑 / 未骑两种颜色，已骑的那段顶上一道亮边
      fill((x, y) => (x < x0 || x > xNow ? 1 : Math.max(hAt(x) - y, y - yb)), [x0, yt - 0.01, xNow, yb], lit(mix3(done, rgb([20, 60, 70]), 0.3)));
      fill((x, y) => (x < xNow || x > x1 ? 1 : Math.max(hAt(x) - y, y - yb)), [xNow, yt - 0.01, x1, yb], lit(ahead));
      fill((x, y) => (x < x0 || x > xNow ? 1 : Math.abs(y - hAt(x)) - 0.0012), [x0, yt - 0.01, xNow, yb], lit(rgb([120, 255, 230])));
      fill((x, y) => sdSeg(x, y, [xNow, yt - 0.008], [xNow, yb], 0.0008), [xNow - 0.002, yt - 0.01, xNow + 0.002, yb], white);
      fill((x, y) => Math.hypot(x - xNow, y - hAt(xNow)) - 0.0035, [xNow - 0.005, yt - 0.01, xNow + 0.005, yb], white);
    }
    // 四块数据：踏频、功率、阻力、心率
    const tiles = [['CADENCE', '92', 'RPM'], ['OUTPUT', '215', 'WATTS'], ['RESISTANCE', '42', '%'], ['HEART RATE', '146', 'BPM']];
    const tw = (W - 0.036 - 0.018) / 4;
    tiles.forEach(([label, val, unit], i) => {
      const x = 0.018 + i * (tw + 0.006), y = 0.165;
      fill((px, py) => sdRoundRect(px, py, x + tw / 2, y + 0.037, tw / 2, 0.037, 0.006), [x, y, x + tw, y + 0.074], lit(rgb([24, 28, 46])));
      text(fill, label, x + 0.01, y + 0.01, 0.0058, { stroke: 0.15, ...grey });
      text(fill, val, x + 0.01, y + 0.024, 0.03, { stroke: 0.12, ...(i === 3 ? red : white) });
      text(fill, unit, x + 0.012 + textWidth(val, 0.03), y + 0.047, 0.0062, { stroke: 0.15, ...grey });
    });
    // 功率区间：七段颜色，当前在第四区
    {
      const zones = [[70, 130, 220], [46, 190, 200], [72, 200, 110], [240, 210, 60], [245, 150, 50], [236, 60, 56], [200, 60, 180]];
      const zx0 = 0.018, zw = (W - 0.036) / zones.length, y = 0.262;
      zones.forEach((c, i) => {
        const cur = i === 3;
        fill((px, py) => sdRoundRect(px, py, zx0 + (i + 0.5) * zw, y, zw / 2 - 0.0015, cur ? 0.006 : 0.004, 0.002), [zx0 + i * zw, y - 0.008, zx0 + (i + 1) * zw, y + 0.008], lit(mul(rgb(c), cur ? 1 : 0.55)));
      });
      text(fill, 'ZONE 4', zx0 + 3.5 * zw, 0.275, 0.0065, { align: 'center', stroke: 0.15, ...white });
    }
  }

  // —— 划船机液晶表：灰绿底、黑色段码，带一点背光 ——
  {
    const b = box('rowerScreen'), { w: W, h: H } = A.rowerScreen;
    region(out, S, b, m, (u, v) => {
      const c = mix3(rgb([150, 164, 150]), rgb([128, 144, 132]), v);
      return [c, 0.2, 0.2, 0, mul(c, 0.3)];
    });
    const { fill } = areaPainter(out, S, b, m, W, H);
    const on = { color: rgb([22, 26, 24]), emit: rgb([8, 10, 9]) }, off = { color: rgb([140, 154, 142]), emit: rgb([40, 46, 42]) };
    const ink = { color: rgb([30, 34, 32]), emit: rgb([10, 12, 11]) };
    text(fill, '/500M', W - 0.012, 0.012, 0.0075, { align: 'right', stroke: 0.16, ...ink });
    segText(fill, '1:58.4', 0.026, 0.012, 0.017, 0.032, 0.0036, on, off);
    text(fill, 'SPM', 0.012, 0.058, 0.0062, { stroke: 0.16, ...ink });
    segText(fill, '26', 0.012, 0.068, 0.009, 0.017, 0.0023, on, off);
    text(fill, 'METERS', 0.07, 0.058, 0.0062, { stroke: 0.16, ...ink });
    segText(fill, '2046', 0.07, 0.068, 0.009, 0.017, 0.0023, on, off);
    text(fill, 'TIME', 0.142, 0.058, 0.0062, { stroke: 0.16, ...ink });
    segText(fill, '8:04', 0.142, 0.068, 0.008, 0.017, 0.0023, on, off);
    // 强度条
    for (let i = 0; i < 12; i++) {
      const x = 0.014 + i * 0.0146, hh = 0.004 + 0.012 * (i / 11);
      fill((px, py) => sdRoundRect(px, py, x + 0.005, 0.115 - hh / 2, 0.005, hh / 2, 0.0006), [x, 0.1, x + 0.011, 0.116], i < 8 ? on : off);
    }
  }

  // —— 配重片：黑色，左边白字的重量，中间一个插销孔，右边小字 KG ——
  {
    const [x0, y0, x1, y1] = box('plates');
    const PL = A.plate, rows = Math.ceil(PL.n / PL.cols), cw = (x1 - x0) / PL.cols, chh = (y1 - y0) / rows;
    for (let i = 0; i < PL.n; i++) {
      const bx = [x0 + Math.round((i % PL.cols) * cw), y0 + Math.round(Math.floor(i / PL.cols) * chh)];
      const cb = [bx[0], bx[1], Math.round(bx[0] + cw), Math.round(bx[1] + chh)];
      const tone = 0.94 + 0.08 * rnd();
      region(out, S, cb, m, (u, v) => {
        const x = u * PL.w, y = v * PL.h;
        const edge = Math.min(y, PL.h - y);
        let c = mul(rgb([30, 30, 32]), tone * (1 + 0.04 * nC(x * 200, y * 200)));
        c = mul(c, 0.8 + 0.2 * sstep(0, 0.003, edge));
        return [c, 0.5, 0.45, 0];
      });
      const { fill } = areaPainter(out, S, cb, m, PL.w, PL.h);
      const w = String((i + 1) * PL.step);
      text(fill, w, PL.w * 0.36, PL.h / 2 - 0.0125, 0.025, { align: 'right', stroke: 0.13, color: rgb([236, 236, 232]), height: 0.7 });
      text(fill, 'KG', PL.w * 0.64, PL.h / 2 - 0.006, 0.012, { stroke: 0.14, color: rgb([200, 200, 198]), height: 0.7 });
      fill((x, y) => Math.hypot(x - PL.w / 2, y - PL.h / 2) - 0.0075, [PL.w / 2 - 0.009, PL.h / 2 - 0.009, PL.w / 2 + 0.009, PL.h / 2 + 0.009], { color: rgb([6, 6, 7]), height: 0 });
    }
  }

  // —— 刻度条：从下往上 1 ~ 20，每档一道刻线 ——
  {
    const b = box('scale'), { w: W, h: H, n, pitch, y0 } = A.scale;
    region(out, S, b, m, () => [rgb([22, 22, 24]), 0.5, 0.5, 0]);
    const { fill } = areaPainter(out, S, b, m, W, H);
    const wht = { color: rgb([226, 226, 222]), height: 0.7 };
    for (let i = 0; i < n; i++) {
      const y = H - (y0 + i * pitch);
      fill((x, yy) => sdSeg(x, yy, [0.004, y], [0.014, y], 0.0012), [0, y - 0.003, 0.018, y + 0.003], wht);
      text(fill, String(i + 1), 0.03, y - 0.008, 0.016, { align: 'center', stroke: 0.13, ...wht });
    }
  }

  // —— 贴标：车架上的“TRYITEM”和一道红色斜条；护罩上的小字 ——
  {
    const b = box('decal'), { w: W, h: H } = A.decal;
    region(out, S, b, m, () => [rgb([22, 23, 25]), 0.4, 0.5, 0]);
    const { fill } = areaPainter(out, S, b, m, W, H);
    fill((x, y) => sdPoly(x, y, [[0.012, 0.062], [0.05, 0.013], [0.066, 0.013], [0.028, 0.062]]), [0.01, 0.01, 0.07, 0.065], { color: rgb([210, 36, 42]), height: 0.6 });
    text(fill, 'TRYITEM', 0.075, 0.018, 0.028, { stroke: 0.15, color: rgb([238, 238, 236]), height: 0.6 });
    text(fill, 'SPIN S1', 0.077, 0.052, 0.009, { stroke: 0.16, color: rgb([160, 162, 168]), height: 0.6 });
  }
  {
    const b = box('decal2'), { w: W, h: H } = A.decal;
    region(out, S, b, m, () => [rgb([22, 23, 25]), 0.4, 0.5, 0]);
    const { fill } = areaPainter(out, S, b, m, W, H);
    text(fill, 'MAGNETIC', W / 2, 0.02, 0.016, { align: 'center', stroke: 0.15, color: rgb([230, 230, 228]), height: 0.6 });
    for (let i = 0; i < 3; i++) fill((x, y) => sdRoundRect(x, y, W / 2 - 0.03 + i * 0.03, 0.055, 0.012, 0.002, 0.002), [0, 0.05, W, 0.06], { color: rgb([210, 36, 42]), height: 0.6 });
  }
  return out;
}
