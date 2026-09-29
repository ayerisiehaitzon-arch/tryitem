// 缝纫间的程序化贴图：缝纫间图集（缝纫机正面、针板、裙片纸样、切割垫、八块叠好的布、四十种线、软尺、木尺、纯色格子），
// 碎花棉布、碎花墙纸。
import { perlin, fbm, mulberry } from './noise.js';
import { SEW_ATLAS } from './atlas.js';
import { sdRoundRect, sdSeg, sdPoly } from './laundry-textures.js';
import { text } from './gym-textures.js';
import { MACHINE, SKIRT_PIECE } from '../sewing/layout.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
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
// 区域逐像素：f(x, y) → [color, height, rough, metal?, emit?]，(x, y) 是区域里的物理坐标（左上原点、y 向下）
function region(out, S, box, W, H, f) {
  const [x0, y0, x1, y1] = box, sx = (x1 - x0) / W, sy = (y1 - y0) / H;
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const [c, h, r, m, e] = f((i + 0.5 - x0) / sx, (j + 0.5 - y0) / sy);
    put(out, j * S + i, c, h, r, m ?? 0, e ?? null);
  }
}
// SDF 画笔（物理坐标，左上原点、y 向下）；emit：自发光颜色（按覆盖率混进去）
function gp(out, S, box, W, H) {
  const [bx0, by0, bx1, by1] = box;
  const sx = (bx1 - bx0) / W, sy = (by1 - by0) / H, px = 1 / Math.min(sx, sy);
  return (sdf, bb, { color = null, rough = null, height = null, metal = null, emit = null, alpha = 1 } = {}) => {
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
      if (emit && out.emit) for (let q = 0; q < 3; q++) out.emit[k * 3 + q] = mix(out.emit[k * 3 + q], emit[q], a);
    }
  };
}
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const sdEllipse = (x, y, cx, cy, rx, ry, a = 0) => {
  const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
  const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
  return (Math.hypot(u, v) - 1) * Math.min(rx, ry);
};
// 一条折线（开放）
const sdLine = (x, y, pts, w) => { let d = Infinity; for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, sdSeg(x, y, pts[i], pts[i + 1], w)); return d; };
const bbox = (pts, pad) => [Math.min(...pts.map((p) => p[0])) - pad, Math.min(...pts.map((p) => p[1])) - pad, Math.max(...pts.map((p) => p[0])) + pad, Math.max(...pts.map((p) => p[1])) + pad];

// 五瓣小花：中心 (cx, cy)、半径 r、转角 a
function blossom(fill, cx, cy, r, a, petal, center) {
  for (let k = 0; k < 5; k++) {
    const t = a + (2 * Math.PI * k) / 5, px = cx + Math.cos(t) * r * 0.55, py = cy + Math.sin(t) * r * 0.55;
    fill((x, y) => sdEllipse(x, y, px, py, r * 0.5, r * 0.34, t), [px - r, py - r, px + r, py + r], petal);
  }
  fill((x, y) => sdCircle(x, y, cx, cy, r * 0.24), [cx - r * 0.3, cy - r * 0.3, cx + r * 0.3, cy + r * 0.3], center);
}
// 碎花（雾蓝底上撒满奶白、珊瑚、芥末黄的五瓣小花，旁边两片鼠尾草绿的叶子）：一个周期 P 见方，按周期铺满 W × H（可以平铺）
function paintCalico(fill, P, rnd, W = P, H = P) {
  const n = 10, cell = P / n;
  const cols = [[rgb([242, 234, 212]), 0.62], [rgb([228, 122, 98]), 0.84], [rgb([230, 180, 74]), 1]];
  const items = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = (i + 0.2 + 0.6 * rnd()) * cell, cy = (j + 0.2 + 0.6 * rnd()) * cell;
    const pick = rnd(), col = cols.find((c) => pick < c[1])[0];
    items.push({ cx, cy, r: 0.0036 + 0.0016 * rnd(), a: rnd() * 6.3, col, la: rnd() * 6.3, lb: rnd() * 6.3 });
  }
  const leaf = { color: rgb([150, 176, 128]), height: 0.3 }, dot = { color: rgb([236, 226, 200]), height: 0.3 };
  for (const it of items) for (let ox = -P; ox < W + P; ox += P) for (let oy = -P; oy < H + P; oy += P) {
    const cx = it.cx + ox, cy = it.cy + oy;
    if (cx < -0.012 || cx > W + 0.012 || cy < -0.012 || cy > H + 0.012) continue;
    for (const la of [it.la, it.lb]) {
      const lx = cx + Math.cos(la) * it.r * 1.45, ly = cy + Math.sin(la) * it.r * 1.45;
      fill((x, y) => sdEllipse(x, y, lx, ly, it.r * 0.7, it.r * 0.3, la), [lx - it.r, ly - it.r, lx + it.r, ly + it.r], leaf);
    }
    blossom(fill, cx, cy, it.r, it.a, { color: it.col, height: 0.5 }, { color: rgb([214, 150, 60]), height: 0.6 });
    const dx = cx + Math.cos(it.a + 2) * it.r * 2.2, dy = cy + Math.sin(it.a + 2) * it.r * 2.2;
    fill((x, y) => sdCircle(x, y, dx, dy, it.r * 0.16), [dx - 0.002, dy - 0.002, dx + 0.002, dy + 0.002], dot);
  }
}
// 平纹布的底纹（经纬两个方向的细纹 + 一点粗细不匀）
const weave = (n, x, y, f) => 0.5 * n(x * f, y * f * 0.2) + 0.5 * n(x * f * 0.2 + 7, y * f);

