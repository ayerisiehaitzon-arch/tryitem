// 陶艺室的程序化贴图：陶艺室图集（十六件上釉的成品、窑内的耐火砖和电热丝、控制器、铭牌、警示贴、泥袋、帆布台面、转盘、纯色格子），
// 泥坯（生坯 / 素烧 / 湿泥共用，材质里染色）、刷白的砖墙、陶土六角砖地面。
import { perlin, worley, mulberry } from './noise.js';
import { POTTERY_ATLAS } from './atlas.js';
import { sdRoundRect, sdSeg, sdPoly } from './laundry-textures.js';
import { text, textWidth } from './gym-textures.js';
import { SHAPES, GLAZES, CLAYS, WARES, arcTable, pointAt, rimIndex } from '../pottery/pots.js';

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
// 一块区域按物理尺寸 W × H（米）作画；m：四周留出的像素（取 UV 时两头各缩进 m 像素，留边里画的是图案往外的延续）
function region(out, S, box, W, H, f, m = 0) {
  const [x0, y0, x1, y1] = box, sx = (x1 - x0 - 2 * m) / W, sy = (y1 - y0 - 2 * m) / H;
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const [c, h, r, mt, e] = f((i + 0.5 - x0 - m) / sx, (j + 0.5 - y0 - m) / sy);
    put(out, j * S + i, c, h, r, mt ?? 0, e ?? null);
  }
}
// 往区域里叠一个形状（有符号距离 sdf，bb 是它的包围盒，米）：按覆盖率混进颜色 / 粗糙度 / 高度 / 金属度 / 自发光
function gp(out, S, box, W, H, m = 0) {
  const [bx0, by0, bx1, by1] = box;
  const sx = (bx1 - bx0 - 2 * m) / W, sy = (by1 - by0 - 2 * m) / H, px = 1 / Math.min(sx, sy);
  return (sdf, bb, { color = null, rough = null, height = null, metal = null, emit = null, alpha = 1 } = {}) => {
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
      if (emit && out.emit) for (let q = 0; q < 3; q++) out.emit[k * 3 + q] = mix(out.emit[k * 3 + q], emit[q], a);
    }
  };
}
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const bbC = (cx, cy, r) => [cx - r, cy - r, cx + r, cy + r];
const rect = (x0, y0, x1, y1, r = 0) => [(x, y) => sdRoundRect(x, y, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, r), [x0, y0, x1, y1]];
const fitH = (str, h, maxW) => Math.min(h, maxW / textWidth(str, 1));
// 格子里的确定性随机数（0..1）
const hash2 = (i, j, s = 0) => fract(Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453);

