// 排练室的程序化贴图：排练室图集（底鼓前皮的鼓牌、涂层鼓皮、镲片、吉他琴身的日落色、指板、琴头、音箱面板、铭牌、纯色格子），
// 鼓身的红色闪粉贴皮、音箱网布、吸音棉、地毯拼块。
import { perlin, fbm, mulberry, worley } from './noise.js';
import { BAND_ATLAS } from './atlas.js';
import { sdRoundRect, sdSeg, sdPoly } from './laundry-textures.js';
import { text, textWidth } from './gym-textures.js';
import { bodyOutline, signedDist, fretY, FRETS, NUT, BOARD, boardHalf } from '../band/outline.js';

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
  if (e && out.emit) { out.emit[i * 3] = e[0]; out.emit[i * 3 + 1] = e[1]; out.emit[i * 3 + 2] = e[2]; }
}
// 一块区域逐像素：f(x, y) → [color, height, rough, metal]，(x, y) 是区域里的物理坐标（区域左上角为原点、y 向下）
function region(out, S, box, W, H, f) {
  const [x0, y0, x1, y1] = box, sx = (x1 - x0) / W, sy = (y1 - y0) / H;
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const [c, h, r, m] = f((i + 0.5 - x0) / sx, (j + 0.5 - y0) / sy);
    put(out, j * S + i, c, h, r, m ?? 0);
  }
}
// 按物理坐标作画的 SDF 画笔（同游戏室）：color / rough / height / metal 可选，alpha 整体不透明度
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
// 五角星（圆心、外接圆半径）
const starPts = (cx, cy, R) => Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.42 : R;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
});

