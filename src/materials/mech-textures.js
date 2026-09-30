// 机械车间的程序化贴图：机械图集（轮胎、链条、刻度、车屑、油箱漆面、仪表、刹车盘、各种铭牌和标签、砂轮、纯色格子），
// 锤纹漆、花纹钢板地面、镀锌瓦楞钢板。
import { perlin, worley } from './noise.js';
import { MECH_ATLAS } from './atlas.js';
import { sdRoundRect, sdSeg, sdPoly } from './laundry-textures.js';
import { text } from './gym-textures.js';
import { TREAD_V, CHAIN } from '../machine/layout.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const fract = (x) => x - Math.floor(x);
const TAU = 2 * Math.PI;

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
// 一块区域按物理尺寸 W × H（米）作画。m：四周留出的像素 —— 取 UV 时两头各缩进 m 像素（mechUV），
// 一圈首尾相接的条带（轮胎、链条、刻度环）把 [0, W] 对到缩进以后的那一段，留边里画的是图案往外的延续，接缝上看不出来
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
// 画笔的坐标变换：T 把“画的时候”的坐标映射到区域里（翻转是自反的，T 同时也是逆变换）
const warp = (fill, T) => (sdf, bb, style) => {
  const c = [T(bb[0], bb[1]), T(bb[2], bb[1]), T(bb[0], bb[3]), T(bb[2], bb[3])];
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  fill((x, y) => { const [a, b] = T(x, y); return sdf(a, b); }, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], style);
};
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ring = (cx, cy, r, w) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - w / 2;
const bbC = (cx, cy, r) => [cx - r, cy - r, cx + r, cy + r];
// 表盘上的一圈刻度和数字：角度 a（度，逆时针，0 在右边）→ 区域坐标（y 向下）
const polar = (cx, cy, r, a) => [cx + r * Math.cos((a * Math.PI) / 180), cy - r * Math.sin((a * Math.PI) / 180)];

