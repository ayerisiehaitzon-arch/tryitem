// 洗衣房的程序化贴图：家电图集（洗衣机、烘干机）、毛巾布、条纹茶巾。
import { perlin, fbm, worley, mulberry } from './noise.js';
import { APPLIANCE_ATLAS, APPLIANCE_PANELS } from './atlas.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];

function alloc(S, extra = []) {
  const o = { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
  for (const k of extra) o[k] = new Float32Array(k === 'emit' ? S * S * 3 : S * S);
  return o;
}

// —— 2D 有符号距离（米；内部为负）——（健身房的图集也用这几个）
export const sdRoundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
export const sdSeg = (x, y, a, b, w) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp01(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy + 1e-12));
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) - w / 2;
};
export const sdPoly = (x, y, P) => {
  let d = Infinity, inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i];
    d = Math.min(d, sdSeg(x, y, a, b, 0));
    if ((b[1] > y) !== (a[1] > y) && x < ((a[0] - b[0]) * (y - b[1])) / (a[1] - b[1]) + b[0]) inside = !inside;
  }
  return inside ? -d : d;
};

// 在图集的一块区域上按米作画：box 是像素框，W×H 是这块区域代表的物理尺寸（米），y 向下
export function painter(out, S, box, W, H) {
  const [bx0, by0, bx1, by1] = box;
  const sx = (bx1 - bx0) / W, sy = (by1 - by0) / H, px = 1 / Math.min(sx, sy);
  // sdf：(x, y) → 距离；bb：[x0, y0, x1, y1]（米）；把覆盖率混进颜色 / 自发光 / 粗糙度 / 高度
  const fill = (sdf, bb, { color = null, emit = null, rough = null, height = null, alpha = 1 } = {}) => {
    const i0 = Math.max(bx0, Math.floor(bx0 + (bb[0] - px) * sx)), i1 = Math.min(bx1 - 1, Math.ceil(bx0 + (bb[2] + px) * sx));
    const j0 = Math.max(by0, Math.floor(by0 + (bb[1] - px) * sy)), j1 = Math.min(by1 - 1, Math.ceil(by0 + (bb[3] + px) * sy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5 - bx0) / sx, y = (j + 0.5 - by0) / sy;
      const a = clamp01(0.5 - sdf(x, y) / px) * alpha;
      if (a <= 0) continue;
      const k = j * S + i;
      if (color) for (let c = 0; c < 3; c++) out.color[k * 3 + c] = mix(out.color[k * 3 + c], color[c], a);
      if (emit) for (let c = 0; c < 3; c++) out.emit[k * 3 + c] = mix(out.emit[k * 3 + c], emit[c], a);
      if (rough !== null) out.rough[k] = mix(out.rough[k], rough, a);
      if (height !== null) out.height[k] = mix(out.height[k], height, a);
    }
  };
  return { fill, px };
}

// 七段数码管：segs 里每一段一条胶囊；on 为点亮的段
const SEG = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcfgd',
};
function digit(fill, ch, x, y, w, h, st, lit, dim) {
  const P = {
    a: [[x + st, y], [x + w - st, y]], d: [[x + st, y + h], [x + w - st, y + h]], g: [[x + st, y + h / 2], [x + w - st, y + h / 2]],
    f: [[x, y + st], [x, y + h / 2 - st]], b: [[x + w, y + st], [x + w, y + h / 2 - st]],
    e: [[x, y + h / 2 + st], [x, y + h - st]], c: [[x + w, y + h / 2 + st], [x + w, y + h - st]],
  };
  // 数码管稍微往右斜一点
  const sk = (p) => [p[0] + (h - (p[1] - y)) * 0.12, p[1]];
  for (const s of 'abcdefg') {
    const [a, b] = P[s].map(sk);
    const on = SEG[ch].includes(s);
    fill((px, py) => sdSeg(px, py, a, b, st), [Math.min(a[0], b[0]) - st, Math.min(a[1], b[1]) - st, Math.max(a[0], b[0]) + st, Math.max(a[1], b[1]) + st],
      on ? lit : dim);
  }
}