export function bandAtlas(S, P) {
  const A = BAND_ATLAS, k = S / A.size;
  const out = alloc(S, true);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nA = perlin(P.seed + 1), nB = perlin(P.seed + 2), nC = perlin(P.seed + 3), nD = perlin(P.seed + 4);
  const rnd = mulberry(P.seed + 5);
  const white = [0.93, 0.92, 0.88];

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

  // —— 底鼓前皮：黑色的膜，上面一枚红底白字的鼓牌；右下一个出音孔，孔边一圈亮黑的加强圈 ——
  {
    const b = box('kickHead'), K = A.kick, W = K.w, c0 = W / 2;
    // 物理坐标（左上原点、y 向下）↔ 前皮坐标（中心原点、y 向上）
    const toHead = (x, y) => [x - c0, c0 - y];
    region(out, S, b, W, W, (x, y) => {
      const [hx, hy] = toHead(x, y);
      const n = 0.5 + 0.5 * nA(hx * 40, hy * 40);
      return [mix3([0.028, 0.028, 0.032], [0.05, 0.05, 0.056], n), n * 0.1, 0.32];
    });
    const fill = gp(out, S, b, W, W);
    const [lx, ly] = [c0 + K.logo[0], c0 - K.logo[1]], R = K.logoR;
    const disc = (r) => (x, y) => Math.hypot(x - lx, y - ly) - r;
    const ring = (r0, r1) => (x, y) => { const d = Math.hypot(x - lx, y - ly); return Math.max(r0 - d, d - r1); };
    const bb = [lx - R - 0.01, ly - R - 0.01, lx + R + 0.01, ly + R + 0.01];
    fill(disc(R), bb, { color: white, rough: 0.3, height: 0.3 });
    fill(disc(R - 0.007), bb, { color: rgb([176, 22, 24]), rough: 0.28 });
    fill(ring(R - 0.016, R - 0.013), bb, { color: white });
    // 红底上的一道斜向高光（印刷的渐变）
    fill(disc(R - 0.007), bb, { color: rgb([214, 50, 44]), alpha: 0.35 });
    fill((x, y) => Math.max(disc(R - 0.02)(x, y), (y - ly) - 0.35 * (x - lx) + 0.02), bb, { color: rgb([150, 14, 18]), alpha: 0.5 });
    const h1 = 0.04, w1 = textWidth('TRYITEM', h1);
    text(fill, 'TRYITEM', lx, ly - h1 / 2 - 0.004, h1, { align: 'center', stroke: 0.24, color: white, height: 0.5 });
    text(fill, 'DRUM CO.', lx, ly + 0.03, 0.018, { align: 'center', stroke: 0.2, color: white, height: 0.5 });
    text(fill, 'EST 2026', lx, ly - 0.072, 0.012, { align: 'center', stroke: 0.2, color: white });
    for (const s of [-1, 1]) {
      const pts = starPts(lx + s * (w1 / 2 - 0.012), ly - 0.066, 0.011);
      fill((x, y) => sdPoly(x, y, pts), [lx + s * (w1 / 2 - 0.012) - 0.012, ly - 0.078, lx + s * (w1 / 2 - 0.012) + 0.012, ly - 0.054], { color: white });
    }
    // 出音孔：孔里是黑的（几何上挖掉了），孔边一圈加强圈，圈上四颗小螺丝
    const [px0, py0] = [c0 + K.port[0], c0 - K.port[1]];
    const pr = (x, y) => Math.hypot(x - px0, y - py0);
    const pbb = [px0 - K.ringR - 0.004, py0 - K.ringR - 0.004, px0 + K.ringR + 0.004, py0 + K.ringR + 0.004];
    fill((x, y) => pr(x, y) - K.ringR, pbb, { color: [0.012, 0.012, 0.014], rough: 0.12, height: 0.8 });
    fill((x, y) => Math.abs(pr(x, y) - (K.portR + K.ringR) / 2) - 0.0008, pbb, { color: [0.1, 0.1, 0.11], rough: 0.2 });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, sx = px0 + Math.cos(a) * 0.0545, sy = py0 + Math.sin(a) * 0.0545;
      fill((x, y) => Math.hypot(x - sx, y - sy) - 0.0018, [sx - 0.003, sy - 0.003, sx + 0.003, sy + 0.003], { color: [0.55, 0.55, 0.58], rough: 0.2, metal: 1, height: 1 });
    }
  }

  // —— 打击面的涂层鼓皮（白色磨砂涂层，中间一片鼓棒敲出来的灰印子，边上印着牌子）：单位圆，R ≈ 14 寸鼓 ——
  {
    const b = box('batter');
    region(out, S, b, 2, 2, (x, y) => {
      const a = x - 1, c = 1 - y, r = Math.hypot(a, c);
      const coat = 0.5 + 0.5 * fbm(nB, a * 0.5 + 0.5, c * 0.5 + 0.5, 12, 12, 4) + 0.08 * (hash2(Math.floor(x * 400), Math.floor(y * 400), 3) - 0.5);
      let col = mix3([0.86, 0.85, 0.8], [0.93, 0.92, 0.88], coat);
      // 敲出来的印子：中间偏下一片，越靠中心越密
      const wear = sstep(0.55, 0.05, Math.hypot(a * 0.9, (c + 0.12) * 1.1)) * (0.55 + 0.45 * nC(a * 9, c * 9));
      col = mix3(col, [0.72, 0.71, 0.68], wear * 0.45);
      const collar = sstep(0.93, 0.99, r);
      col = mix3(col, [0.8, 0.79, 0.75], collar);
      return [col, coat * 0.25 - collar * 0.3, 0.62 - wear * 0.12];
    });
    const fill = gp(out, S, b, 2, 2);
    // 一道道鼓棒印：细长的灰色短痕，方向大致朝着鼓手
    for (let i = 0; i < 90; i++) {
      const r = 0.42 * Math.sqrt(rnd()), t = rnd() * Math.PI * 2;
      const cx = 1 + r * Math.cos(t), cy = 1 + 0.12 + r * Math.sin(t) * 0.8, ang = Math.PI / 2 + (rnd() - 0.5) * 0.9, L = 0.02 + 0.03 * rnd();
      const p0 = [cx - Math.cos(ang) * L, cy - Math.sin(ang) * L], p1 = [cx + Math.cos(ang) * L, cy + Math.sin(ang) * L];
      fill((x, y) => sdSeg(x, y, p0, p1, 0.006 + 0.006 * rnd()), [cx - L - 0.02, cy - L - 0.02, cx + L + 0.02, cy + L + 0.02], { color: [0.58, 0.57, 0.55], alpha: 0.18 + 0.2 * rnd() });
    }
    text(fill, 'TRYITEM', 1, 1.68, 0.075, { align: 'center', stroke: 0.2, color: [0.2, 0.2, 0.22], alpha: 0.85 });
    text(fill, 'COATED', 1, 1.78, 0.045, { align: 'center', stroke: 0.2, color: [0.2, 0.2, 0.22], alpha: 0.85 });
  }

  // —— 镲片：青铜（B20），一圈圈车纹、满面的锤痕、光亮的碗，印着牌子：单位圆 ——
  {
    const b = box('cymbal');
    const hammer = worley(P.seed + 20);
    region(out, S, b, 2, 2, (x, y) => {
      const a = x - 1, c = 1 - y, r = Math.hypot(a, c);
      const bell = sstep(0.27, 0.2, r);
      const grooveAmp = 0.6 + 0.4 * nD(r * 30, 0.5);
      const groove = Math.sin(r * Math.PI * 2 * 62 + 2.5 * nD(r * 6, 3.3)) * grooveAmp;
      const w = hammer(a * 7 + 7, c * 7 + 7, 14, 14);
      const dent = sstep(0.34, 0.0, w.f1) * (1 - bell) * sstep(0.97, 0.9, r);
      let col = mix3([0.66, 0.46, 0.22], [0.86, 0.66, 0.36], 0.55 + 0.25 * groove * (1 - bell) + 0.2 * bell);
      col = mul(col, 1 - 0.07 * dent + 0.02 * (w.id - 0.5));
      const edge = sstep(0.95, 1.0, r);
      col = mix3(col, [0.5, 0.36, 0.2], edge * 0.6);
      return [col, groove * 0.08 * (1 - bell) - dent * 0.35, mix(0.3 + 0.06 * groove, 0.18, bell), 1];
    });
    const fill = gp(out, S, b, 2, 2);
    const ink = { color: [0.03, 0.03, 0.03], rough: 0.55, metal: 0 };
    text(fill, 'TRYITEM', 1, 1.36, 0.12, { align: 'center', stroke: 0.2, ...ink });
    text(fill, 'B20 BRONZE', 1, 1.52, 0.055, { align: 'center', stroke: 0.18, ...ink });
    text(fill, 'HAND HAMMERED', 1, 0.44, 0.04, { align: 'center', stroke: 0.18, ...ink, alpha: 0.9 });
  }

  // —— 电吉他琴身：三色日落渐变（边上深褐 → 红 → 中间琥珀），底下透出赤杨木的直纹，亮光漆 ——
  {
    const b = box('body'), B = A.body, W = B.x1 - B.x0, H = B.y1 - B.y0;
    const poly = bodyOutline(10);
    region(out, S, b, W, H, (px, py) => {
      const x = B.x0 + px, y = B.y1 - py;
      const d = signedDist(poly, x, y), t = clamp01(d / 0.048);
      const grain = nA(x * 90 + 3 * nB(x * 8, y * 6), y * 5) * 0.6 + nC(x * 300, y * 12) * 0.4;
      let col = mix3([0.07, 0.03, 0.015], [0.5, 0.1, 0.035], sstep(0.0, 0.36, t));
      col = mix3(col, [0.88, 0.58, 0.13], sstep(0.26, 0.9, t));
      col = mul(col, 1 + 0.09 * grain * (0.3 + 0.7 * t));
      return [col, grain * 0.04, 0.12];
    });
  }

  // —— 指板：玫瑰木（深褐、顺纹的黑条、棕眼），品位的细缝，贝母圆点（3、5、7、9、12 双点、15 ~ 21）——
  {
    const b = box('board'), L = NUT - BOARD.end, Wb = A.board.w;
    region(out, S, b, L, Wb, (u, v) => {
      const y = NUT - u, x = -Wb / 2 + v;
      const streak = fbm(nB, u / L, v / Wb, 3, 24, 4);
      const pore = sstep(0.55, 0.75, nC(u * 900, x * 2600));
      let col = mix3([0.25, 0.12, 0.06], [0.13, 0.06, 0.03], clamp01(0.5 + streak * 1.6));
      col = mul(col, 1 - 0.35 * pore);
      let slot = 0;
      for (let n = 1; n <= FRETS; n++) slot = Math.max(slot, sstep(0.0006, 0.0002, Math.abs(y - fretY(n))));
      col = mul(col, 1 - 0.6 * slot);
      return [col, streak * 0.2 - pore * 0.3 - slot * 0.5, 0.5];
    });
    const fill = gp(out, S, b, L, Wb);
    const dot = (y, x) => {
      const cx = NUT - y, cy = x + Wb / 2;
      fill((px, py) => Math.hypot(px - cx, py - cy) - 0.003, [cx - 0.005, cy - 0.005, cx + 0.005, cy + 0.005],
        { color: mix3([0.9, 0.88, 0.82], [0.8, 0.86, 0.9], rnd()), rough: 0.25, height: 0.4 });
    };
    for (const n of [3, 5, 7, 9, 15, 17, 19, 21]) dot((fretY(n - 1) + fretY(n)) / 2, 0);
    const y12 = (fretY(11) + fretY(12)) / 2;
    dot(y12, -boardHalf(y12) * 0.5);
    dot(y12, boardHalf(y12) * 0.5);
  }

  // —— 琴头：枫木（浅琥珀、亮光漆、顺纹），黑色的标沿着琴头竖排 ——
  {
    const b = box('head'), Hd = A.head, Wh = Hd.x1 - Hd.x0;
    region(out, S, b, Hd.len, Wh, (u, v) => {
      const x = Hd.x0 + v;
      const g = nA(u * 12, x * 400 + 2 * nB(u * 20, x * 30)) * 0.6 + nD(u * 60, x * 900) * 0.4;
      return [mul([0.87, 0.71, 0.45], 1 + 0.07 * g), g * 0.05, 0.2];
    });
    const fill = gp(out, S, b, Hd.len, Wh);
    const ink = { color: [0.05, 0.04, 0.035], rough: 0.3 };
    // 标：从上弦枕往外 8cm 起，字头朝低音侧（琴竖起来看是从下往上读）
    text(fill, 'TRYITEM', 0.082, -0.003 - Hd.x0 - 0.0065, 0.013, { stroke: 0.2, ...ink });
    text(fill, 'SONIC', 0.086, -0.003 - Hd.x0 + 0.0095, 0.0055, { stroke: 0.18, ...ink });
  }

  // —— 音箱铭牌：拉丝银的小牌子，黑色的字 ——
  {
    const b = box('badge'), { w: W, h: H } = A.badge;
    region(out, S, b, W, H, (x, y) => {
      const br = nA(x * 3000, y * 40) * 0.5 + 0.5;
      return [mul([0.8, 0.8, 0.82], 0.9 + 0.12 * br), br * 0.05, 0.28, 1];
    });
    const fill = gp(out, S, b, W, H);
    fill((x, y) => Math.abs(sdRoundRect(x, y, W / 2, H / 2, W / 2 - 0.004, H / 2 - 0.004, 0.004)) - 0.0008, [0, 0, W, H], { color: [0.08, 0.08, 0.09], metal: 0, rough: 0.5 });
    text(fill, 'TRYITEM', W / 2, H / 2 - 0.0095, 0.019, { align: 'center', stroke: 0.2, color: [0.05, 0.05, 0.06], metal: 0, rough: 0.45, height: -0.5 });
  }

  // —— 音箱面板：黑面板、白字；输入口、六个旋钮（每个一圈刻度、两头的 1 和 10）、电源开关、指示灯 ——
  {
    const b = box('panel'), Pn = A.panel, { w: W, h: H } = Pn;
    region(out, S, b, W, H, (x, y) => {
      const n = nA(x * 400, y * 40) * 0.5 + 0.5;
      return [mix3([0.03, 0.03, 0.035], [0.05, 0.05, 0.055], n), 0, 0.35];
    });
    const fill = gp(out, S, b, W, H);
    const ink = { color: [0.9, 0.89, 0.86], rough: 0.4 };
    fill((x, y) => Math.abs(sdRoundRect(x, y, W / 2, H / 2, W / 2 - 0.004, H / 2 - 0.004, 0.003)) - 0.0005, [0, 0, W, H], { color: [0.6, 0.6, 0.62] });
    text(fill, 'INPUT', (Pn.jacks[0] + Pn.jacks[1]) / 2, 0.016, 0.0055, { align: 'center', stroke: 0.17, ...ink });
    Pn.jacks.forEach((jx, i) => text(fill, String(i + 1), jx, 0.07, 0.005, { align: 'center', stroke: 0.17, ...ink }));
    ['VOLUME', 'TREBLE', 'BASS', 'REVERB', 'SPEED', 'INTENSITY'].forEach((lab, i) => {
      const cx = Pn.knobs[i], cy = Pn.knobY;
      text(fill, lab, cx, 0.016, 0.0055, { align: 'center', stroke: 0.17, ...ink });
      for (let t = 0; t <= 10; t++) {
        const a = Math.PI * (0.75 + (1.5 * t) / 10), r0 = 0.0175, r1 = t % 5 === 0 ? 0.0215 : 0.0195;
        const p0 = [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], p1 = [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1];
        fill((x, y) => sdSeg(x, y, p0, p1, 0.0007), [cx - 0.024, cy - 0.024, cx + 0.024, cy + 0.024], ink);
      }
      text(fill, '1', cx - 0.019, cy + 0.017, 0.0035, { align: 'center', stroke: 0.17, ...ink });
      text(fill, '10', cx + 0.019, cy + 0.017, 0.0035, { align: 'center', stroke: 0.17, ...ink });
    });
    text(fill, 'POWER', Pn.power, 0.016, 0.0055, { align: 'center', stroke: 0.17, ...ink });
    text(fill, 'ON', Pn.power, 0.072, 0.0045, { align: 'center', stroke: 0.17, ...ink });
    text(fill, 'TRYITEM', (Pn.jacks[0] + Pn.jacks[1]) / 2, 0.079, 0.0045, { align: 'center', stroke: 0.2, ...ink });
  }
  return out;
}