export function mechAtlas(S, P) {
  const A = MECH_ATLAS, k = S / A.size, M = Math.round(2 * k);
  const out = alloc(S, true);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const size = (name) => A.sizes[name];
  const nA = perlin(P.seed + 1), nB = perlin(P.seed + 2), nC = perlin(P.seed + 3);
  const INK = rgb([236, 236, 230]), BLACK = rgb([18, 18, 20]), SILVER = rgb([210, 212, 216]), GOLD = rgb([226, 186, 104]);

  // —— 纯色格子 ——
  {
    const [x0, y0, x1, y1] = box('swatch');
    const rows = Math.ceil(A.swatches.length / A.cols), w = (x1 - x0) / A.cols, h = (y1 - y0) / rows;
    A.swatches.forEach((s, i) => {
      const cx = x0 + Math.round((i % A.cols) * w), cy = y0 + Math.round(Math.floor(i / A.cols) * h);
      for (let y = cy; y < cy + Math.round(h); y++) for (let x = cx; x < cx + Math.round(w); x++) put(out, y * S + x, rgb(s.c), 0, s.rough, s.metal ?? 0, s.emit ? rgb(s.emit) : null);
    });
  }

  // —— 轮胎：胎面是 52 组花纹（中间一道锯齿槽、两边各一道斜槽，左右错开半组），胎侧上凸起的字 ——
  {
    const [W, H] = size('tire'), b = box('tire'), [v0, v1] = TREAD_V, y0 = v0 * H, y1 = v1 * H, yc = H / 2, Pd = W / 52;
    const tri = (t) => 1 - 4 * Math.abs(fract(t) - 0.5);
    region(out, S, b, W, H, (x, y) => {
      const u = x / W, v = y / H;
      const g = 0.5 * nA(u * 600, v * 60, 600, 60) + 0.5 * nB(u * 150, v * 15, 150, 15);
      if (y > y0 && y < y1) {
        let d = Math.abs(y - (yc + 0.0045 * tri(x / Pd))) - 0.0019;
        const lx = x - Math.floor(x / Pd) * Pd;
        for (const o of [-Pd, 0, Pd]) {
          d = Math.min(d, sdSeg(lx + o, y, [0.08 * Pd, y0 + 0.006], [0.62 * Pd, yc - 0.0095], 0.0036));
          d = Math.min(d, sdSeg(lx + o, y, [0.58 * Pd, y1 - 0.006], [1.12 * Pd, yc + 0.0095], 0.0036));
        }
        const groove = sstep(0.0004, -0.0004, d);
        const edge = sstep(0, 0.006, Math.min(y - y0, y1 - y));
        return [mul(rgb([24, 24, 26]), (0.92 + 0.12 * g) * (1 - 0.35 * groove)), (-groove) * edge + (1 - edge) * -0.1, 0.78 + 0.12 * groove];
      }
      // 胎侧：靠胎唇一道护圈凸线
      const s = y <= y0 ? y : H - y;
      const bead = sstep(0.0012, 0.0004, Math.abs(s - 0.011));
      return [mul(rgb([22, 22, 24]), 0.95 + 0.1 * g + 0.15 * bead), -0.1 + 0.5 * bead, 0.66];
    }, M);
    const fill = gp(out, S, b, W, H, M);
    // 胎侧 A（v 从胎唇往胎面增大）：字要上下翻过来，字头才朝外；胎侧 B：左右镜像，从外面看才是正的
    const sideA = warp(fill, (x, y) => [x, y0 - y]), sideB = warp(fill, (x, y) => [W - x, y]);
    const lettering = { color: rgb([46, 46, 48]), height: 0.7, rough: 0.55 };
    for (const [side, ym] of [[sideA, y0 / 2], [sideB, (y1 + H) / 2]]) {
      for (const x of [0.28, 1.28]) {
        text(side, 'TRYITEM', x, ym - 0.0075, 0.015, { align: 'center', stroke: 0.17, ...lettering });
        text(side, 'ROADSTER', x + 0.3, ym - 0.0048, 0.0096, { align: 'center', stroke: 0.16, ...lettering });
        text(side, 'TUBELESS', x + 0.56, ym - 0.004, 0.008, { align: 'center', stroke: 0.16, ...lettering });
      }
    }
  }

  // —— 链条：一圈 98 节，截面是扁的长方形（两侧是链片、上下是滚子），v 依次是侧面 A、顶面、侧面 B、底面 ——
  {
    const [W, H] = size('chain'), b = box('chain'), Pd = W / CHAIN.links, zones = [0.016, 0.024, 0.04, 0.048];
    region(out, S, b, W, H, (x, y) => {
      const li = Math.floor(x / Pd), lx = x - li * Pd, even = li % 2 === 0;
      const side = y < zones[0] || (y >= zones[1] && y < zones[2]);
      if (side) {
        const yy = (y < zones[0] ? y : y - zones[1]) - 0.008;
        // 外链片（偶数节）盖住内链片，两头是销子
        const outer = (lx2, ext) => sdRoundRect(lx2, yy, Pd / 2, 0, Pd / 2 + ext, 0.0064, 0.0055);
        const dOut = Math.min(outer(even ? lx : lx + Pd, 0.36 * Pd), outer(even ? lx - 2 * Pd : lx - Pd, 0.36 * Pd));
        const dIn = sdRoundRect(lx, yy, Pd / 2, 0, Pd / 2 + 0.32 * Pd, 0.0056, 0.005);
        const pin = Math.min(Math.hypot(lx, yy), Math.hypot(lx - Pd, yy)) - 0.0022;
        if (pin < 0) return [rgb([206, 208, 212]), 0.9, 0.3, 1];
        if (dOut < 0 && even) return [rgb([158, 160, 166]), 0.6, 0.38, 1];
        if (dIn < 0) return [rgb([98, 100, 106]), 0.3, 0.45, 1];
        return [rgb([30, 30, 32]), -0.5, 0.5, 0.5];
      }
      // 顶面 / 底面：滚子（在销子的位置）
      const roll = Math.min(Math.abs(lx), Math.abs(lx - Pd)) - 0.0048;
      return roll < 0 ? [rgb([112, 114, 120]), 0.4, 0.4, 1] : [rgb([34, 34, 36]), -0.4, 0.5, 0.5];
    }, M);
  }

  // —— 手轮刻度环：一圈 100 格，每 5 格长一点，每 10 格最长、下面一个数字 ——
  {
    const [W, H] = size('collar'), b = box('collar'), Pd = W / 100;
    region(out, S, b, W, H, (x, y) => {
      const i = Math.round(x / Pd), dx = Math.abs(x - i * Pd), L = i % 10 === 0 ? 0.0066 : i % 5 === 0 ? 0.0048 : 0.0032;
      const tick = dx < 0.00022 && y < L;
      const g = nA((x / W) * 200, y * 800, 200);
      return tick ? [BLACK, -0.8, 0.5, 0] : [mul(rgb([204, 208, 214]), 0.96 + 0.05 * g), 0, 0.3, 1];
    }, M);
    const fill = gp(out, S, b, W, H, M);
    for (let i = 0; i <= 100; i += 10) text(fill, String(i % 100), i * Pd, 0.0074, 0.0032, { align: 'center', stroke: 0.14, color: BLACK, height: -0.8, metal: 0, rough: 0.5 });
  }
  // —— 钢尺刻度（0 ~ 100mm）——
  {
    const [W, H] = size('scale'), b = box('scale');
    region(out, S, b, W, H, (x, y) => {
      const i = Math.round(x / 0.001), dx = Math.abs(x - i * 0.001), L = i % 10 === 0 ? 0.0038 : i % 5 === 0 ? 0.0028 : 0.0018;
      return dx < 0.00012 && y < L ? [BLACK, -0.8, 0.5, 0] : [rgb([198, 202, 208]), 0, 0.32, 1];
    }, M);
    const fill = gp(out, S, b, W, H, M);
    for (let i = 1; i < 10; i++) text(fill, String(i), i * 0.01, 0.0045, 0.0026, { align: 'center', stroke: 0.14, color: BLACK, metal: 0 });
  }
  // —— 车屑：沿着车屑的回火色（草黄 → 古铜 → 紫 → 蓝 → 浅蓝）——
  {
    const [W, H] = size('chip'), b = box('chip');
    const stops = [[222, 196, 130], [196, 132, 70], [124, 66, 104], [58, 76, 150], [118, 146, 186], [168, 172, 180]].map(rgb);
    region(out, S, b, W, H, (x, y) => {
      const t = clamp01(x / W) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t));
      const c = mix3(stops[i], stops[i + 1], t - i), g = nA(x * 400, y * 3000, 4096, 4096);
      return [mul(c, 0.94 + 0.08 * g), 0.1 * g, 0.22, 1];
    }, M);
  }

  // —— 油箱 / 尾罩的漆面：大红，正中一道奶油色宽条纹、两边金色勾线，油箱后半截两侧是带横棱的黑色护膝胶垫 ——
  {
    const [W, H] = size('tank'), b = box('tank');
    region(out, S, b, W, H, (x, y) => {
      const g = nA((x / W) * 40, (y / H) * 60, 4096, 4096), dy = Math.abs(y - H / 2);
      if (dy < 0.034) return [mul(rgb([236, 226, 196]), 0.97 + 0.03 * g), 0.05, 0.18, 0];
      if (dy > 0.041 && dy < 0.0445) return [GOLD, 0.05, 0.22, 1];
      for (const cy of [H / 2 - 0.2, H / 2 + 0.2]) {
        const d = sdRoundRect(x, y, 0.4, cy, 0.075, 0.042, 0.018);
        if (d < 0) { const rib = 0.5 + 0.5 * Math.cos((y - cy) * TAU / 0.007); return [mul(rgb([30, 30, 32]), 0.9 + 0.2 * rib), 0.2 + 0.5 * rib * sstep(0, -0.004, d), 0.78, 0]; }
      }
      return [mul(rgb([158, 20, 26]), 0.97 + 0.04 * g), 0, 0.13, 0.05];
    });
  }

  // —— 仪表：速度表（0 ~ 160 km/h）和转速表（0 ~ 10 × 1000，8000 以上一段红区），黑底白字，橙色指针停在零位 ——
  {
    const [W, H] = size('gauges'), b = box('gauges'), fill = gp(out, S, b, W, H);
    region(out, S, b, W, H, () => [rgb([150, 152, 156]), 0, 0.3, 1]);
    const dial = (cx, max, major, minor, label, red) => {
      const ang = (v) => 225 - (270 * v) / max;
      fill(circle(cx, 0.045, 0.043), bbC(cx, 0.045, 0.043), { color: rgb([14, 14, 16]), rough: 0.4, metal: 0, height: 0 });
      if (red) for (let v = red; v < max; v += 0.05) {
        const [x, y] = polar(cx, 0.045, 0.0385, ang(v));
        fill(circle(x, y, 0.0028), bbC(x, y, 0.003), { color: rgb([200, 30, 30]) });
      }
      for (let v = 0; v <= max + 1e-9; v += minor) {
        const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6, a = ang(v);
        const p0 = polar(cx, 0.045, isMajor ? 0.0335 : 0.0365, a), p1 = polar(cx, 0.045, 0.0412, a);
        fill((x, y) => sdSeg(x, y, p0, p1, isMajor ? 0.0011 : 0.0006), [Math.min(p0[0], p1[0]) - 0.001, Math.min(p0[1], p1[1]) - 0.001, Math.max(p0[0], p1[0]) + 0.001, Math.max(p0[1], p1[1]) + 0.001], { color: INK });
        if (isMajor) { const [x, y] = polar(cx, 0.045, 0.026, a); text(fill, String(Math.round(v)), x, y - 0.0027, 0.0054, { align: 'center', stroke: 0.15, color: INK }); }
      }
      text(fill, label, cx, 0.045 + 0.011, 0.0036, { align: 'center', stroke: 0.15, color: INK });
      text(fill, 'TRYITEM', cx, 0.045 - 0.017, 0.0032, { align: 'center', stroke: 0.15, color: rgb([200, 60, 50]) });
      const tip = polar(cx, 0.045, 0.034, ang(0) + 6), tail = polar(cx, 0.045, -0.008, ang(0) + 6);
      fill((x, y) => sdSeg(x, y, tail, tip, 0.0014), [cx - 0.04, 0.005, cx + 0.04, 0.085], { color: rgb([240, 112, 30]) });
      fill(circle(cx, 0.045, 0.0045), bbC(cx, 0.045, 0.0045), { color: rgb([40, 40, 42]) });
    };
    dial(0.045, 160, 20, 10, 'KM/H', null);
    dial(0.135, 10, 1, 0.5, 'X1000 RPM', 8);
  }

  // —— 打孔的刹车盘：外圈是摩擦面（一圈圈细车纹、三排错开的孔），里面是黑色的盘架（五个减重孔）和一圈金色的浮动铆钉 ——
  {
    const [W, H] = size('disc'), b = box('disc'), c = W / 2;
    region(out, S, b, W, H, (x, y) => {
      const dx = x - c, dy = y - c, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), t = a / TAU + 0.5;
      if (r > 0.1) {
        const turn = nA(r * 3000, t * 8, 4096, 8) * 0.5 + nB(r * 800, t * 4, 4096, 4) * 0.5;
        let hole = 9;
        [0.114, 0.126, 0.138].forEach((rr, row) => {
          const n = 20, k = Math.round(t * n - row / 3) + row / 3, ah = (k / n) * TAU - Math.PI;
          hole = Math.min(hole, Math.hypot(dx - rr * Math.cos(ah), dy - rr * Math.sin(ah)) - 0.0034);
        });
        if (hole < 0) return [rgb([22, 22, 24]), -1, 0.6, 0.5];
        return [mul(rgb([146, 148, 152]), 0.9 + 0.12 * turn), 0, 0.4 + 0.08 * turn, 1];
      }
      let d = 9;
      for (let i = 0; i < 5; i++) { const ah = (i / 5) * TAU; d = Math.min(d, Math.hypot(dx - 0.066 * Math.cos(ah), dy - 0.066 * Math.sin(ah)) - 0.013); }
      if (d < 0 || r < 0.034) return [rgb([14, 14, 16]), -1, 0.7, 0];
      return [rgb([34, 34, 36]), 0, 0.5, 0.2];
    });
    const fill = gp(out, S, b, W, H);
    for (let i = 0; i < 10; i++) { const [x, y] = polar(c, c, 0.1, i * 36 + 18); fill(circle(x, y, 0.0058), bbC(x, y, 0.006), { color: GOLD, metal: 1, rough: 0.25, height: 0.5 }); }
  }

  // —— 发动机边盖上的圆铭牌：抛光铝、一圈圈车纹，中间黑字 TRYITEM / TWIN ——
  {
    const [W, H] = size('engine'), b = box('engine'), c = W / 2;
    region(out, S, b, W, H, (x, y) => {
      const r = Math.hypot(x - c, y - c), turn = 0.5 + 0.5 * Math.sin(r * 2400);
      const groove = sstep(0.0012, 0.0004, Math.abs(r - 0.056));
      return [mul(rgb([214, 216, 220]), (0.93 + 0.06 * turn) * (1 - 0.5 * groove)), -groove, 0.12 + 0.05 * turn, 1];
    });
    const fill = gp(out, S, b, W, H), ink = { color: rgb([24, 24, 26]), metal: 0, rough: 0.45, height: -0.6 };
    text(fill, 'TRYITEM', c, c - 0.009, 0.0165, { align: 'center', stroke: 0.17, ...ink });
    text(fill, 'TWIN', c, c + 0.013, 0.0085, { align: 'center', stroke: 0.16, ...ink });
    for (const yy of [c - 0.015, c + 0.0105]) fill((x, y) => sdSeg(x, y, [c - 0.03, yy], [c + 0.03, yy], 0.0008), [c - 0.031, yy - 0.001, c + 0.031, yy + 0.001], ink);
  }

  // —— 车床调速旋钮的刻度盘：黑底，0 ~ 25（× 100 RPM）绕 270° ——
  {
    const [W, H] = size('speedDial'), b = box('speedDial'), c = W / 2, fill = gp(out, S, b, W, H);
    region(out, S, b, W, H, () => [rgb([22, 22, 24]), 0, 0.45, 0]);
    const ang = (v) => 225 - (270 * v) / 25;
    for (let v = 0; v <= 25; v++) {
      const big = v % 5 === 0, p0 = polar(c, c, big ? 0.03 : 0.032, ang(v)), p1 = polar(c, c, 0.036, ang(v));
      fill((x, y) => sdSeg(x, y, p0, p1, big ? 0.0009 : 0.0005), [Math.min(p0[0], p1[0]) - 0.001, Math.min(p0[1], p1[1]) - 0.001, Math.max(p0[0], p1[0]) + 0.001, Math.max(p0[1], p1[1]) + 0.001], { color: INK, height: 0.3 });
      if (big) { const [x, y] = polar(c, c, 0.0245, ang(v)); text(fill, String(v), x, y - 0.002, 0.004, { align: 'center', stroke: 0.15, color: INK }); }
    }
    text(fill, 'X100 RPM', c, c + 0.021, 0.0032, { align: 'center', stroke: 0.15, color: INK });
  }

  // —— 台钻的转速表：白底黑字，皮带在三组塔轮上的六个位置和对应的转速 ——
  {
    const [W, H] = size('drillChart'), b = box('drillChart'), fill = gp(out, S, b, W, H), ink = { color: BLACK };
    region(out, S, b, W, H, (x, y) => [mul(rgb([236, 234, 226]), 0.98 + 0.03 * nC(x * 300, y * 300)), 0, 0.7, 0]);
    fill((x, y) => Math.abs(sdRoundRect(x, y, W / 2, H / 2, W / 2 - 0.004, H / 2 - 0.004, 0.003)) - 0.0006, [0, 0, W, H], ink);
    text(fill, 'SPINDLE SPEED', W / 2, 0.011, 0.0068, { align: 'center', stroke: 0.16, ...ink });
    text(fill, 'RPM', W / 2, 0.021, 0.005, { align: 'center', stroke: 0.15, ...ink });
    fill((x, y) => sdSeg(x, y, [0.012, 0.03], [W - 0.012, 0.03], 0.0007), [0.01, 0.028, W - 0.01, 0.032], ink);
    [['A-1', '250'], ['A-2', '450'], ['B-2', '780'], ['B-3', '1350'], ['C-3', '2250'], ['C-4', '3100']].forEach(([p, rpm], i) => {
      const y = 0.037 + i * 0.0125;
      text(fill, p, 0.022, y, 0.0068, { stroke: 0.16, ...ink });
      text(fill, rpm, W - 0.02, y, 0.0068, { align: 'right', stroke: 0.16, ...ink });
    });
  }

  // —— 车床的螺纹 / 进给表：黑底银字，左边英制（牙 / 英寸）、右边公制（螺距 mm）——
  {
    const [W, H] = size('lathePlate'), b = box('lathePlate'), fill = gp(out, S, b, W, H), ink = { color: SILVER, metal: 1, rough: 0.28, height: 0.5 };
    region(out, S, b, W, H, (x, y) => [mul(rgb([20, 20, 22]), 0.95 + 0.08 * nC(x * 200, y * 200)), 0, 0.35, 0]);
    fill((x, y) => Math.abs(sdRoundRect(x, y, W / 2, H / 2, W / 2 - 0.004, H / 2 - 0.004, 0.003)) - 0.0006, [0, 0, W, H], ink);
    text(fill, 'TRYITEM MACHINE WORKS', W / 2, 0.009, 0.0078, { align: 'center', stroke: 0.16, ...ink });
    fill((x, y) => sdSeg(x, y, [0.012, 0.022], [W - 0.012, 0.022], 0.0006), [0.01, 0.02, W - 0.01, 0.024], ink);
    fill((x, y) => sdSeg(x, y, [W / 2, 0.026], [W / 2, H - 0.01], 0.0006), [W / 2 - 0.001, 0.024, W / 2 + 0.001, H - 0.008], ink);
    text(fill, 'THREADS TPI', W / 4, 0.027, 0.0052, { align: 'center', stroke: 0.15, ...ink });
    text(fill, 'METRIC MM', (3 * W) / 4, 0.027, 0.0052, { align: 'center', stroke: 0.15, ...ink });
    const tpi = ['8', '9', '10', '11', '12', '13', '14', '16', '18', '19', '20', '22', '24', '26', '28', '32', '36', '40', '44', '48'];
    const mm = ['0.5', '0.6', '0.7', '0.75', '0.8', '1.0', '1.25', '1.5', '1.75', '2.0', '2.5', '3.0'];
    tpi.forEach((s, i) => text(fill, s, 0.018 + (i % 4) * 0.021, 0.039 + Math.floor(i / 4) * 0.0105, 0.0058, { align: 'center', stroke: 0.15, ...ink }));
    mm.forEach((s, i) => text(fill, s, W / 2 + 0.02 + (i % 3) * 0.03, 0.039 + Math.floor(i / 3) * 0.0105, 0.0058, { align: 'center', stroke: 0.15, ...ink }));
  }

  // —— 油箱徽章：椭圆，金边、黑色珐琅、金字 ——
  {
    const [W, H] = size('badge'), b = box('badge'), fill = gp(out, S, b, W, H), c = [W / 2, H / 2];
    const oval = (x, y, a, bb) => (Math.hypot((x - c[0]) / a, (y - c[1]) / bb) - 1) * Math.min(a, bb);
    region(out, S, b, W, H, (x, y) => (oval(x, y, 0.054, 0.025) < 0 ? [rgb([16, 16, 18]), 0, 0.15, 0] : [GOLD, 0.6, 0.22, 1]));
    const g = { color: GOLD, metal: 1, rough: 0.22, height: 0.6 };
    text(fill, 'TRYITEM', c[0], c[1] - 0.0085, 0.017, { align: 'center', stroke: 0.17, ...g });
    for (const yy of [c[1] - 0.015, c[1] + 0.0145]) fill((x, y) => sdSeg(x, y, [c[0] - 0.03, yy], [c[0] + 0.03, yy], 0.0009), [c[0] - 0.031, yy - 0.001, c[0] + 0.031, yy + 0.001], g);
  }
  // —— 机床铭牌：铝牌，黑色的底，银字，四角铆钉 ——
  {
    const [W, H] = size('maker'), b = box('maker'), fill = gp(out, S, b, W, H), ink = { color: SILVER, metal: 1, rough: 0.28, height: 0.4 };
    region(out, S, b, W, H, (x, y) => {
      const inner = sdRoundRect(x, y, W / 2, H / 2, W / 2 - 0.006, H / 2 - 0.006, 0.003);
      return inner < 0 ? [rgb([22, 22, 24]), 0, 0.4, 0] : [mul(rgb([204, 206, 210]), 0.95 + 0.06 * nC(x * 600, y * 40)), 0.3, 0.3, 1];
    });
    text(fill, 'TRYITEM', W / 2, 0.011, 0.015, { align: 'center', stroke: 0.17, ...ink });
    text(fill, 'MACHINE WORKS', W / 2, 0.0305, 0.0056, { align: 'center', stroke: 0.15, ...ink });
    text(fill, 'MODEL TL-1022', W / 2, 0.041, 0.0042, { align: 'center', stroke: 0.15, ...ink });
    for (const [x, y] of [[0.004, 0.004], [W - 0.004, 0.004], [0.004, H - 0.004], [W - 0.004, H - 0.004]]) fill(circle(x, y, 0.0021), bbC(x, y, 0.0022), { color: rgb([230, 232, 236]), height: 0.9 });
  }
  // —— 黄色警示贴：黑框、黑三角里一个感叹号，CAUTION / WEAR EYE PROTECTION ——
  {
    const [W, H] = size('warning'), b = box('warning'), fill = gp(out, S, b, W, H), ink = { color: BLACK };
    region(out, S, b, W, H, (x, y) => [mul(rgb([238, 192, 32]), 0.97 + 0.04 * nC(x * 400, y * 400)), 0, 0.5, 0]);
    fill((x, y) => Math.abs(sdRoundRect(x, y, W / 2, H / 2, W / 2 - 0.0025, H / 2 - 0.0025, 0.002)) - 0.0008, [0, 0, W, H], ink);
    const tri = [[0.009, 0.039], [0.027, 0.009], [0.045, 0.039]];
    fill((x, y) => sdPoly(x, y, tri) - 0.001, [0.007, 0.007, 0.047, 0.041], ink);
    fill((x, y) => sdSeg(x, y, [0.027, 0.018], [0.027, 0.03], 0.003), [0.025, 0.016, 0.029, 0.032], { color: rgb([238, 192, 32]) });
    fill(circle(0.027, 0.0345, 0.0017), bbC(0.027, 0.0345, 0.002), { color: rgb([238, 192, 32]) });
    text(fill, 'CAUTION', 0.074, 0.009, 0.0085, { align: 'center', stroke: 0.18, ...ink });
    text(fill, 'WEAR EYE', 0.074, 0.024, 0.005, { align: 'center', stroke: 0.16, ...ink });
    text(fill, 'PROTECTION', 0.074, 0.0325, 0.005, { align: 'center', stroke: 0.16, ...ink });
  }
  // —— 开关面板：黑底，左边 ON（绿圈）、右边 OFF（红圈），按钮本身是几何 ——
  {
    const [W, H] = size('switches'), b = box('switches'), fill = gp(out, S, b, W, H);
    region(out, S, b, W, H, (x, y) => [mul(rgb([26, 26, 28]), 0.95 + 0.06 * nC(x * 300, y * 300)), 0, 0.45, 0]);
    text(fill, 'ON', 0.025, 0.006, 0.0072, { align: 'center', stroke: 0.17, color: INK });
    text(fill, 'OFF', 0.075, 0.006, 0.0072, { align: 'center', stroke: 0.17, color: INK });
    fill(ring(0.025, 0.031, 0.0115, 0.0016), bbC(0.025, 0.031, 0.013), { color: rgb([40, 160, 70]) });
    fill(ring(0.075, 0.031, 0.0115, 0.0016), bbC(0.075, 0.031, 0.013), { color: rgb([200, 36, 36]) });
  }
  // —— 砂轮的端面：一粒粒磨料，中间一圈纸标（绿色 / 蓝色），一个轴孔 ——
  for (const [name, stone, paper, grit] of [['wheelGray', [120, 120, 124], [46, 120, 64], 'A36'], ['wheelWhite', [222, 222, 218], [52, 84, 150], 'WA60']]) {
    const [W, H] = size(name), b = box(name), c = W / 2;
    region(out, S, b, W, H, (x, y) => {
      const g = nA(x * 3000, y * 3000, 4096, 4096) * 0.6 + nB(x * 800, y * 800, 4096, 4096) * 0.4;
      return [mul(rgb(stone), 0.86 + 0.24 * g), 0.5 * g, 0.95, 0];
    });
    const fill = gp(out, S, b, W, H);
    fill(circle(c, c, 0.042), bbC(c, c, 0.042), { color: rgb(paper), height: 0.2, rough: 0.7 });
    fill(ring(c, c, 0.038, 0.0009), bbC(c, c, 0.039), { color: INK });
    text(fill, 'TRYITEM', c, c - 0.02, 0.0078, { align: 'center', stroke: 0.16, color: INK });
    text(fill, grit, c, c + 0.0115, 0.0105, { align: 'center', stroke: 0.17, color: INK });
    text(fill, '3450 RPM', c, c + 0.025, 0.0048, { align: 'center', stroke: 0.15, color: INK });
    fill(circle(c, c, 0.0095), bbC(c, c, 0.01), { color: rgb([20, 20, 22]), height: -1 });
  }
  return out;
}