export function potteryAtlas(S, P) {
  const A = POTTERY_ATLAS, k = S / A.size, M = Math.round(2 * k);
  const out = alloc(S, true);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const size = (name) => A.sizes[name];
  const nA = perlin(P.seed + 1), nB = perlin(P.seed + 2), nC = perlin(P.seed + 3);
  const wo = worley(P.seed + 4);
  const INK = rgb([24, 24, 26]), WHITE = rgb([236, 236, 232]);

  // —— 纯色格子 ——
  {
    const [x0, y0, x1, y1] = box('swatch');
    const rows = Math.ceil(A.swatches.length / A.cols), w = (x1 - x0) / A.cols, h = (y1 - y0) / rows;
    A.swatches.forEach((s, i) => {
      const cx = x0 + Math.round((i % A.cols) * w), cy = y0 + Math.round(Math.floor(i / A.cols) * h);
      for (let y = cy; y < cy + Math.round(h); y++) for (let x = cx; x < cx + Math.round(w); x++) put(out, y * S + x, rgb(s.c), 0, s.rough, s.metal ?? 0, s.emit ? rgb(s.emit) : null);
    });
  }

  // —— 上了釉的成品：每格按物理尺寸画（宽 = 最粗处一圈的周长，高 = 轮廓全长，图的上沿是圈足底下的中心）——
  //    内壁全部上釉，外壁的釉在 line 高度停下（沿一圈微微起伏，釉泪往下挂），釉边积一道厚釉；口沿釉薄、透出 thin 的颜色，
  //    内底积釉（pool）；青瓷开片、天目的兔毫竖丝、燕麦和志野的铁点；露胎的地方是胎土的颜色、砂点和一点火色
  {
    const [bx0, by0, bx1, by1] = box('wares'), cw = (bx1 - bx0) / A.wareCols, ch = (by1 - by0) / A.wareRows;
    WARES.forEach((w, wi) => {
      const cell = [bx0 + Math.round((wi % A.wareCols) * cw), by0 + Math.round(Math.floor(wi / A.wareCols) * ch), bx0 + Math.round(((wi % A.wareCols) + 1) * cw), by0 + Math.round((Math.floor(wi / A.wareCols) + 1) * ch)];
      const pts = SHAPES[w.shape], tab = arcTable(pts), L = tab.L, rmax = Math.max(...pts.map((p) => p[0])), C = TAU * rmax;
      const iR = rimIndex(pts), sRim = tab.s[iR], footTop = pts[4][1];
      const G = GLAZES[w.glaze], base = rgb(G.base), thin = rgb(G.thin), pool = rgb(G.pool), clay = rgb(CLAYS[w.clay]);
      const rnd = mulberry(P.seed + 97 * (wi + 1));
      const drips = Array.from({ length: w.drips }, () => [rnd(), 0.004 + 0.012 * rnd(), 0.003 + 0.004 * rnd()]);
      const phase = rnd();
      region(out, S, cell, C, L, (X, Y) => {
        const u = fract(X / C), s = Y, q = pointAt(pts, tab, s), inner = s > sRim;
        const g1 = nA(u * 40, s * 200, 40, 4096), g2 = nB(u * 160, s * 700, 160, 4096);
        // 外壁釉线：一圈微微起伏 + 釉泪
        let yl = w.line + 0.0015 * Math.sin(TAU * (u + phase)) + 0.001 * g1;
        let drip = 0;
        for (const [ud, len, wd] of drips) {
          const dx = (Math.abs(fract(u - ud + 0.5) - 0.5)) * C, t = 1 - (dx / wd) ** 2;
          if (t > 0) { yl = Math.min(yl, w.line - len * Math.sqrt(t)); drip = Math.max(drip, Math.sqrt(t)); }
        }
        const underside = s < tab.s[4] && q.y < footTop - 0.0005;
        const glazed = inner || (!underside && q.y > yl);
        if (!glazed) {
          const grit = hash2(Math.floor(X * 3000), Math.floor(Y * 3000), wi) - 0.5;
          const fire = sstep(-0.2, 0.7, nC(u * 5, s * 20, 5, 4096));
          const c = mul(mix3(clay, mul(clay, 0.82), fire * 0.6), 1 + 0.12 * grit);
          return [c, 0.2 * Math.sin((TAU * s) / 0.0065) + 0.2 * grit, 0.85, 0];
        }
        // 釉的厚薄：口沿薄（±4mm 以内）、釉边和釉泪厚、内底积釉
        const rimThin = Math.exp(-(((s - sRim) / 0.004) ** 2));
        const edgeRoll = inner ? 0 : 1 - sstep(0.0004, 0.003, q.y - yl);
        const bottomPool = inner ? sstep(L - 0.03, L - 0.005, s) : 0;
        let c = base;
        c = mix3(c, pool, Math.max(0.7 * edgeRoll, 0.8 * bottomPool, 0.6 * drip * (1 - sstep(0, 0.01, q.y - yl))));
        c = mix3(c, thin, 0.85 * rimThin);
        let h = 0.4 + 0.35 * edgeRoll + 0.05 * g1, rough = G.rough + 0.05 * g2;
        if (G.crackle) {
          const cr = wo(u * C * 90, s * 90, Math.round(C * 90), 4096);
          const line = 1 - sstep(0.02, 0.06, cr.f2 - cr.f1);
          c = mix3(c, mul(c, 0.72), 0.6 * line);
          h -= 0.1 * line;
        }
        if (G.streaks) {
          // 兔毫：沿轮廓方向拉长的细丝，上半截更明显
          const st = nC(u * C * 500, s * 25, Math.round(C * 500), 4096);
          const up = inner ? 0.6 : sstep(footTop, footTop + 0.04, q.y);
          c = mix3(c, thin, 0.22 * sstep(0.4, 0.8, st) * up * (1 - rimThin));
        }
        if (G.specks) {
          const gx = Math.floor(X / 0.0016), gy = Math.floor(Y / 0.0016), r0 = hash2(gx, gy, 3 + wi);
          if (r0 > 0.93) {
            const cx = (gx + 0.5) * 0.0016, cy = (gy + 0.5) * 0.0016, d = Math.hypot(X - cx, Y - cy);
            const spot = 1 - sstep(0.0002, 0.0006 + 0.0003 * r0, d);
            c = mix3(c, rgb([96, 62, 40]), 0.85 * spot);
          }
        }
        c = mul(c, 0.97 + 0.05 * g1);
        return [c, h, rough, 0];
      });
    });
  }

  // —— 窑内壁：轻质耐火砖（顺砖，一层 6.35cm），四道放电热丝的槽，槽里盘着的电热丝；
  //    靠近槽的砖被烤得发黄，下面几层溅着几滴釉 ——
  {
    const [W, H] = size('firebrick'), b = box('firebrick');
    const BL = 0.2286, BH = 0.0635, grooves = [0.11, 0.26, 0.41, 0.56], gh = 0.02;
    const spots = Array.from({ length: 18 }, (_, i) => [hash2(i, 1, 7) * W, 0.3 + hash2(i, 2, 7) * 0.32, 0.002 + 0.004 * hash2(i, 3, 7), Math.floor(hash2(i, 4, 7) * 3)]);
    const spotCols = [[40, 70, 150], [60, 120, 90], [110, 60, 40]].map(rgb);
    region(out, S, b, W, H, (x, y) => {
      const row = Math.floor(y / BH), off = row % 2 ? BL / 2 : 0, bx = x + off, col = Math.floor(bx / BL);
      const lx = bx - col * BL, ly = y - row * BH;
      const joint = Math.min(lx, BL - lx, ly, BH - ly);
      const pores = wo(x * 900, y * 900, 4096, 4096).f1;
      const g = nA(x * 30, y * 30, 4096, 4096) * 0.5 + nB(x * 200, y * 200, 4096, 4096) * 0.5;
      let c = mul(rgb([230, 222, 206]), 0.95 + 0.05 * g - 0.06 * (1 - sstep(0.05, 0.25, pores)) + 0.03 * hash2(col, row));
      let h = 0.2 * g - 0.4 * (1 - sstep(0.05, 0.2, pores)), rough = 0.95, metal = 0;
      if (joint < 0.0008) { c = mul(c, 0.82); h = -0.6; }
      for (const gy of grooves) {
        const d = y - gy;
        const near = Math.exp(-((d / 0.03) ** 2));
        c = mix3(c, rgb([214, 190, 150]), 0.25 * near);
        if (Math.abs(d) < gh / 2) {
          // 槽：往里凹、上沿投一道阴影；槽里是一圈圈的电热丝（侧面看是一排斜的亮线）
          const t = (d + gh / 2) / gh;
          c = mix3(rgb([150, 138, 120]), rgb([196, 184, 164]), t);
          h = -1;
          const ph = fract(x / 0.0055 + t * 0.6);
          const wire = 1 - sstep(0.12, 0.22, Math.abs(ph - 0.5));
          const inCoil = sstep(0.1, 0.2, t) * (1 - sstep(0.8, 0.9, t));
          if (wire * inCoil > 0.05) { c = mix3(c, rgb([150, 148, 146]), wire * inCoil); h = -0.3 * wire * inCoil - 1 * (1 - wire * inCoil); metal = wire * inCoil * 0.8; rough = mix(0.95, 0.45, wire * inCoil); }
        }
      }
      for (const [sx, sy, sr, ci] of spots) {
        const d = Math.hypot(x - sx, (y - sy) * 0.8);
        if (d < sr) { c = mix3(c, spotCols[ci], 0.8); rough = 0.15; h = 0.5; }
      }
      return [c, h, rough, metal];
    }, M);
  }

  // —— 控制器面板：黑色面板，左上一块红色数码管（1222，自发光），下面几行小字，右边一块 3 × 4 的按键 ——
  {
    const [W, H] = size('controller'), b = box('controller'), fill = gp(out, S, b, W, H);
    region(out, S, b, W, H, (x, y) => [mul(rgb([26, 26, 28]), 0.95 + 0.06 * nC(x * 300, y * 300)), 0, 0.45, 0]);
    fill((x, y) => Math.abs(sdRoundRect(x, y, W / 2, H / 2, W / 2 - 0.003, H / 2 - 0.003, 0.004)) - 0.0005, [0, 0, W, H], { color: rgb([110, 110, 114]) });
    fill(...rect(0.012, 0.012, 0.1, 0.046, 0.002), { color: rgb([40, 6, 8]), rough: 0.1, height: -0.3 });
    const red = rgb([255, 48, 36]);
    text(fill, '1222', 0.056, 0.017, 0.024, { align: 'center', stroke: 0.2, color: red, emit: mul(red, 1.2) });
    const lab = { color: rgb([210, 210, 206]) };
    text(fill, 'TEMP', 0.012, 0.052, 0.0055, { stroke: 0.16, ...lab });
    text(fill, 'CONE 6', 0.012, 0.062, 0.0055, { stroke: 0.16, ...lab });
    text(fill, 'SLOW GLAZE', 0.012, 0.072, 0.0055, { stroke: 0.16, ...lab });
    fill(circle(0.092, 0.057, 0.0025), bbC(0.092, 0.057, 0.003), { color: rgb([60, 230, 100]), emit: rgb([60, 240, 110]) });
    text(fill, 'ON', 0.092, 0.062, 0.0045, { align: 'center', stroke: 0.16, ...lab });
    text(fill, 'TRYITEM', 0.012, 0.085, 0.0065, { stroke: 0.17, color: rgb([226, 186, 104]) });
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'E', '0', 'S'];
    keys.forEach((kk, i) => {
      const cx = 0.132 + (i % 3) * 0.021, cy = 0.02 + Math.floor(i / 3) * 0.021;
      fill(...rect(cx - 0.0085, cy - 0.0085, cx + 0.0085, cy + 0.0085, 0.0025), { color: rgb([196, 196, 200]), height: 0.6, rough: 0.5 });
      text(fill, kk, cx, cy - 0.0035, 0.007, { align: 'center', stroke: 0.18, color: INK });
    });
  }
  // —— 窑的铭牌：拉丝铝，黑字，四颗铆钉 ——
  {
    const [W, H] = size('kilnPlate'), b = box('kilnPlate'), fill = gp(out, S, b, W, H), ink = { color: INK };
    region(out, S, b, W, H, (x, y) => [mul(rgb([204, 206, 210]), 0.94 + 0.08 * nC(x * 900, y * 30)), 0, 0.3, 1]);
    text(fill, 'TRYITEM KILN WORKS', W / 2, 0.006, fitH('TRYITEM KILN WORKS', 0.0085, W * 0.86), { align: 'center', stroke: 0.17, ...ink });
    text(fill, 'MODEL K-18  CONE 10', W / 2, 0.019, 0.0048, { align: 'center', stroke: 0.15, ...ink });
    text(fill, '240V  48A  11.5KW', W / 2, 0.028, 0.0048, { align: 'center', stroke: 0.15, ...ink });
    for (const [x, y] of [[0.004, 0.004], [W - 0.004, 0.004], [0.004, H - 0.004], [W - 0.004, H - 0.004]]) fill(circle(x, y, 0.0018), bbC(x, y, 0.002), { color: rgb([230, 232, 236]), height: 0.9 });
  }
  // —— 高温警示贴：黄底黑框，左边三角形里一个感叹号，CAUTION / HOT SURFACE ——
  {
    const [W, H] = size('hotSticker'), b = box('hotSticker'), fill = gp(out, S, b, W, H), ink = { color: INK };
    region(out, S, b, W, H, () => [rgb([238, 192, 32]), 0, 0.5, 0]);
    fill((x, y) => Math.abs(sdRoundRect(x, y, W / 2, H / 2, W / 2 - 0.0015, H / 2 - 0.0015, 0.0015)) - 0.0005, [0, 0, W, H], ink);
    const tri = [[0.004, 0.021], [0.0135, 0.004], [0.023, 0.021]];
    fill((x, y) => sdPoly(x, y, tri) - 0.0006, [0.003, 0.003, 0.024, 0.022], ink);
    fill((x, y) => sdSeg(x, y, [0.0135, 0.009], [0.0135, 0.0155], 0.0016), [0.012, 0.008, 0.015, 0.017], { color: rgb([238, 192, 32]) });
    fill(circle(0.0135, 0.0185, 0.001), bbC(0.0135, 0.0185, 0.0012), { color: rgb([238, 192, 32]) });
    text(fill, 'CAUTION', 0.061, 0.004, 0.0072, { align: 'center', stroke: 0.18, ...ink });
    text(fill, 'HOT SURFACE', 0.061, 0.014, 0.0058, { align: 'center', stroke: 0.17, ...ink });
  }
  // —— 泥袋：半透明的塑料袋里透出灰色的泥，塑料的皱褶和反光；正中一张白标签 ——
  {
    const [W, H] = size('clayBag'), b = box('clayBag'), fill = gp(out, S, b, W, H);
    region(out, S, b, W, H, (x, y) => {
      const cr = nA(x * 12, y * 30, 4096, 4096) * 0.6 + nB(x * 40, y * 60, 4096, 4096) * 0.4;
      const hi = sstep(0.35, 0.7, cr);
      return [mix3(mul(rgb([128, 132, 134]), 0.95 + 0.08 * cr), rgb([214, 220, 226]), 0.4 * hi), cr * 0.8, 0.22 - 0.1 * hi, 0];
    });
    fill(...rect(0.07, 0.03, 0.23, 0.12, 0.004), { color: rgb([240, 240, 236]), rough: 0.6, height: 0.3 });
    const blue = rgb([30, 64, 150]), red = rgb([186, 36, 36]);
    text(fill, 'TRYITEM CLAY CO.', 0.15, 0.037, fitH('TRYITEM CLAY CO.', 0.009, 0.14), { align: 'center', stroke: 0.17, color: red });
    text(fill, 'STONEWARE', 0.15, 0.055, fitH('STONEWARE', 0.02, 0.145), { align: 'center', stroke: 0.19, color: blue });
    text(fill, 'CONE 5-6', 0.11, 0.1, 0.0085, { align: 'center', stroke: 0.17, color: INK });
    text(fill, '10 KG', 0.19, 0.1, 0.0085, { align: 'center', stroke: 0.17, color: INK });
  }
  // —— 转盘的铝面：一圈圈同心的刻线（1cm 一圈）、正中一个小圆点 ——
  {
    const [W, H] = size('turntable'), b = box('turntable'), c = W / 2;
    region(out, S, b, W, H, (x, y) => {
      const r = Math.hypot(x - c, y - c), ring = Math.abs(fract(r / 0.01 + 0.5) - 0.5) * 0.01;
      const line = 1 - sstep(0.00015, 0.0004, ring), turn = 0.5 + 0.5 * Math.sin(r * 3000);
      const center = r < 0.003 ? 1 : 0;
      return [mul(rgb([206, 208, 212]), (0.93 + 0.05 * turn) * (1 - 0.35 * line) * (1 - 0.6 * center)), -line - center, 0.26 + 0.04 * turn, 1];
    });
  }
  // —— 帆布台面：米色的帆布（经纬交织），沾着一片片灰褐色的泥印和泥浆点，中间揉泥的地方最脏 ——
  {
    const [W, H] = size('canvas'), b = box('canvas');
    region(out, S, b, W, H, (x, y) => {
      const wx = Math.sin((TAU * x) / 0.0022), wy = Math.sin((TAU * y) / 0.0022);
      const weave = 0.5 + 0.25 * (wx * Math.sign(wy) + wy * Math.sign(wx));
      const g = nA(x * 4, y * 4, 4096, 4096) * 0.6 + nB(x * 16, y * 16, 4096, 4096) * 0.4;
      const center = Math.exp(-(((x - 0.45) / 0.3) ** 2 + ((y - 0.38) / 0.22) ** 2));
      const stain = sstep(0.1, 0.55, g + 0.5 * center - 0.2);
      const splat = wo(x * 40, y * 40, 4096, 4096), dot = (1 - sstep(0.04, 0.09, splat.f1)) * (splat.id > 0.75 ? 1 : 0);
      let c = mul(rgb([212, 202, 184]), 0.92 + 0.12 * weave);
      c = mix3(c, rgb([150, 138, 124]), 0.55 * stain);
      c = mix3(c, rgb([168, 160, 150]), 0.7 * dot);
      return [c, 0.5 * weave + 0.3 * stain + 0.4 * dot, 0.95 - 0.1 * stain, 0];
    });
  }
  return out;
}