// ——————————————————————— 家电图集 ———————————————————————
export function appliance(S, P) {
  const A = APPLIANCE_ATLAS, k = S / A.size;
  const out = alloc(S, ['metal', 'emit']);
  const box = (r) => r.map((v) => Math.round(v * k));
  const nB = perlin(P.seed), nT = perlin(P.seed + 1), nQ = perlin(P.seed + 2);

  // —— 纯色格子 ——
  const sw = S / A.swatches.length, y0 = Math.round(A.swatchY * k);
  A.swatches.forEach((s, i) => {
    const c = rgb(s.c);
    for (let y = y0; y < S; y++) for (let x = Math.round(i * sw); x < Math.round((i + 1) * sw); x++) {
      const q = y * S + x;
      out.color[q * 3] = c[0]; out.color[q * 3 + 1] = c[1]; out.color[q * 3 + 2] = c[2];
      out.rough[q] = s.rough; out.metal[q] = s.metal ?? 0;
    }
  });

  // —— 内筒：拉丝不锈钢（沿圆周方向的拉丝纹）+ 洗衣机的冲孔 / 烘干机的菱格压纹 ——
  const drum = (region, D, holes) => {
    const [x0, yb, x1, y1] = box(A.regions[region]);
    const C = 2 * Math.PI * D.r, L = D.depth;
    const steel = rgb([200, 202, 205]);
    // 冲孔：交错排列，圆周方向的孔数取整（绕一圈正好接上）
    const nu = Math.round(C / 0.012), su = C / nu, sv = 0.0105;
    for (let y = yb; y < y1; y++) {
      const v = (y + 0.5 - yb) / (y1 - yb), zv = v * L;
      for (let x = x0; x < x1; x++) {
        const u = (x + 0.5 - x0) / (x1 - x0), zu = u * C;
        const brush = fbm(nB, u, v, 3, 90, 3);
        const tone = fbm(nT, u, v, 4, 2, 3);
        let c = steel.map((m) => m * (1 + brush * 0.05 + tone * 0.04));
        let h = brush * 0.05, r = 0.28 + brush * 0.04;
        if (holes) {
          const row = Math.round(zv / sv), cv = row * sv;
          const off = (row % 2) * su / 2;
          const col = Math.round((zu - off) / su), cu = col * su + off;
          const d = Math.hypot(zu - cu, zv - cv);
          const edge = zv > 0.022 && zv < L - 0.022; // 筒口、筒底附近没有孔
          if (edge) {
            const hole = 1 - sstep(0.0017, 0.0021, d), rim = (1 - sstep(0.0021, 0.0034, d)) * (1 - hole);
            c = c.map((m) => mix(m, 0.1, hole * 0.85));
            h += rim * 0.35 - hole * 1.0;
            r = mix(r, 0.6, hole);
          }
        } else {
          // 菱格压纹：两组斜线的距离，格子中间鼓起来
          const a = zu / 0.028 + zv / 0.02, b = zu / 0.028 - zv / 0.02;
          const fa = Math.abs(a - Math.round(a)), fb = Math.abs(b - Math.round(b));
          const pillow = Math.min(fa, fb) * 2; // 0 在压线上，1 在格子中心
          h += sstep(0, 0.6, pillow) * 0.6;
          c = c.map((m) => m * (0.94 + 0.08 * sstep(0, 0.5, pillow)));
        }
        const q = y * S + x;
        out.color[q * 3] = c[0]; out.color[q * 3 + 1] = c[1]; out.color[q * 3 + 2] = c[2];
        out.height[q] = h; out.rough[q] = r; out.metal[q] = 1;
      }
    }
  };
  drum('drumW', A.drumW, true);
  drum('drumD', A.drumD, false);

  // —— 控制面板 ——
  const panel = (region, spec) => {
    const b = box(A.regions[region]);
    const { fill } = painter(out, S, b, A.panel.w, A.panel.h);
    // 底色：白色塑料（比机身的烤漆稍微哑一点）
    const base = rgb([239, 239, 237]);
    for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) {
      const q = y * S + x;
      const n = fbm(nQ, x / S, y / S, 64, 64, 2) * 0.006;
      out.color[q * 3] = base[0] * (1 + n); out.color[q * 3 + 1] = base[1] * (1 + n); out.color[q * 3 + 2] = base[2] * (1 + n);
      out.rough[q] = 0.3; out.metal[q] = 0; out.height[q] = 0;
    }
    const ink = { color: rgb([128, 130, 134]) }, inkDark = { color: rgb([92, 94, 98]) };
    const rnd = mulberry(spec.seed);
    // 一个“词”：几根高矮不一的小竖块（远看是一行小字）
    const word = (x, y, n, right = false) => {
      const ws = Array.from({ length: n }, () => 0.00055 + rnd() * 0.0003);
      const total = ws.reduce((s, w) => s + w + 0.00032, 0);
      let cx = right ? x - total : x;
      for (const w of ws) {
        const tall = rnd() < 0.25 ? 0.0017 : 0.0012;
        const x0 = cx, x1 = cx + w, yb = y, yt = y - tall;
        fill((px, py) => sdRoundRect(px, py, (x0 + x1) / 2, (yt + yb) / 2, (x1 - x0) / 2, (yb - yt) / 2, 0.0002), [x0, yt, x1, yb], ink);
        cx += w + 0.00032;
      }
      return total;
    };
    // 程序旋钮：外圈一道细线，左右两列程序名，每个名字一根刻度线指向旋钮
    const { cx, cy } = spec.knob;
    fill((x, y) => Math.abs(Math.hypot(x - cx, y - cy) - 0.0395) - 0.0004, [cx - 0.042, cy - 0.042, cx + 0.042, cy + 0.042], inkDark);
    spec.labels.forEach((L, i) => {
      const side = i < spec.labels.length / 2 ? -1 : 1;
      const row = i % (spec.labels.length / 2);
      const ly = 0.024 + row * 0.0135;
      const ang = Math.atan2(ly - cy, side * 0.05);
      const t0 = [cx + Math.cos(ang) * 0.042, cy + Math.sin(ang) * 0.042], t1 = [cx + Math.cos(ang) * 0.046, cy + Math.sin(ang) * 0.046];
      fill((x, y) => sdSeg(x, y, t0, t1, 0.0005), [Math.min(t0[0], t1[0]) - 0.001, Math.min(t0[1], t1[1]) - 0.001, Math.max(t0[0], t1[0]) + 0.001, Math.max(t0[1], t1[1]) + 0.001], inkDark);
      let x = side < 0 ? cx - 0.05 : cx + 0.05;
      for (const n of L) x += (side < 0 ? -1 : 1) * (word(x, ly + 0.0008, n, side < 0) + 0.0012);
    });
    // 显示窗：深色玻璃，四位七段数码（点亮的段画在自发光图里，没点亮的段是一点点亮一些的灰）
    const d = spec.display;
    fill((x, y) => sdRoundRect(x, y, (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, (d.x1 - d.x0) / 2, (d.y1 - d.y0) / 2, 0.003),
      [d.x0, d.y0, d.x1, d.y1], { color: rgb([20, 22, 26]), rough: 0.06 });
    const lit = { color: rgb(spec.digit).map((m) => m * 0.8), emit: rgb(spec.digit) }, dim = { color: rgb([34, 37, 42]) };
    const dw = 0.0062, dh = 0.012, st = 0.0011;
    let x = d.x0 + 0.009;
    const yTop = (d.y0 + d.y1) / 2 - dh / 2 + 0.002;
    for (const ch of spec.time) {
      if (ch === ':') {
        for (const yy of [yTop + dh * 0.3, yTop + dh * 0.7]) fill((px, py) => Math.hypot(px - x - 0.0012, py - yy) - 0.0008, [x, yy - 0.001, x + 0.0025, yy + 0.001], lit);
        x += 0.0035;
        continue;
      }
      digit(fill, ch, x, yTop, dw, dh, st, lit, dim);
      x += dw + 0.0042;
    }
    // 显示窗上沿的小图标（点亮的）：门锁、水滴 / 温度
    const ic = { emit: rgb(spec.digit).map((m) => m * 0.8), color: rgb(spec.digit).map((m) => m * 0.6) };
    const iy = d.y0 + 0.006;
    fill((px, py) => sdRoundRect(px, py, d.x1 - 0.008, iy + 0.0012, 0.0016, 0.0013, 0.0004), [d.x1 - 0.011, iy - 0.001, d.x1 - 0.005, iy + 0.003], ic);
    fill((px, py) => Math.abs(Math.hypot(px - (d.x1 - 0.008), py - (iy - 0.0006)) - 0.0012) - 0.00035, [d.x1 - 0.011, iy - 0.003, d.x1 - 0.005, iy + 0.001], ic);
    fill((px, py) => sdPoly(px, py, [[d.x1 - 0.017, iy - 0.002], [d.x1 - 0.0145, iy + 0.0012], [d.x1 - 0.0195, iy + 0.0012]]), [d.x1 - 0.021, iy - 0.003, d.x1 - 0.013, iy + 0.003], ic);
    // 按钮上方的小图标：温度计、旋转箭头、开始 / 暂停
    spec.buttons.forEach(([bx, by], i) => {
      const y = by - 0.017;
      if (i === 0) {
        fill((px, py) => sdSeg(px, py, [bx, y - 0.003], [bx, y + 0.001], 0.0012), [bx - 0.002, y - 0.005, bx + 0.002, y + 0.003], inkDark);
        fill((px, py) => Math.hypot(px - bx, py - y - 0.0022) - 0.0015, [bx - 0.002, y, bx + 0.002, y + 0.004], inkDark);
      } else if (i === 1) {
        fill((px, py) => {
          const r = Math.hypot(px - bx, py - y), a = Math.atan2(py - y, px - bx);
          return Math.max(Math.abs(r - 0.0028) - 0.0005, a > 2.2 && a < 3.0 ? 1 : -1);
        }, [bx - 0.004, y - 0.004, bx + 0.004, y + 0.004], inkDark);
      } else {
        fill((px, py) => sdPoly(px, py, [[bx - 0.004, y - 0.0028], [bx - 0.0005, y], [bx - 0.004, y + 0.0028]]), [bx - 0.005, y - 0.004, bx, y + 0.004], inkDark);
        for (const dx of [0.0012, 0.0032]) fill((px, py) => sdRoundRect(px, py, bx + dx, y, 0.0005, 0.0026, 0.0002), [bx, y - 0.004, bx + 0.005, y + 0.004], inkDark);
      }
      // 按钮周围一圈细线
      fill((px, py) => Math.abs(Math.hypot(px - bx, py - by) - 0.0102) - 0.0003, [bx - 0.012, by - 0.012, bx + 0.012, by + 0.012], ink);
    });
    // 抽屉那一块：一道分隔线（抽屉面板本身是几何体，这里只画它右边那条线）
    fill((x, y) => sdSeg(x, y, [spec.drawer + 0.008, 0.012], [spec.drawer + 0.008, 0.098], 0.0005), [spec.drawer, 0.01, spec.drawer + 0.012, 0.1], ink);
  };
  const L6 = () => [[5, 3], [6], [4, 2], [7], [5], [3, 4]];
  panel('panelW', { seed: P.seed + 11, labels: [...L6(), ...L6().reverse()], ...APPLIANCE_PANELS.W });
  panel('panelD', { seed: P.seed + 12, labels: [...L6().reverse(), ...L6()], ...APPLIANCE_PANELS.D });
  return out;
}