export function sewAtlas(S, P) {
  const A = SEW_ATLAS, k = S / A.size;
  const out = alloc(S, true);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nA = perlin(P.seed + 1), nB = perlin(P.seed + 2), nC = perlin(P.seed + 3);
  const rnd = mulberry(P.seed + 5);
  const white = rgb([244, 241, 234]), gray = rgb([196, 198, 200]), accent = rgb([92, 170, 160]), ink = rgb([52, 56, 62]);

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

  // —— 缝纫机正面：暖白色的机身。机头正面一块薄荷绿的面板（上面一道穿线的槽、几个编号），横臂上 TRYITEM 和一排针迹表，
  //    立柱上一块发光的液晶屏、三个小按钮、旋钮外面一圈刻度，底座下沿一道灰色的底板。
  //    （机身的侧面、底面也按正面平面贴：画的东西离外形的边都留着几毫米，侧面上只拉出机身的白色）
  {
    const M = A.machine, b = box('machine');
    const X = (wx) => wx - M.x0, Y = (wy) => M.h - wy;   // 机身坐标 → 区域坐标
    region(out, S, b, M.w, M.h, (x, y) => {
      const n = nA(x * 300, y * 300) * 0.5 + nB(x * 40, y * 40) * 0.5;
      const base = M.h - y < MACHINE.bed.h * 0.2 ? gray : white;
      return [mul(base, 0.985 + 0.02 * n), 0.05 * n, 0.35];
    });
    const fill = gp(out, S, b, M.w, M.h);
    // 底板和机身之间一道分缝
    fill((x, y) => Math.abs(y - Y(MACHINE.bed.h * 0.2)) - 0.0004, [0, Y(MACHINE.bed.h * 0.2) - 0.002, M.w, Y(MACHINE.bed.h * 0.2) + 0.002], { color: mul(gray, 0.7), height: -0.3 });
    // 机头面板
    const pc = [X(-0.165), Y(0.2125)];
    fill((x, y) => sdRoundRect(x, y, pc[0], pc[1], 0.038, 0.0725, 0.01), [pc[0] - 0.04, pc[1] - 0.075, pc[0] + 0.04, pc[1] + 0.075], { color: accent, rough: 0.3, height: 0.2 });
    // 穿线槽：右边一道往下、底下绕个 U、左边一道往上到挑线杆
    const groove = { color: mul(accent, 0.62), height: -0.4, rough: 0.5 };
    const u0 = [X(-0.15), Y(0.282)], u1 = [X(-0.15), Y(0.18)], v1 = [X(-0.18), Y(0.18)], v0 = [X(-0.18), Y(0.268)];
    const uturn = Array.from({ length: 9 }, (_, i) => { const t = (Math.PI * i) / 8; return [pc[0] + 0.015 * Math.cos(t), u1[1] + 0.015 * Math.sin(t)]; });
    const path = [u0, u1, ...uturn, v1, v0];
    fill((x, y) => sdLine(x, y, path, 0.0034), bbox(path, 0.004), groove);
    // 挑线杆的长槽
    fill((x, y) => sdRoundRect(x, y, v0[0], v0[1] + 0.006, 0.0022, 0.012, 0.002), [v0[0] - 0.004, v0[1] - 0.01, v0[0] + 0.004, v0[1] + 0.02], { color: mul(accent, 0.4), height: -0.6 });
    // 穿线顺序的编号
    [[u0[0] + 0.009, u0[1] + 0.004, '1'], [u0[0] + 0.009, Y(0.23), '2'], [pc[0], Y(0.152), '3'], [v0[0] - 0.009, Y(0.235), '4']].forEach(([cx, cy, s]) => {
      fill((x, y) => sdCircle(x, y, cx, cy, 0.0042), [cx - 0.005, cy - 0.005, cx + 0.005, cy + 0.005], { color: white, height: 0.3 });
      text(fill, s, cx, cy - 0.0024, 0.0048, { align: 'center', stroke: 0.2, color: mul(accent, 0.55) });
    });
    // 牌子和型号
    text(fill, 'TRYITEM', X(-0.005), Y(0.285), 0.017, { align: 'center', stroke: 0.2, color: ink, height: 0.3 });
    text(fill, 'SEW 500', X(-0.005), Y(0.262), 0.007, { align: 'center', stroke: 0.2, color: mul(accent, 0.8) });
    // 针迹表：一排小格子，每格一种针迹 + 编号
    {
      const n = 10, cw = 0.015, x0 = X(-0.085), y0 = Y(0.246), h = 0.02;
      fill((x, y) => Math.abs(sdRoundRect(x, y, x0 + (n * cw) / 2, y0 + h / 2, (n * cw) / 2 + 0.002, h / 2 + 0.002, 0.003)) - 0.0003, [x0 - 0.004, y0 - 0.004, x0 + n * cw + 0.004, y0 + h + 0.004], { color: mul(gray, 0.8) });
      const st = { color: ink };
      for (let i = 0; i < n; i++) {
        const cx = x0 + (i + 0.5) * cw, top = y0 + 0.002, bot = y0 + 0.011, w = 0.0045;
        let pts;
        const zig = (m, amp) => Array.from({ length: m + 1 }, (_, j) => [cx + (j % 2 ? amp : -amp), top + ((bot - top) * j) / m]);
        switch (i) {
          case 0: pts = [[cx, top], [cx, bot]]; break;
          case 1: pts = zig(6, w); break;
          case 2: pts = zig(10, w * 0.8); break;
          case 3: pts = [[cx - w, top], [cx - w, top + 0.004], [cx + w, top + 0.005], [cx - w, top + 0.006], [cx - w, bot]]; break;
          case 4: pts = Array.from({ length: 13 }, (_, j) => { const t = j / 12; return [cx + w * Math.abs(Math.sin(t * Math.PI * 2)), top + (bot - top) * t]; }); break;
          case 5: pts = [[cx - w, top], [cx + w, top + 0.003], [cx - w, top + 0.006], [cx + w, bot]]; break;
          case 6: pts = Array.from({ length: 9 }, (_, j) => [cx + (j % 4 < 2 ? -w : w) * 0.8, top + ((bot - top) * j) / 8]); break;
          case 7: pts = [[cx, top], [cx, bot], [cx - w, bot - 0.003], [cx, bot]]; break;
          case 8: pts = Array.from({ length: 9 }, (_, j) => { const t = j / 8; return [cx + w * Math.cos(t * Math.PI * 3), top + (bot - top) * t]; }); break;
          default: pts = [[cx - w, top], [cx + w, top], [cx - w, bot], [cx + w, bot]];
        }
        fill((x, y) => sdLine(x, y, pts, 0.0006), bbox(pts, 0.001), st);
        text(fill, String(i + 1), cx, y0 + 0.0135, 0.0042, { align: 'center', stroke: 0.2, color: mul(gray, 0.55) });
      }
    }
    // 液晶屏：黑框、青绿色的发光屏，屏上大字是针迹号，右边是针距和针幅
    {
      const L = MACHINE.lcd, cx = X(L.x), cy = Y(L.y);
      fill((x, y) => sdRoundRect(x, y, cx, cy, L.w / 2, L.h / 2, 0.004), [cx - L.w / 2 - 0.001, cy - L.h / 2 - 0.001, cx + L.w / 2 + 0.001, cy + L.h / 2 + 0.001], { color: rgb([34, 36, 40]), rough: 0.2, height: 0.2 });
      const scr = rgb([150, 210, 190]);
      fill((x, y) => sdRoundRect(x, y, cx, cy, L.w / 2 - 0.004, L.h / 2 - 0.004, 0.002), [cx - L.w / 2, cy - L.h / 2, cx + L.w / 2, cy + L.h / 2], { color: scr, rough: 0.1, emit: mul(scr, 0.8) });
      const dig = { color: rgb([30, 60, 56]), emit: mul(scr, 0.15) };
      text(fill, '05', cx - 0.03, cy - 0.0085, 0.017, { stroke: 0.2, ...dig });
      text(fill, '2.5', cx + 0.03, cy - 0.009, 0.0068, { align: 'right', stroke: 0.2, ...dig });
      text(fill, '3.0', cx + 0.03, cy + 0.0015, 0.0068, { align: 'right', stroke: 0.2, ...dig });
      // 三个小按钮
      for (const dx of [-0.022, 0, 0.022]) {
        const bx = cx + dx, by = Y(0.192);
        fill((x, y) => sdCircle(x, y, bx, by, 0.0055), [bx - 0.007, by - 0.007, bx + 0.007, by + 0.007], { color: mul(gray, 0.8), height: 0.2 });
        fill((x, y) => sdCircle(x, y, bx, by, 0.0042), [bx - 0.006, by - 0.006, bx + 0.006, by + 0.006], { color: mul(white, 0.97), height: 0.5 });
      }
    }
    // 旋钮：外面一圈刻度、顶上一个小三角；旋钮本身（另一个零件，也按正面平面贴）是浅灰的圆盘，边上一圈深灰的防滑纹，盘面上 1 ~ 8
    {
      const D = MACHINE.dial, cx = X(D.x), cy = Y(D.y);
      for (let i = 0; i < 16; i++) {
        const a = (2 * Math.PI * i) / 16, p0 = [cx + Math.cos(a) * (D.r + 0.003), cy + Math.sin(a) * (D.r + 0.003)], p1 = [cx + Math.cos(a) * (D.r + (i % 2 ? 0.005 : 0.007)), cy + Math.sin(a) * (D.r + (i % 2 ? 0.005 : 0.007))];
        fill((x, y) => sdSeg(x, y, p0, p1, 0.0007), bbox([p0, p1], 0.001), { color: mul(gray, 0.6) });
      }
      const tri = [[cx, cy - D.r - 0.004], [cx - 0.003, cy - D.r - 0.009], [cx + 0.003, cy - D.r - 0.009]];
      fill((x, y) => sdPoly(x, y, tri), bbox(tri, 0.001), { color: accent });
      fill((x, y) => sdCircle(x, y, cx, cy, D.r), [cx - D.r, cy - D.r, cx + D.r, cy + D.r], { color: rgb([226, 228, 230]), rough: 0.35, height: 0.3 });
      for (let i = 0; i < 40; i++) {
        const a = (2 * Math.PI * i) / 40, p0 = [cx + Math.cos(a) * (D.r - 0.004), cy + Math.sin(a) * (D.r - 0.004)], p1 = [cx + Math.cos(a) * D.r, cy + Math.sin(a) * D.r];
        fill((x, y) => sdSeg(x, y, p0, p1, 0.0012), bbox([p0, p1], 0.001), { color: mul(gray, 0.55), height: 0 });
      }
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / 8, tx = cx + Math.cos(a) * (D.r - 0.011), ty = cy + Math.sin(a) * (D.r - 0.011);
        text(fill, String(i + 1), tx, ty - 0.0025, 0.005, { align: 'center', stroke: 0.2, color: ink });
      }
      fill((x, y) => sdCircle(x, y, cx, cy, 0.007), [cx - 0.008, cy - 0.008, cx + 0.008, cy + 0.008], { color: accent, height: 0.5 });
    }
  }

  // —— 针板：拉丝钢板，中间一道横的针孔槽，前后三对送布牙的槽，右边几道缝份导线和 10 / 15 / 20 ——
  {
    const Z = A.plate.size, b = box('plate');
    region(out, S, b, Z, Z, (x, y) => {
      const brush = nA(x * 3000, y * 60) * 0.5 + nB(x * 900, y * 20) * 0.5;
      return [mul(rgb([206, 208, 212]), 0.92 + 0.08 * brush), 0.05 * brush, 0.3 + 0.05 * brush, 1];
    });
    const fill = gp(out, S, b, Z, Z);
    const c = Z / 2, slot = { color: rgb([30, 30, 32]), metal: 0, rough: 0.8, height: -1 };
    fill((x, y) => sdRoundRect(x, y, c, c, 0.0045, 0.0012, 0.0012), [c - 0.006, c - 0.003, c + 0.006, c + 0.003], slot);
    for (const dx of [-0.008, 0.008]) for (const dy of [-0.011, 0.011]) fill((x, y) => sdRoundRect(x, y, c + dx, c + dy, 0.0014, 0.006, 0.0012), [c + dx - 0.003, c + dy - 0.008, c + dx + 0.003, c + dy + 0.008], slot);
    const eng = { color: rgb([120, 122, 128]), rough: 0.5, height: -0.4 };
    // 数字上下错开（三道线只隔 5mm，并排放不下）
    [[0.01, '10', 0.0105], [0.015, '15', 0.0065], [0.02, '20', 0.0105]].forEach(([d, s, lift]) => {
      fill((x, y) => Math.abs(x - (c + d)) - 0.00025, [c + d - 0.001, 0.002, c + d + 0.001, Z - lift - 0.0015], eng);
      text(fill, s, c + d, Z - lift, 0.003, { align: 'center', stroke: 0.2, ...eng });
    });
  }

  // —— 裙片纸样：浅米色的薄纸，黑色的裁剪线、虚线的缝线、布纹线的双箭头、侧缝上的对位剪口，印着 SKIRT FRONT / CUT 2 / SIZE 10 ——
  {
    const Z = A.pattern.size, b = box('pattern');
    region(out, S, b, Z, Z, (x, y) => {
      const fib = nA(x * 200, y * 200) * 0.6 + nB(x * 25, y * 25) * 0.4, crinkle = fbm(nC, x / Z, y / Z, 5, 5, 3);
      return [mul(rgb([234, 220, 192]), 0.96 + 0.05 * fib + 0.03 * crinkle), 0.25 * crinkle, 0.9];
    });
    const fill = gp(out, S, b, Z, Z);
    const inkC = { color: rgb([48, 46, 52]) };
    const P = SKIRT_PIECE, n = P.length;
    fill((x, y) => Math.abs(sdPoly(x, y, P)) - 0.0008, bbox(P, 0.004), inkC);
    // 缝线：往里缩 1.5cm 的虚线
    const inset = P.map((p, i) => {
      const a = P[(i - 1 + n) % n], c = P[(i + 1) % n];
      const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [c[0] - p[0], c[1] - p[1]];
      const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
      const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];
      const m = [n1[0] + n2[0], n1[1] + n2[1]], lm = Math.hypot(...m), cosh = (m[0] * n1[0] + m[1] * n1[1]) / lm;
      const s = sdPoly(p[0] + (m[0] / lm) * 0.001, p[1] + (m[1] / lm) * 0.001, P) < 0 ? 1 : -1;
      return [p[0] + (s * m[0] / lm) * (0.015 / cosh), p[1] + (s * m[1] / lm) * (0.015 / cosh)];
    });
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = inset[i], c = inset[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      for (let s = 0; s < L; s += 0.001) {
        if ((acc + s) % 0.012 < 0.007) {
          const t0 = s / L, t1 = Math.min(1, (s + 0.001) / L);
          const p0 = [a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0], p1 = [a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1];
          fill((x, y) => sdSeg(x, y, p0, p1, 0.0007), bbox([p0, p1], 0.001), inkC);
        }
      }
      acc += L;
    }
    // 布纹线
    const cx = 0.225, g0 = [cx, 0.1], g1 = [cx, 0.37];
    fill((x, y) => sdSeg(x, y, g0, g1, 0.001), bbox([g0, g1], 0.002), inkC);
    for (const [tip, dir] of [[g0, 1], [g1, -1]]) {
      const tri = [tip, [tip[0] - 0.006, tip[1] + dir * 0.014], [tip[0] + 0.006, tip[1] + dir * 0.014]];
      fill((x, y) => sdPoly(x, y, tri), bbox(tri, 0.001), inkC);
    }
    // 对位剪口：侧缝上的小三角
    for (const [side, ts] of [[-1, [0.32]], [1, [0.3, 0.34]]]) {
      for (const t of ts) {
        const y = 0.03 + (0.42 - 0.03) * t, x = cx + side * (0.1 + 0.09 * t ** 1.15);
        const tri = [[x, y], [x - side * 0.008, y - 0.005], [x - side * 0.008, y + 0.005]];
        fill((px, py) => sdPoly(px, py, tri), bbox(tri, 0.001), inkC);
      }
    }
    text(fill, 'SKIRT FRONT', cx, 0.175, 0.016, { align: 'center', stroke: 0.16, ...inkC });
    text(fill, 'CUT 2', cx - 0.03, 0.21, 0.011, { align: 'center', stroke: 0.16, ...inkC });
    text(fill, 'SIZE 10', cx + 0.035, 0.21, 0.009, { align: 'center', stroke: 0.16, ...inkC });
    text(fill, 'TRYITEM PATTERNS 1052', cx, 0.075, 0.0065, { align: 'center', stroke: 0.16, ...inkC });
  }

  // —— 切割垫：墨绿色，1cm 的细网格、5cm 一道亮一点的线、10cm 一道更粗；上沿、左沿印着厘米数，左下角几道 45° / 60° 的斜线，
  //    右下角印着牌子；表面几道浅浅的刀痕 ——
  {
    const { w: W, h: H } = A.mat, b = box('mat'), m = 0.02;
    region(out, S, b, W, H, (x, y) => {
      const n = nA(x * 150, y * 150) * 0.6 + nB(x * 20, y * 20) * 0.4;
      return [mul(rgb([44, 102, 78]), 0.95 + 0.06 * n), 0.05 * n, 0.75];
    });
    const fill = gp(out, S, b, W, H);
    const line = (x0, y0, x1, y1, w, color, alpha) => fill((x, y) => sdSeg(x, y, [x0, y0], [x1, y1], w), [Math.min(x0, x1) - w, Math.min(y0, y1) - w, Math.max(x0, x1) + w, Math.max(y0, y1) + w], { color, alpha });
    const light = rgb([150, 206, 170]), bright = rgb([232, 240, 226]);
    for (let i = 0; i <= 86; i++) {
      const x = m + i * 0.01, big = i % 10 === 0, mid = i % 5 === 0;
      line(x, m, x, H - m, big ? 0.0011 : mid ? 0.0008 : 0.0005, mid ? bright : light, big ? 0.8 : mid ? 0.6 : 0.35);
    }
    for (let j = 0; j <= 56; j++) {
      const y = m + j * 0.01, big = j % 10 === 0, mid = j % 5 === 0;
      line(m, y, W - m, y, big ? 0.0011 : mid ? 0.0008 : 0.0005, mid ? bright : light, big ? 0.8 : mid ? 0.6 : 0.35);
    }
    for (let i = 5; i <= 85; i += 5) text(fill, String(i), m + i * 0.01, 0.0045, 0.0085, { align: 'center', stroke: 0.18, color: bright });
    for (let j = 5; j <= 55; j += 5) text(fill, String(j), 0.0105, m + j * 0.01 - 0.0035, 0.007, { align: 'center', stroke: 0.18, color: bright });
    for (const [a, len] of [[Math.PI / 4, 0.3], [Math.PI / 3, 0.25], [Math.PI / 6, 0.34]]) line(m, H - m, m + Math.cos(a) * len, H - m - Math.sin(a) * len, 0.0008, bright, 0.7);
    text(fill, 'TRYITEM', W - 0.03, H - 0.017, 0.009, { align: 'right', stroke: 0.2, color: bright });
    text(fill, 'SELF HEALING CUTTING MAT', W - 0.105, H - 0.0155, 0.006, { align: 'right', stroke: 0.18, color: light });
    for (let i = 0; i < 9; i++) {
      const x0 = 0.1 + 0.7 * rnd(), y0 = 0.08 + 0.44 * rnd(), a = rnd() < 0.5 ? 0 : Math.PI / 2, l = 0.08 + 0.2 * rnd();
      line(x0, y0, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l, 0.0006, rgb([96, 150, 120]), 0.35);
    }
  }

  // —— 八块叠好的布（每格代表 0.3m 见方）——
  {
    const F = A.fabrics, [x0, y0, x1, y1] = box('fabrics'), cw = (x1 - x0) / F.cols, ch = (y1 - y0) / F.rows, Z = F.size;
    F.names.forEach((name, i) => {
      const b = [x0 + Math.round((i % F.cols) * cw), y0 + Math.round(Math.floor(i / F.cols) * ch), x0 + Math.round(((i % F.cols) + 1) * cw), y0 + Math.round((Math.floor(i / F.cols) + 1) * ch)];
      const wv = (x, y) => weave(nA, x, y, 900);
      const solid = (c) => (x, y) => { const w = wv(x, y) + 0.5 * nB(x * 60, y * 60); return [mul(rgb(c), 0.94 + 0.08 * w), 0.4 * wv(x, y), 1]; };
      const f = {
        mustard: solid([218, 164, 52]),
        sage: solid([150, 170, 140]),
        polka: (x, y) => { const gx = fract(x / 0.02 + (Math.floor(y / 0.02) % 2) * 0.5) - 0.5, gy = fract(y / 0.02) - 0.5, d = Math.hypot(gx, gy) * 0.02; const a = sstep(0.0046, 0.0038, d); return [mul(mix3(rgb([34, 48, 88]), rgb([240, 236, 226]), a), 0.95 + 0.06 * wv(x, y)), 0.4 * wv(x, y) + 0.3 * a, 1]; },
        gingham: (x, y) => { const ax = fract(x / 0.024) < 0.5 ? 1 : 0, ay = fract(y / 0.024) < 0.5 ? 1 : 0; const t = ax && ay ? 1 : ax || ay ? 0.5 : 0; return [mul(mix3(rgb([244, 240, 232]), rgb([200, 52, 56]), t), 0.95 + 0.06 * wv(x, y)), 0.4 * wv(x, y), 1]; },
        stripe: (x, y) => { const s = fract(x / 0.012) < 0.33 ? 1 : 0; return [mul(mix3(rgb([240, 234, 220]), rgb([40, 60, 110]), s), 0.95 + 0.06 * wv(x, y)), 0.4 * wv(x, y), 1]; },
        calico: (x, y) => [mul(rgb([86, 112, 150]), 0.95 + 0.06 * wv(x, y)), 0.3 * wv(x, y), 1],
        pinkdot: (x, y) => { const gx = fract(x / 0.008 + (Math.floor(y / 0.008) % 2) * 0.5) - 0.5, gy = fract(y / 0.008) - 0.5, d = Math.hypot(gx, gy) * 0.008; const a = sstep(0.0017, 0.0012, d); return [mul(mix3(rgb([222, 170, 170]), rgb([246, 240, 236]), a), 0.95 + 0.06 * wv(x, y)), 0.4 * wv(x, y), 1]; },
        denim: (x, y) => { const tw = 0.5 + 0.5 * Math.sin(((x + y) / 0.0022) * Math.PI * 2); const sp = nC(x * 800, y * 180) > 0.45 ? 1 : 0; return [mix3(mul(rgb([46, 70, 112]), 0.85 + 0.2 * tw), rgb([190, 200, 214]), 0.35 * sp), 0.5 * tw, 1]; },
      }[name];
      region(out, S, b, Z, Z, f);
      // 和平铺的碎花棉布同一个图案、同样的尺度
      if (name === 'calico') paintCalico(gp(out, S, b, Z, Z), 0.2, mulberry(P.seed + 11), Z, Z);
    });
  }

  // —— 四十种线：一圈圈绕上去的细线（v 方向一道道细纹），颜色按色相排一圈，最后四种是白、浅灰、深灰、黑 ——
  {
    const N = A.threads.n, [x0, y0, x1, y1] = box('threads'), w = (x1 - x0) / N;
    const hsl = (h, s, l) => { const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
    for (let i = 0; i < N; i++) {
      const col = i < 36 ? hsl(i * 10, 0.62 + 0.1 * Math.sin(i), 0.5 + 0.06 * Math.cos(i * 1.7)) : [rgb([240, 238, 232]), rgb([168, 168, 170]), rgb([82, 82, 86]), rgb([30, 30, 32])][i - 36];
      const b = [x0 + Math.round(i * w), y0, x0 + Math.round((i + 1) * w), y1];
      region(out, S, b, 1, 1, (u, v) => {
        const ring = 0.5 + 0.5 * Math.sin((v * 70 + u * 1.5) * 2 * Math.PI), fine = nA(u * 30 + i * 13, v * 400);
        return [mul(col, 0.8 + 0.2 * Math.sqrt(ring) + 0.05 * fine), 0.6 * ring, 0.7];
      });
    }
  }

  // —— 软尺：黄色，一边是毫米 / 厘米刻度，每厘米一个数字、每 10cm 的数字是红的 ——
  for (const [name, from] of [['tapeA', 0], ['tapeB', 75]]) {
    const { len: W, w: H } = A.tape, b = box(name);
    region(out, S, b, W, H, (x, y) => { const n = nA(x * 400, y * 400); return [mul(rgb([238, 198, 60]), 0.96 + 0.04 * n), 0.02 * n, 0.45]; });
    const fill = gp(out, S, b, W, H), inkT = { color: rgb([30, 28, 26]) };
    for (let mm = 0; mm <= 750; mm++) {
      const x = mm / 1000, len = mm % 10 === 0 ? 0.0055 : mm % 5 === 0 ? 0.0038 : 0.0024;
      fill((px, py) => sdSeg(px, py, [x, 0], [x, len], mm % 10 === 0 ? 0.0003 : 0.00022), [x - 0.001, 0, x + 0.001, len + 0.001], inkT);
    }
    for (let cm = 1; cm <= 75; cm++) {
      const v = from + cm, h = v >= 100 ? 0.0036 : 0.0048;
      text(fill, String(v), (cm - 0.5) / 100, 0.0068 + (0.0048 - h) / 2, h, { align: 'center', stroke: 0.2, color: v % 10 === 0 ? rgb([200, 40, 36]) : rgb([30, 28, 26]) });
    }
  }

  // —— 木尺：山毛榉色，一边是毫米刻度，每厘米一个数字，头上印着 TRYITEM ——
  {
    const { len: W, w: H } = A.yardstick, b = box('yardstick');
    region(out, S, b, W, H, (x, y) => {
      const g = nA(x * 30, y * 600) * 0.6 + nB(x * 4, y * 90) * 0.4;
      return [mul(rgb([218, 182, 132]), 0.92 + 0.1 * g), 0.1 * g, 0.7];
    });
    const fill = gp(out, S, b, W, H), inkT = { color: rgb([40, 32, 26]) };
    for (let mm = 0; mm <= 1000; mm++) {
      const x = mm / 1000, len = mm % 10 === 0 ? 0.008 : mm % 5 === 0 ? 0.0055 : 0.0035;
      fill((px, py) => sdSeg(px, py, [x, 0], [x, len], 0.00035), [x - 0.001, 0, x + 0.001, len + 0.001], inkT);
    }
    for (let cm = 1; cm < 100; cm++) text(fill, String(cm), cm / 100, 0.0098, 0.0055, { align: 'center', stroke: 0.2, ...inkT });
    text(fill, 'TRYITEM', 0.5, 0.019, 0.007, { align: 'center', stroke: 0.2, color: rgb([160, 40, 36]) });
  }
  return out;
}