// ——————————————————————— 泥坯 ———————————————————————
// 周期 0.2m 可以平铺：中性的浅灰泥，一粒粒砂点和深色的小颗粒，淡淡的斑驳；沿 v 方向一道道拉坯的旋纹（6.5mm 一道，深浅起伏），
// 再加几道更宽的手指印。颜色在材质里染（生坯灰、素烧的粉白、湿泥的灰褐）
export function claybody(S, P) {
  const out = alloc(S), n = perlin(P.seed), n2 = perlin(P.seed + 1), wo = worley(P.seed + 2);
  region(out, S, [0, 0, S, S], 1, 1, (u, v) => {
    const ringA = Math.sin(TAU * v * 31 + 1.8 * n(u * 3, v * 12, 3, 12));
    const ringAmp = 0.55 + 0.45 * n2(u * 4, v * 6, 4, 6);
    const finger = Math.sin(TAU * v * 9 + 2.5 * n(u * 2 + 7, v * 3, 2, 3));
    const grit = fract(Math.sin(Math.floor(u * S) * 12.9898 + Math.floor(v * S) * 78.233) * 43758.5453) - 0.5;
    const spk = wo(u * 160, v * 160, 160, 160), speck = spk.id > 0.9 ? 1 - sstep(0.05, 0.12, spk.f1) : 0;
    const mottle = n(u * 8, v * 8, 8, 8) * 0.5 + n2(u * 30, v * 30, 30, 30) * 0.3;
    const c = mul(rgb([214, 210, 204]), (0.95 + 0.06 * mottle + 0.06 * grit + 0.02 * ringA * ringAmp) * (1 - 0.35 * speck));
    return [c, 0.45 * ringA * ringAmp + 0.25 * finger + 0.15 * grit - 0.3 * speck, 0.86 - 0.06 * mottle];
  });
  return out;
}