// ——————————————————————— 毛巾布（割绒 / 毛圈）———————————————————————
// 一片密密的小毛圈：Worley 格子里每个格子是一个圆鼓鼓的毛圈头（有的朝这边倒、有的朝那边），格子之间的缝压暗
export function terry(S, P) {
  const w = worley(P.seed), w2 = worley(P.seed + 1), n = perlin(P.seed + 2);
  const out = alloc(S);
  const C = P.cells;
  const base = rgb(P.color);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const a = w(u * C, v * C * 1.15, C, Math.round(C * 1.15));
      const b = w2(u * C * 1.6 + 0.3, v * C * 1.6 + 0.7, Math.round(C * 1.6), Math.round(C * 1.6));
      const loopA = Math.max(0, 1 - a.f1 / 0.62) ** 0.7 * (0.75 + 0.25 * a.id);
      const loopB = Math.max(0, 1 - b.f1 / 0.55) ** 0.8 * (0.6 + 0.3 * b.id) * 0.8;
      const h = Math.max(loopA, loopB);
      const mott = fbm(n, u, v, 3, 3, 3) * P.mottle;
      const cav = 0.83 + 0.17 * Math.min(1, h * 1.2);
      const k = cav * (1 + mott + ((loopA >= loopB ? a.id : b.id) - 0.5) * 0.05);
      const q = y * S + x;
      out.color[q * 3] = base[0] * k; out.color[q * 3 + 1] = base[1] * k; out.color[q * 3 + 2] = base[2] * k;
      out.height[q] = h;
      out.rough[q] = mix(0.98, 0.88, h);
    }
  }
  return out;
}