// ——————————————————————— 鼓身的红色闪粉贴皮 ———————————————————————
// 深红的底，密密一层金属亮片（大多是红的、少数银白），外面罩一层清漆（材质里的 clearcoat）。周期平铺
export function sparkle(S, P) {
  const out = alloc(S);
  const n = perlin(P.seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = x / S, v = y / S;
    const low = fbm(n, u, v, 4, 4, 3);
    const h = hash2(x, y, P.seed), h2 = hash2(x + 17, y + 31, P.seed), h3 = hash2(x + 5, y + 71, P.seed);
    if (h > 0.62) {
      const bright = 0.45 + 0.55 * h2;
      const col = h3 < 0.12 ? mul([0.92, 0.88, 0.9], bright) : h3 < 0.3 ? mul([1.0, 0.45, 0.4], bright) : mul([0.95, 0.12, 0.1], bright);
      put(out, i, col, 0.2 * bright, 0.22, 1);
    } else {
      put(out, i, mul(P.base, 1 + 0.12 * low), 0, 0.28, 0.25);
    }
  }
  return out;
}

// ——————————————————————— 音箱网布 ———————————————————————
// 平纹：经线一根银一根黑、纬线都是银的，线与线之间的缝是暗的。周期平铺，一张图 32 × 32 根线
export function grille(S, P) {
  const out = alloc(S);
  const p = S / 32, n = perlin(P.seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = Math.floor(x / p), j = Math.floor(y / p), fx = (x + 0.5) / p - i, fy = (y + 0.5) / p - j;
    const warpTop = (i + j) % 2 === 0;
    const f = warpTop ? fx : fy, along = warpTop ? fy : fx;
    const prof = Math.sin(Math.PI * f), bulge = Math.sin(Math.PI * along);
    const dark = warpTop && i % 2 === 1;
    let col = dark ? [0.2, 0.2, 0.21] : [0.68, 0.68, 0.66];
    col = mul(col, (0.68 + 0.32 * prof) * (0.92 + 0.08 * n(x / p * 0.5, y / p * 0.5, 16, 16)));
    put(out, y * S + x, col, prof * (0.6 + 0.4 * bulge), 0.62);
  }
  return out;
}