// ——————————————————————— 刷白的砖墙 ———————————————————————
// 周期 1 × 0.6m（和红砖墙一样的砌法：一块砖 24 × 6.5cm、灰缝 1cm，每层错半块）：砖和灰缝上刷了一层石灰白，
// 砖的棱角、凸起的地方和一片片薄的地方透出底下的红砖，灰缝凹进去、白得发灰
export function brickWhite(S, P) {
  const out = alloc(S), n = perlin(P.seed), n2 = perlin(P.seed + 1);
  const W = 1, H = 0.6, BL = 0.25, CH = 0.075, J = 0.01, NC = 4, NR = 8;
  const rnd = mulberry(P.seed + 5);
  const bricks = Array.from({ length: NC * NR }, () => ({ k: 0.96 + 0.06 * rnd(), wash: 0.4 + 0.6 * rnd(), red: [[160, 78, 54], [176, 92, 62], [140, 70, 50]][Math.floor(rnd() * 3)] }));
  region(out, S, [0, 0, S, S], W, H, (x, y) => {
    const row = Math.floor(y / CH), off = row % 2 ? BL / 2 : 0;
    const bx = x + off, col = Math.floor(bx / BL), cm = ((col % NC) + NC) % NC;
    const lx = bx - col * BL, ly = y - row * CH, b = bricks[cm + (row % NR) * NC];
    const d = Math.min(lx - J / 2, BL - J / 2 - lx, ly - J / 2, CH - J / 2 - ly);
    const u = x / W, v = y / H;
    const sand = 0.5 * n(u * 600, v * 360, 600, 360) + 0.5 * n(u * 120, v * 72, 120, 72);
    const lime = rgb([234, 230, 220]);
    if (d < 0) return [mul(mix3(lime, rgb([196, 190, 178]), 0.35), 0.95 + 0.08 * sand), -1 + 0.1 * sand, 0.95];
    const edge = sstep(0, 0.006, d);
    // 石灰薄的地方：棱角（离灰缝近）、砖面上的一片片（低频噪声）、砂眼
    const patch = n2(u * 30 + cm * 1.7, v * 18 + row * 2.3, 30, 18) * 0.55 + n(u * 110, v * 66, 110, 66) * 0.45;
    const pit = n(u * 1400, v * 840, 1400, 840) > 0.58 ? 1 : 0;
    const bare = clamp01(sstep(0.36, 0.72, patch + 0.3 * (1 - b.wash)) * 0.6 + (1 - edge) * 0.6 * sstep(0, 0.45, patch) + 0.5 * pit);
    // 透出来的不是纯红砖色：石灰没刷匀的地方是一层粉红
    const under = mix3(lime, mul(rgb(b.red), 0.95 + 0.1 * sand), 0.72);
    const c = mix3(mul(lime, b.k * (0.96 + 0.05 * sand)), under, bare);
    return [c, -1 + 2 * edge + 0.2 * sand - 0.15 * bare - 0.3 * pit, 0.95];
  });
  return out;
}