// ——————————————————————— 条纹茶巾（亚麻，两边各两道红条）———————————————————————
// 贴图 v 正好一条茶巾的宽（整幅，不平铺），u 沿茶巾的长（平铺）：条纹贴着两条长边走
export function torchon(S, P) {
  const n = perlin(P.seed), nw = perlin(P.seed + 1), nf = perlin(P.seed + 2);
  const out = alloc(S);
  const base = rgb(P.base), red = rgb(P.stripe);
  const T = P.threads;
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    // 离最近一条长边的距离（占全宽的比例）
    const e = Math.min(v, 1 - v);
    const inStripe = P.stripes.some(([a, b]) => e >= a && e <= b);
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      // 平纹：经纬两个方向的细纹
      const fx = u * T, fy = v * T;
      const warp = Math.sin(Math.PI * fx * 2) * 0.5 + 0.5, weft = Math.sin(Math.PI * fy * 2) * 0.5 + 0.5;
      const slub = fbm(nw, u, v, 4, 40, 2) * 0.08;
      const weave = 0.9 + 0.1 * Math.max(warp, weft);
      const mott = fbm(n, u, v, 3, 3, 3) * 0.04 + fbm(nf, u, v, 64, 64, 2) * 0.02;
      // 条纹是色织的：条纹边上的一两根纱颜色半混
      const s = inStripe ? 1 : 0;
      const c = [0, 1, 2].map((i) => mix(base[i], red[i], s) * weave * (1 + slub + mott));
      const q = y * S + x;
      out.color[q * 3] = c[0]; out.color[q * 3 + 1] = c[1]; out.color[q * 3 + 2] = c[2];
      out.height[q] = Math.max(warp, weft) * 0.4 + slub * 2;
      out.rough[q] = 0.92;
    }
  }
  return out;
}