// ——————————————————————— 锤纹漆 ———————————————————————
// 周期 0.3m：一个个浅浅的锤击坑（Worley 格子的中心最低、格子边缘一圈亮的金属片），机床的灰绿色直接烘在贴图里
export function hammertone(S, P) {
  const out = alloc(S), wo = worley(P.seed), wo2 = worley(P.seed + 1), n = perlin(P.seed + 2);
  const N = 44, N2 = 110, base = rgb([92, 112, 100]);
  region(out, S, [0, 0, S, S], 1, 1, (u, v) => {
    const a = wo(u * N, v * N, N, N), b = wo2(u * N2, v * N2, N2, N2);
    // 坑：格子中心最低、往外圆滑地抬起来（平方根让坑底圆、坑沿窄）；颜色只有很淡的斑驳，锤纹主要靠法线和金属片的闪光
    const dimple = Math.sqrt(sstep(0, 0.8, a.f1)), fine = sstep(0, 0.7, b.f1);
    const mottle = n(u * 24, v * 24, 24, 24) * 0.5 + n(u * 96, v * 96, 96, 96) * 0.25;
    const fleck = sstep(0.82, 0.95, b.id) * sstep(0.35, 0.1, b.f1);
    const kk = 0.94 + 0.05 * mottle + 0.06 * dimple + 0.12 * fleck;
    return [mul(base, kk), 0.75 * dimple + 0.18 * fine, 0.46 - 0.1 * dimple - 0.15 * fleck, 0.25 + 0.35 * fleck];
  });
  return out;
}