// ——————————————————————— 陶土六角砖地面 ———————————————————————
// 周期 1 × 1m：平顶的六角砖，横向 3 组、纵向 5 组（每组两块），砖对边 19cm（纵向拉长 4%，才能整除 1m）；
// 砖缝 8mm、米灰色；每块砖的颜色不一样（橘红、砖红、浅橙、褐），边上烧得深一点，表面有细的砂眼和一层半哑光的保护蜡
export function terracottaHex(S, P) {
  const out = alloc(S), n = perlin(P.seed), n2 = perlin(P.seed + 1);
  const R = 1 / 9, st = 1 / (5 * Math.sqrt(3)) / R, a = (R * Math.sqrt(3)) / 2, gw = 0.004;
  const pal = [[196, 104, 64], [184, 92, 56], [208, 124, 78], [172, 88, 56], [214, 142, 98], [160, 80, 52]].map(rgb);
  region(out, S, [0, 0, S, S], 1, 1, (x, y) => {
    const yy = y / st;       // 纵向压回正六边形
    let best = null;
    for (const [ox, oy] of [[0, 0], [1.5 * R, a]]) {
      const i = Math.round((x - ox) / (3 * R)), j = Math.round((yy - oy) / (2 * a));
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const cx = ox + (i + di) * 3 * R, cy = oy + (j + dj) * 2 * a, d = Math.hypot(x - cx, yy - cy);
        if (!best || d < best.d) best = { d, cx, cy, id: [((i + di) % 3 + 3) % 3 + (ox ? 3 : 0), ((j + dj) % 5 + 5) % 5] };
      }
    }
    const px = Math.abs(x - best.cx), py = Math.abs(yy - best.cy);
    const sd = Math.max(py, px * (Math.sqrt(3) / 2) + py * 0.5) - a;   // 平顶六边形的有符号距离
    const g = n(x * 60, y * 60, 60, 60) * 0.5 + n2(x * 300, y * 300, 300, 300) * 0.5;
    if (sd > -gw) return [mul(rgb([188, 178, 160]), 0.94 + 0.08 * g), -1, 0.9];
    const t = hash2(best.id[0], best.id[1], 11);
    const baseC = mix3(pal[Math.floor(t * pal.length)], pal[Math.floor(hash2(best.id[0], best.id[1], 13) * pal.length)], 0.35);
    const edge = sstep(-gw - 0.02, -gw, sd), round = sstep(-gw, -gw - 0.004, sd);
    const pits = n2(x * 900, y * 900, 900, 900) > 0.62 ? 1 : 0;
    const mottle = n(x * 12 + t * 9, y * 12, 12, 12);
    let c = mul(baseC, (0.9 + 0.12 * mottle + 0.05 * g) * (1 - 0.18 * edge) * (1 - 0.25 * pits));
    return [c, -0.6 + 0.9 * round + 0.15 * g - 0.3 * pits, 0.42 + 0.2 * (1 - round) + 0.1 * g];
  });
  return out;
}