// ——————————————————————— 吸音棉 ———————————————————————
// 炭黑的开孔海绵：一个个泡孔（Worley 格子里面暗、孔壁亮），再加一层细碎的起伏。周期平铺
export function foam(S, P) {
  const out = alloc(S);
  const w = worley(P.seed), n = perlin(P.seed + 1);
  const C = 48, C2 = 110;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const f = w(u * C, v * C, C, C), f2 = w(u * C2 + 7, v * C2 + 3, C2, C2);
    const wall = sstep(0.12, 0.0, f.f2 - f.f1), wall2 = sstep(0.1, 0.0, f2.f2 - f2.f1);
    const cell = sstep(0.1, 0.5, f.f1);
    const low = fbm(n, u, v, 6, 6, 3);
    const lum = 0.13 + 0.09 * wall + 0.04 * wall2 - 0.06 * cell + 0.025 * low;
    put(out, y * S + x, [lum, lum, lum * 1.05], 0.6 * wall + 0.3 * wall2 - 0.5 * cell, 1);
  }
  return out;
}

// ——————————————————————— 地毯拼块 ———————————————————————
// 50cm 的方块地毯，4 × 4 块一个周期（2m），相邻两块的绒毛方向转 90°（一块亮一块暗），块与块之间一道细缝；
// 深灰蓝的底上零星几根浅色的纤维
export function carpetTiles(S, P) {
  const out = alloc(S);
  const n = perlin(P.seed), m = perlin(P.seed + 1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const ti = Math.floor(u * 4), tj = Math.floor(v * 4), o = (ti + tj) % 2;
    const pile = o === 0 ? n(u * 90, v * 900, 90, 900) : n(u * 900, v * 90, 900, 90);
    const cloud = fbm(m, u, v, 8, 8, 3);
    const fu = u * 4 - ti, fv = v * 4 - tj;
    const seam = sstep(1.2 / (S / 4), 0, Math.min(fu, 1 - fu, fv, 1 - fv));
    const fleck = hash2(x, y, P.seed) > 0.985 ? 1 : 0;
    let col = mul(P.base, (o === 0 ? 1.0 : 0.88) * (1 + 0.08 * pile + 0.06 * cloud));
    col = mix3(col, [0.5, 0.52, 0.56], fleck * 0.5);
    col = mul(col, 1 - 0.35 * seam);
    put(out, y * S + x, col, pile * 0.4 + fleck * 0.3 - seam * 0.8, 0.95);
  }
  return out;
}