// ——————————————————————— 水泥花砖（20cm，一张贴图 = 一整块 2m 地板模块）———————————————————————
// 每块砖的图案是四向对称的，拼起来图案在砖缝两边接上：
//   · 砖中心一颗八角星（深蓝），外面一道圆环；星心一个白圆点、里面一粒陶土红；
//   · 四个角各一个四分之一圆（灰蓝），四块砖拼起来就是砖缝交点上的一个整圆，圆里还有一圈白线；
//   · 四条边的中点各半个菱形（深蓝），和隔壁那块拼成一个整菱形；
//   · 水泥花砖是“压”出来的：颜料层边缘有一点点洇开，每块砖深浅略有不同，表面哑光、有细小的气孔；
//   · 砖缝 2mm、灰色、比砖面低一点，砖边微微倒圆；贴图四周各半条缝。
export function cementTiles(S, P) {
  const N = P.tiles, T = P.period / N, px = P.period / S;
  const nM = perlin(P.seed), nW = perlin(P.seed + 1), pits = worley(P.seed + 2);
  const rnd = mulberry(P.seed + 3);
  const tone = Array.from({ length: N * N }, () => 1 + (rnd() - 0.5) * 0.05);
  const C = { base: rgb(P.base), navy: rgb(P.navy), blue: rgb(P.blue), red: rgb(P.red), grout: rgb(P.grout) };
  const out = alloc(S);
  // 砖内坐标 (s, t) ∈ [-1, 1]，单位 = 半块砖；bleed：颜料边缘洇开的宽度（同一单位）
  const bleed = (0.0005 / (T / 2)) + px / (T / 2);
  const cov = (d) => clamp01(0.5 - d / bleed);
  const star = (s, t) => {
    // 八角星：极坐标下半径在 0.2 ~ 0.46 之间按角度折线变化
    const r = Math.hypot(s, t), a = Math.atan2(t, s);
    const k = Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) * 2; // 0 在星角，1 在两角之间
    return r - (0.46 - 0.24 * k);
  };
  for (let y = 0; y < S; y++) {
    const wy = (y + 0.5) * px;
    const j = Math.min(N - 1, Math.floor(wy / T)), ty = wy - j * T;
    for (let x = 0; x < S; x++) {
      const wx = (x + 0.5) * px;
      const i = Math.min(N - 1, Math.floor(wx / T)), tx = wx - i * T;
      const s = (tx / T) * 2 - 1, t = (ty / T) * 2 - 1;
      const r = Math.hypot(s, t);
      let c = C.base.slice();
      const lay = (col, a) => { if (a > 0) c = c.map((m, q) => mix(m, col[q], a)); };
      // 四角的四分之一圆（灰蓝）+ 圆里一圈白线
      const cr = Math.hypot(1 - Math.abs(s), 1 - Math.abs(t));
      lay(C.blue, cov(cr - 0.4));
      lay(C.base, cov(Math.abs(cr - 0.26) - 0.025));
      // 边中点的半个菱形（深蓝）
      const dm = Math.min(Math.abs(s) + (1 - Math.abs(t)), (1 - Math.abs(s)) + Math.abs(t));
      lay(C.navy, cov(dm - 0.2));
      // 中间的圆环、八角星、星心
      // 对角线上四片小叶子（灰蓝），指向四个角
      {
        const ds = (Math.abs(s) + Math.abs(t)) / Math.SQRT2 - 0.82, dn = (Math.abs(s) - Math.abs(t)) / Math.SQRT2;
        lay(C.blue, cov(Math.hypot(ds / 0.13, dn / 0.05) - 1) * 0.95);
      }
      lay(C.navy, cov(Math.abs(r - 0.56) - 0.035));
      lay(C.navy, cov(star(s, t)));
      lay(C.base, cov(r - 0.1));
      lay(C.red, cov(r - 0.05));
      // 砖与砖之间的深浅差、颜料层的云状起伏、磨损
      const mott = fbm(nM, wx / P.period, wy / P.period, 12, 12, 4) * 0.035;
      const wear = sstep(0.35, 0.8, fbm(nW, wx / P.period, wy / P.period, 6, 6, 3)) * 0.05;
      c = c.map((m) => m * tone[j * N + i] * (1 + mott) + wear * 0.6);
      // 细小的气孔
      const pc = pits((wx / P.period) * 520, (wy / P.period) * 520, 520, 520);
      const pit = pc.id < 0.035 ? 1 - sstep(0.08, 0.16, pc.f1) : 0;
      c = c.map((m) => m * (1 - pit * 0.22));
      // 砖缝
      const e = Math.min(tx, T - tx, ty, T - ty);
      const joint = 1 - sstep(P.joint / 2 - px * 0.5, P.joint / 2 + px * 0.5, e);
      const edge = 1 - sstep(P.joint / 2, P.joint / 2 + P.bevel, e);
      c = c.map((m, q) => mix(m, C.grout[q], joint));
      const k = y * S + x;
      out.color[k * 3] = c[0]; out.color[k * 3 + 1] = c[1]; out.color[k * 3 + 2] = c[2];
      out.height[k] = -edge * 0.3 - joint * 0.5 - pit * 0.2 + mott * 0.5;
      out.rough[k] = mix(0.78 - wear * 0.6, 0.9, joint);
    }
  }
  return out;
}