// ——————————————————————— 花纹钢板 ———————————————————————
// 周期 1m：一块 1 × 1m 的铝花纹板，四边一道拼缝、每 25cm 一颗沉头螺丝；板面上每 3.125cm 一颗凸起的长条“豆”，
// 横竖交替 ±45°（人字纹）。豆的顶上磨得发亮，豆与豆之间积着一点灰
export function diamondPlate(S, P) {
  const out = alloc(S), n = perlin(P.seed), n2 = perlin(P.seed + 1);
  const N = 32, cell = 1 / N, L = 0.0112, Wd = 0.0029;
  region(out, S, [0, 0, S, S], 1, 1, (x, y) => {
    const i = Math.floor(x * N), j = Math.floor(y * N), cx = (i + 0.5) * cell, cy = (j + 0.5) * cell;
    const s = (i + j) % 2 ? 1 : -1, c = Math.SQRT1_2;
    const dx = x - cx, dy = y - cy, a = (dx + s * dy) * c, b = (-s * dx + dy) * c;
    // 豆是一根两头圆的短棍（胶囊）：截面是圆拱、两头圆滑收掉
    const ax = Math.max(0, Math.abs(a) - (L - Wd)), dist = Math.hypot(ax, b);
    const bean = dist < Wd ? Math.sqrt(1 - (dist / Wd) ** 2) : 0;
    const brush = n(x * 20, y * 1600, 20, 1600) * 0.5 + n2(x * 4, y * 300, 4, 300) * 0.5;
    const grime = 0.4 * sstep(0.2, 0.8, n2(x * 40, y * 40, 40, 40) * 0.5 + 0.5) * sstep(Wd, Wd * 2.2, dist);
    // 拼缝和螺丝
    const seam = Math.min(x, 1 - x, y, 1 - y);
    let screw = 9;
    for (const along of [0.125, 0.375, 0.625, 0.875]) {
      for (const [px, py] of [[along, 0.018], [along, 1 - 0.018], [0.018, along], [1 - 0.018, along]]) screw = Math.min(screw, Math.hypot(x - px, y - py));
    }
    if (screw < 0.0065) {
      const slot = screw < 0.0048 && Math.min(Math.abs(x - Math.round(x * 8) / 8), Math.abs(y - Math.round(y * 8) / 8)) < 0.0005;
      return [rgb(slot ? [40, 40, 42] : [196, 198, 202]), slot ? -0.6 : 0.2 - screw * 20, 0.3, 1];
    }
    if (seam < 0.0012) return [rgb([34, 34, 36]), -1, 0.7, 0.4];
    const col = mul(rgb([194, 196, 200]), (0.93 + 0.07 * brush) * (1 - 0.2 * grime) * (1 + 0.1 * bean));
    return [col, 0.9 * bean - 0.1 * grime, 0.42 - 0.15 * bean + 0.15 * grime, 0.85];
  });
  return out;
}