// ——————————————————————— 碎花棉布 ———————————————————————
// 周期 0.2m：雾蓝底，平纹的细纹，上面撒满奶白、珊瑚、芥末黄的五瓣小花和鼠尾草绿的小叶子
export function calico(S, P) {
  const out = alloc(S), n = perlin(P.seed), P0 = 0.2;
  region(out, S, [0, 0, S, S], P0, P0, (x, y) => {
    const u = x / P0, v = y / P0;
    const w = 0.5 * n(u * 360, v * 72, 360, 72) + 0.5 * n(u * 72 + 7, v * 360, 72, 360);
    return [mul(rgb([86, 112, 150]), 0.94 + 0.08 * w + 0.03 * fbm(n, u, v, 4, 4, 3)), 0.3 * w, 1];
  });
  paintCalico(gp(out, S, [0, 0, S, S], P0, P0), P0, mulberry(P.seed + 11));
  return out;
}

// ——————————————————————— 碎花墙纸 ———————————————————————
// 周期 0.5m：奶油色的底子（一点纸纹），错位排开的小枝子：一根弯弯的茎、交替的叶子、两三朵藕粉 / 灰蓝的小花，
// 枝子之间撒着三粒一簇的小花苞。5 × 5 格，每格一枝、朝向随机；奇数行错开半格（半落版），整张可以平铺，
// 2m 的墙模块拼起来图案连续
export function wallpaper(S, P) {
  const out = alloc(S), n = perlin(P.seed), rnd = mulberry(P.seed + 1), P0 = 0.5;
  region(out, S, [0, 0, S, S], P0, P0, (x, y) => {
    const u = x / P0, v = y / P0;
    const paper = 0.6 * n(u * 200, v * 200, 200, 200) + 0.4 * n(u * 40, v * 40, 40, 40);
    return [mul(rgb([238, 231, 216]), 0.97 + 0.03 * paper), 0.1 * paper, 0.9];
  });
  const fill = gp(out, S, [0, 0, S, S], P0, P0);
  const stem = rgb([122, 146, 110]), leafC = [rgb([140, 164, 124]), rgb([112, 138, 100])];
  const flowerC = [rgb([206, 146, 146]), rgb([128, 150, 186]), rgb([222, 176, 150])];
  const N = 5, cell = P0 / N;
  const sprigs = [], buds = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    sprigs.push({ cx: (i + 0.5 + (j % 2) * 0.5) * cell, cy: (j + 0.5) * cell, a: -1 + 2 * rnd() + (rnd() < 0.5 ? Math.PI : 0), s: 0.95 + 0.2 * rnd(), f: Math.floor(rnd() * 3), mir: rnd() < 0.5 ? 1 : -1, seed: rnd() });
    buds.push({ cx: (i + (j % 2) * 0.5) * cell, cy: j * cell, a: rnd() * 6.3 });
  }
  const budC = rgb([196, 150, 140]);
  for (const b of buds) for (const ox of [-P0, 0, P0]) for (const oy of [-P0, 0, P0]) {
    const cx = b.cx + ox, cy = b.cy + oy;
    if (cx < -0.01 || cx > P0 + 0.01 || cy < -0.01 || cy > P0 + 0.01) continue;
    for (let k = 0; k < 3; k++) {
      const t = b.a + (2 * Math.PI * k) / 3, dx = cx + Math.cos(t) * 0.0028, dy = cy + Math.sin(t) * 0.0028;
      fill((x, y) => sdCircle(x, y, dx, dy, 0.0014), [dx - 0.002, dy - 0.002, dx + 0.002, dy + 0.002], { color: budC, height: 0.4 });
    }
  }
  for (const sp of sprigs) for (const ox of [-P0, 0, P0]) for (const oy of [-P0, 0, P0]) {
    const cx = sp.cx + ox, cy = sp.cy + oy;
    if (cx < -0.07 || cx > P0 + 0.07 || cy < -0.07 || cy > P0 + 0.07) continue;
    const r = mulberry(Math.floor(sp.seed * 1e6));
    const ca = Math.cos(sp.a), sa = Math.sin(sp.a), L = 0.075 * sp.s;
    // 茎：一条缓弯
    const pts = Array.from({ length: 9 }, (_, i) => { const t = i / 8 - 0.5, bend = sp.mir * 0.012 * Math.sin(t * Math.PI); return [cx + ca * t * L - sa * bend, cy + sa * t * L + ca * bend]; });
    fill((x, y) => sdLine(x, y, pts, 0.0011), bbox(pts, 0.002), { color: stem, height: 0.2 });
    // 叶子：沿茎交替
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      const p = pts[i], side = i % 2 ? 1 : -1, la = sp.a + side * 0.9 + 0.2 * (r() - 0.5);
      const lx = p[0] + Math.cos(la) * 0.007, ly = p[1] + Math.sin(la) * 0.007;
      fill((x, y) => sdEllipse(x, y, lx, ly, 0.0068, 0.0026, la), [lx - 0.008, ly - 0.008, lx + 0.008, ly + 0.008], { color: leafC[i % 2], height: 0.3 });
    }
    // 花：茎的一头一朵大的，中间一朵小的
    const fc = flowerC[sp.f];
    blossom(fill, pts[8][0], pts[8][1], 0.0075, r() * 6, { color: fc, height: 0.5 }, { color: rgb([236, 214, 150]), height: 0.6 });
    blossom(fill, pts[0][0], pts[0][1], 0.0052, r() * 6, { color: flowerC[(sp.f + 1) % 3], height: 0.5 }, { color: rgb([236, 214, 150]), height: 0.6 });
    const q = pts[4], qa = sp.a - sp.mir * 1.1, qx = q[0] + Math.cos(qa) * 0.012, qy = q[1] + Math.sin(qa) * 0.012;
    fill((x, y) => sdSeg(x, y, q, [qx, qy], 0.0008), bbox([q, [qx, qy]], 0.002), { color: stem, height: 0.2 });
    blossom(fill, qx, qy, 0.004, r() * 6, { color: fc, height: 0.5 }, { color: rgb([236, 214, 150]), height: 0.6 });
  }
  return out;
}