// ——————————————————————— 镀锌钢板 ———————————————————————
// 周期 1 × 1.3m（整除 2m 宽、2.6m 高的墙模块）：一片片锌花（Worley 格子，每片亮度不同，里面细细的枝晶），
// 竖向几道淡淡的风化条纹
export function galvanized(S, P) {
  const out = alloc(S), wo = worley(P.seed), n = perlin(P.seed + 1), n2 = perlin(P.seed + 2);
  const NX = 30, NY = 39;
  region(out, S, [0, 0, S, S], 1, 1.3, (x, y) => {
    const u = x, v = y / 1.3;
    const c = wo(u * NX, v * NY, NX, NY);
    const dend = n(u * 360, v * 468, 360, 468);
    const spangle = 0.92 + 0.1 * (c.id - 0.5) + 0.03 * dend;
    const edge = 1 - sstep(0, 0.05, c.f2 - c.f1);
    const streak = n2(u * 40, v * 2, 40, 2) * 0.5 + 0.5;
    const kk = spangle * (1 - 0.03 * edge) * (0.95 + 0.06 * streak);
    return [mul(rgb([196, 202, 206]), kk), 0.15 * (c.id - 0.5) - 0.15 * edge + 0.05 * dend, 0.36 + 0.1 * (1 - streak) + 0.05 * edge + 0.06 * (c.id - 0.5), 0.65];
  });
  return out;
}
