// 影音室的程序化贴图：影音室图集（幕布上的电影画面、功放面板、喇叭振膜、投影仪网布、铭牌、按键、纯色格子）。
import { perlin, worley, mulberry } from './noise.js';
import { THEATER_ATLAS } from './atlas.js';
import { painter, sdRoundRect, sdSeg, sdPoly } from './laundry-textures.js';
import { text } from './gym-textures.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const fract = (x) => x - Math.floor(x);
const TAU = Math.PI * 2;
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

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
// 一块区域逐像素作画：f(u, v, du, dv) → [颜色, 高度, 粗糙度, 金属度, 自发光]；u、v ∈ [0, 1] 是去掉边距后的区域坐标
function region(out, S, box, marginPx, f) {
  const [x0, y0, x1, y1] = box, W = x1 - x0 - 2 * marginPx, H = y1 - y0 - 2 * marginPx;
  for (let y = y0; y < y1; y++) {
    const v = (y + 0.5 - y0 - marginPx) / H;
    for (let x = x0; x < x1; x++) {
      const u = (x + 0.5 - x0 - marginPx) / W;
      const [c, h, r, m, e] = f(u, v, 1 / W, 1 / H);
      put(out, y * S + x, c, h, r, m ?? 0, e ?? null);
    }
  }
}
// 多层噪声（不要求周期）
const fbn = (n, x, y, oct = 4) => {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); a *= 0.5; f *= 2.03; }
  return s;
};

// ——————————————————————— 电影画面 ———————————————————————
// 一帧 2.39:1 的宽银幕电影：黄昏的山湖。X ∈ [0, 1] 横跨画面，Y ∈ [0, 1] 从上往下（画面本身，不含黑边）。
//   · 天空从头顶的深蓝渐变到地平线的橙金，靠上几颗星；几缕薄云被落日从下面照亮，离太阳越近越暖；
//   · 太阳一半落在最远的山脊后面，四周两层光晕；三层山一层比一层近、一层比一层深（远处的偏紫、被雾气冲淡），
//     山脊迎着太阳的地方一道亮边；
//   · 湖面：倒映着天空和山（倒影往下越来越暗、越来越蓝，被波纹横向揉乱），太阳正下方一条碎金似的光带；
//     远岸贴着水面一层薄雾；
//   · 近景：左边一片杉树林的剪影压着画面，右下角一座木栈桥伸进湖里，桥上坐着两个人的背影，一个把头靠在另一个肩上；
//   · 最后压一层暗角和胶片颗粒，高光偏暖、暗部偏青。
function filmStill(P, pxY) {
  const n1 = perlin(P.seed + 1), n2 = perlin(P.seed + 2), n3 = perlin(P.seed + 3), n4 = perlin(P.seed + 4);
  const n5 = perlin(P.seed + 5), n6 = perlin(P.seed + 6), n7 = perlin(P.seed + 7);
  const stars = worley(P.seed + 8);
  const rnd = mulberry(P.seed + 9);
  const A = THEATER_ATLAS.film.aspect, pxX = pxY / A;
  const YW = 0.66;   // 远岸的水线
  const SKY = [[0, [14, 20, 54]], [0.3, [40, 42, 98]], [0.58, [132, 78, 122]], [0.8, [228, 122, 102]], [0.93, [252, 170, 112]], [1, [255, 204, 146]]]
    .map(([t, c]) => [t, rgb(c)]);
  const skyAt = (t) => {
    for (let i = 1; i < SKY.length; i++) if (t <= SKY[i][0]) return mix3(SKY[i - 1][1], SKY[i][1], sstep(0, 1, (t - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0])));
    return SKY[SKY.length - 1][1];
  };
  // 三道山脊（Y 越小越高）
  const r1 = (X) => 0.54 + 0.028 * n1(X * 2.3, 0.5) + 0.01 * n1(X * 8, 2.5) + 0.004 * n1(X * 30, 7.5) - 0.07 * Math.exp(-(((X - 0.27) / 0.08) ** 2)) - 0.03 * Math.exp(-(((X - 0.4) / 0.05) ** 2));
  const r2 = (X) => 0.59 + 0.024 * n2(X * 3.2 + 5, 0.5) + 0.008 * n2(X * 12, 4.5) + 0.003 * n2(X * 40, 1.5) - 0.045 * Math.exp(-(((X - 0.83) / 0.07) ** 2));
  const r3 = (X) => 0.628 + 0.012 * n3(X * 4.5 + 2, 0.5) + 0.006 * n3(X * 18, 1.5) + 0.004 * n3(X * 70, 3.5);
  const XS = 0.615, RS = 0.018, YS = r1(XS) + 0.2 * RS;   // 太阳：一小半落在山脊后面
  const sunGlow = (X, Y) => {
    const dx = (X - XS) * A, dy = Y - YS, d2 = dx * dx + dy * dy;
    return { d: Math.sqrt(d2), g: Math.exp(-d2 / 0.0012) * 0.9 + Math.exp(-d2 / 0.016) * 0.4 + Math.exp(-(dx * dx) / 0.35 - (dy * dy) / 0.006) * 0.3 };
  };
  const sky = (X, Y) => {
    let c = skyAt(clamp01(Y / YW));
    const { d, g } = sunGlow(X, Y);
    c = add(c, mul([1, 0.74, 0.46], g * 0.75));
    // 星星：只在上面三分之一，越往下越淡
    const s = stars(X * 110, Y * 46, 4096, 4096);
    if (s.id < 0.07) {
      const tw = (1 - sstep(0.012, 0.04, s.f1)) * (1 - sstep(0.04, 0.26, Y)) * (0.3 + 9 * s.id);
      c = add(c, [tw * 0.8, tw * 0.82, tw * 0.9]);
    }
    // 薄云：横向拉长的几缕，底下被照亮
    const band = sstep(0.14, 0.26, Y) * (1 - sstep(0.44, 0.54, Y));
    const cl = sstep(0.04, 0.34, fbn(n4, X * 3.2, Y * 16, 5) + 0.12 * n5(X * 1.3, 0.5)) * band;
    const lit = Math.pow(clamp01(1 - Math.abs(X - XS) * 1.35), 1.6) * (0.35 + 0.65 * sstep(0.22, 0.48, Y));
    const under = sstep(-0.1, 0.25, fbn(n4, X * 3.2, (Y + 0.012) * 16, 4));   // 云的下沿更亮
    c = mix3(c, mix3(rgb([70, 50, 92]), rgb([255, 158, 112]), clamp01(lit * (0.6 + 0.6 * (1 - under)))), cl * 0.88);
    // 日轮
    c = mix3(c, rgb([255, 248, 226]), clamp01((RS - d) / (1.2 * pxY) + 0.5));
    return c;
  };
  // 一层山：底色 + 往水线方向渐渐被雾冲淡；山脊迎着太阳的地方一道亮边
  const layer = (c, X, Y, ridge, base, fog, rim) => {
    const h = ridge(X), e = Y - h;
    if (e < -pxY) return c;
    const cov = clamp01(e / pxY + 0.5);
    const hz = clamp01((Y - h) / Math.max(0.01, YW - h));
    let lc = mix3(base, fog, 0.15 + 0.6 * hz * hz);
    const near = Math.pow(clamp01(1 - Math.abs(X - XS) * 2.2), 2);
    lc = add(lc, mul([1, 0.62, 0.36], rim * near * Math.exp(-e / 0.0025)));
    return mix3(c, lc, cov);
  };
  const far = (X, Y) => {
    let c = sky(X, Y);
    c = layer(c, X, Y, r1, rgb([124, 88, 132]), rgb([214, 134, 120]), 0.55);
    c = layer(c, X, Y, r2, rgb([82, 60, 98]), rgb([176, 108, 112]), 0.35);
    // 最近的一层山：树林的颗粒
    const e3 = Y - r3(X);
    if (e3 > -pxY) {
      const tex = fbn(n6, X * 160, Y * 90, 3);
      c = layer(c, X, Y, r3, rgb([44 + 10 * tex, 36 + 8 * tex, 58 + 10 * tex]), rgb([120, 80, 96]), 0.2);
    }
    // 贴着水面的一层薄雾
    const mist = Math.exp(-(((Y - YW + 0.006) / 0.012) ** 2)) * (0.6 + 0.4 * n7(X * 6, 0.5));
    return mix3(c, rgb([232, 156, 136]), 0.28 * mist);
  };

  // 近景：左边的杉树林（地面线从画面左边往右下落进水里）
  const shoreY = (X) => 0.6 + 0.5 * Math.pow(clamp01(X / 0.3), 1.8);
  const pines = [];
  for (let i = 0; i < 11; i++) {
    const tx = -0.02 + 0.24 * (i / 10) ** 1.3 + (rnd() - 0.5) * 0.02;
    const base = shoreY(Math.max(0, tx)) + 0.01;
    pines.push({ x: tx, base, h: (0.32 + 0.3 * rnd()) * (1 - 0.8 * clamp01(tx / 0.26)) + 0.06, w: 0.028 + 0.02 * rnd() });
  }
  const pineCov = (X, Y) => {
    let cov = 0;
    for (const t of pines) {
      const top = t.base - t.h;
      if (Y < top - pxY || Y > t.base) continue;
      const k = (Y - top) / t.h;
      const tier = fract(k * 6 + 0.3 * t.x * 50);
      const half = t.w * (0.12 + 0.88 * k) * (0.55 + 0.45 * tier) + (k > 0.94 ? 0.004 : 0);
      const dx = Math.abs(X - t.x) * A;
      cov = Math.max(cov, clamp01((half - dx) / (pxY * 1.2) + 0.5));
    }
    return cov;
  };
  // 栈桥：从右下角伸向画面中间，t = 0 在近端（画面下沿外），t = 1 在远端；桥面按透视分成一块块木板
  const DOCK = { x0: 0.9, y0: 1.06, x1: 0.62, y1: 0.8, w0: 0.26, w1: 0.05, YH: 0.62 };
  const dockAt = (Y) => {
    const t = (DOCK.y0 - Y) / (DOCK.y0 - DOCK.y1);
    return { t, xc: mix(DOCK.x0, DOCK.x1, t), hw: mix(DOCK.w0, DOCK.w1, t) / 2 };
  };
  // 两个坐着的人（背影）：桥面上 t ≈ 0.55 的位置
  const seat = dockAt(mix(DOCK.y0, DOCK.y1, 0.52));
  const pY = mix(DOCK.y0, DOCK.y1, 0.52);
  // 肩并肩坐着：左边的人坐得直一点，右边的人（个子小一点、脑后挽着发髻）把头歪靠在左边那人的肩上
  const people = [
    { x: seat.xc - 0.012, y: pY, s: 1, lean: 0, bun: false },
    { x: seat.xc + 0.012, y: pY - 0.002, s: 0.9, lean: -1, bun: true },
  ];
  // 平滑并集：几块形状之间圆滑地连起来（肩膀接脖子、脖子接头）
  const smin = (a, b, kk) => { const h = clamp01(0.5 + (0.5 * (b - a)) / kk); return mix(b, a, h) - kk * h * (1 - h); };
  const personSD = (X, Y, p) => {
    // 以画面高度为单位的局部坐标（x 乘上宽高比）；y 往上为负，0 是坐着的桥面
    const x = (X - p.x) * A / p.s, y = (Y - p.y) / p.s;
    const hips = sdRoundRect(x, y, 0, -0.018, 0.03, 0.018, 0.014);
    const torso = sdRoundRect(x, y, 0, -0.052, 0.025, 0.034, 0.02);
    const shoulders = sdRoundRect(x, y, p.lean * 0.003, -0.077, 0.031, 0.009, 0.009);
    const hx = p.lean * 0.017, hy = p.lean ? -0.098 : -0.106;
    const ex = (x - hx) / 0.0155, ey = (y - hy) / 0.0185;
    const head = (Math.hypot(ex, ey) - 1) * 0.0155;
    const neck = sdSeg(x, y, [p.lean * 0.004, -0.082], [hx * 0.8, hy + 0.012], 0.0065);
    let d = smin(smin(hips, torso, 0.012), shoulders, 0.01);
    d = smin(d, neck, 0.006);
    d = smin(d, head, 0.005);
    if (p.bun) d = smin(d, Math.hypot(x - hx - 0.006, y - hy + 0.016) - 0.0075, 0.004);
    return d * p.s;
  };

  return (X, Y) => {
    let c;
    if (Y <= YW) c = far(X, Y);
    else {
      // 湖面：倒影（波纹把倒影横着揉乱，越近越乱），越近越暗、越偏蓝
      const depth = (Y - YW) / (1 - YW);
      const rx = (0.0015 + 0.012 * depth) * fbn(n5, X * 22, Y * (160 + 520 * depth), 3);
      const ry = 0.004 * depth * n7(X * 18, Y * 300);
      const Ym = Math.max(0, 2 * YW - Y + ry);
      c = far(X + rx, Ym);
      c = add(mul(c, 0.78 - 0.34 * depth), mul(rgb([10, 18, 34]), 0.6 + 0.4 * depth));
      // 波纹：一道道横向的明暗
      const wave = sstep(0.15, 0.6, fbn(n7, X * (14 + 30 * depth), Y * (260 + 900 * depth), 3));
      c = mul(c, 0.9 + 0.16 * wave);
      // 太阳下方的碎金光带
      const w = 0.012 + 0.05 * depth;
      const path = Math.exp(-(((X - XS) / w) ** 2));
      const glint = sstep(0.25, 0.75, n6(X * 140, Y * (700 + 900 * depth)) + 0.3 * n5(X * 60, Y * 2000));
      c = add(c, mul([1, 0.8, 0.52], path * (0.12 + 0.95 * glint) * (1 - 0.35 * depth)));
      // 远岸的水线：一道细亮线
      c = add(c, mul([1, 0.7, 0.5], 0.3 * Math.exp(-(((Y - YW) / 0.0016) ** 2)) * (0.5 + 0.5 * n1(X * 40, 9.5))));
    }
    // 杉树林和左岸
    const land = clamp01((Y - shoreY(X)) / pxY + 0.5) * (X < 0.34 ? 1 : 0);
    const pc = Math.max(pineCov(X, Y), land);
    if (pc > 0) {
      const t = fbn(n3, X * 90, Y * 60, 2);
      c = mix3(c, rgb([12 + 6 * t, 14 + 6 * t, 22 + 6 * t]), pc);
    }
    // 栈桥
    if (Y > DOCK.y1 - 0.004) {
      const { t, xc, hw } = dockAt(Y);
      const d = Math.abs(X - xc) - hw;
      const top = clamp01(-d / pxX + 0.5) * clamp01((Y - DOCK.y1) / pxY + 0.5);
      // 木桩：沿着桥的左沿往水里扎
      let posts = 0;
      for (let i = 0; i < 6; i++) {
        const tp = 0.12 + i * 0.17, yp = mix(DOCK.y0, DOCK.y1, tp), dk = dockAt(yp);
        const xp = dk.xc - dk.hw + 0.002, pw = 0.0045 * (1.2 - tp);
        if (Y > yp && Y < yp + 0.05 * (1.15 - tp)) posts = Math.max(posts, clamp01((pw - Math.abs(X - xp)) / pxX + 0.5));
      }
      if (posts > 0) c = mix3(c, rgb([16, 12, 16]), posts);
      if (top > 0) {
        // 木板：透视下越远越密；板缝深一点；桥面被天光照着，远处偏亮
        const z = 1 / Math.max(0.02, Y - DOCK.YH);
        const plank = fract(z * 2.6);
        const gap = sstep(0.9, 0.97, plank);
        let wc = mix3(rgb([44, 30, 32]), rgb([96, 62, 58]), 0.3 + 0.5 * t);
        wc = mul(wc, (1 - 0.45 * gap) * (0.9 + 0.2 * n2(X * 200, z * 3)));
        // 桥面左沿：朝着太阳的一侧边亮一点
        const dl = X - (xc - hw);
        wc = add(wc, mul([1, 0.66, 0.4], 0.25 * Math.exp(-((dl / 0.0025) ** 2))));
        c = mix3(c, wc, top);
      }
      // 桥身左侧的立面：左沿底下一条深色的带子，越远越窄
      const xl0 = DOCK.x0 - DOCK.w0 / 2, xl1 = DOCK.x1 - DOCK.w1 / 2;
      const ts = (X - xl0) / (xl1 - xl0);
      if (ts >= 0 && ts <= 1) {
        const ye = mix(DOCK.y0, DOCK.y1, ts), th = 0.022 * (1 - 0.8 * ts);
        const sc = clamp01((Y - ye) / pxY + 0.5) * clamp01((ye + th - Y) / pxY + 0.5) * (1 - top);
        if (sc > 0) c = mix3(c, rgb([20, 14, 18]), sc);
      }
    }
    // 两个人的背影（逆光的剪影，朝着太阳的左沿一道暖色的边）
    for (const p of people) {
      const sd = personSD(X, Y, p);
      if (sd > pxY * 2) continue;
      const cov = clamp01(-sd / pxY + 0.5);
      let pc2 = rgb([12, 10, 16]);
      const sl = personSD(X - 0.004 / A, Y, p);
      if (sl > 0) pc2 = add(pc2, mul([1, 0.62, 0.34], 0.55 * clamp01(sl / 0.004)));
      c = mix3(c, pc2, cov);
    }
    // 调色：高光偏暖、暗部偏青；暗角
    const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    c = add(c, mul([-0.012, 0.004, 0.02], 1 - sstep(0, 0.35, lum)));
    const vg = 1 - 0.34 * Math.pow((X - 0.5) ** 2 * 1.4 + (Y - 0.5) ** 2 * 1.1, 1.1) * 2.2;
    c = mul(c, vg);
    return c.map(clamp01);
  };
}

// ——————————————————————— 影音室图集 ———————————————————————
export function theaterAtlas(S, P) {
  const A = THEATER_ATLAS, k = S / A.size, m = Math.round(2 * k);
  const out = alloc(S);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nB = perlin(P.seed + 20), nC = perlin(P.seed + 21), nF = perlin(P.seed + 22);

  // —— 纯色格子（LED 的格子带自发光）——
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

  // —— 电影画面：自发光是画面本身；颜色（漫反射）压暗，屋里的灯不会把画面冲白 ——
  {
    const b = box('film');
    const aspectBox = (b[2] - b[0] - 2 * m) / (b[3] - b[1] - 2 * m);   // 16:9
    const vb = (1 - aspectBox / A.film.aspect) / 2;                      // 上下黑边各占的高度
    const pxY = 1 / ((b[3] - b[1] - 2 * m) * (1 - 2 * vb));
    const scene = filmStill(P, pxY);
    region(out, S, b, m, (u, v) => {
      let e;
      if (v < vb || v > 1 - vb) e = [0.018, 0.018, 0.022];
      else {
        e = scene(u, (v - vb) / (1 - 2 * vb));
        // 胶片颗粒
        const g = (hash(u * 1931.7, v * 1277.3) - 0.5) * 0.035;
        e = e.map((x) => clamp01(x + g * (0.4 + x)));
      }
      return [e.map((x) => 0.06 + 0.3 * x), 0, 0.9, 0, e];
    });
  }

  // —— 功放面板：拉丝铝、黑玻璃显示屏、按键 ——
  {
    const b = box('receiver'), { w: W, h: H } = A.receiver;
    region(out, S, b, m, (u, v) => {
      const x = u * W, y = v * H;
      const brush = 0.6 * nB(x * 3, y * 1400) + 0.4 * nB(x * 9 + 3, y * 3800);
      let c = mul(rgb([184, 186, 190]), 0.92 + 0.08 * brush);
      // 上下两道倒角
      const edge = Math.min(y, H - y);
      c = mul(c, 0.75 + 0.25 * sstep(0, 0.0025, edge));
      return [c, 0.5 + 0.1 * brush, 0.3 + 0.06 * brush, 1];
    });
    const { fill } = painter(out, S, [b[0] + m, b[1] + m, b[2] - m, b[3] - m], W, H);
    const dark = { color: rgb([9, 9, 11]), rough: 0.06, metal: 0, height: 0.2 };
    fill((x, y) => sdRoundRect(x, y, 0.215, 0.052, 0.088, 0.021, 0.004), [0.12, 0.028, 0.31, 0.076], dark);
    const lit = { color: rgb([120, 190, 230]), emit: rgb([150, 214, 255]) };
    text(fill, 'DOLBY ATMOS  7.1.4', 0.215, 0.037, 0.0062, { align: 'center', stroke: 0.14, ...lit });
    text(fill, 'VOL -32.5', 0.215, 0.049, 0.0145, { align: 'center', stroke: 0.12, ...lit });
    text(fill, 'HDMI 1  MOVIE', 0.215, 0.066, 0.0048, { align: 'center', stroke: 0.15, color: rgb([80, 130, 160]), emit: rgb([96, 150, 186]) });
    // 旋钮的座：一圈暗一点的凹槽（旋钮本身是几何）
    for (const [cx, r] of [[0.058, 0.03], [0.372, 0.037]]) {
      fill((x, y) => Math.abs(Math.hypot(x - cx, y - 0.07) - r - 0.0015) - 0.0012, [cx - r - 0.004, 0.07 - r - 0.004, cx + r + 0.004, 0.07 + r + 0.004], { color: rgb([60, 60, 64]), height: 0.2, rough: 0.5 });
    }
    // 一排小按键
    for (let i = 0; i < 8; i++) {
      const cx = 0.142 + i * 0.0208;
      fill((x, y) => Math.hypot(x - cx, y - 0.104) - 0.0042, [cx - 0.005, 0.099, cx + 0.005, 0.109], { color: rgb([60, 62, 66]), height: 0.3 });
      fill((x, y) => Math.hypot(x - cx, y - 0.104) - 0.0034, [cx - 0.004, 0.1, cx + 0.004, 0.108], { color: rgb([196, 198, 202]), metal: 1, rough: 0.25, height: 0.6 });
    }
    // 电源键和它旁边的蓝色指示灯；耳机孔；左上角的字
    fill((x, y) => Math.hypot(x - 0.02, y - 0.118) - 0.0045, [0.014, 0.112, 0.026, 0.124], { color: rgb([40, 40, 44]), height: 0.3, metal: 0 });
    fill((x, y) => Math.hypot(x - 0.031, y - 0.118) - 0.0014, [0.029, 0.116, 0.033, 0.12], { color: rgb([70, 150, 255]), emit: rgb([80, 170, 255]), metal: 0 });
    fill((x, y) => Math.hypot(x - 0.41, y - 0.118) - 0.0032, [0.406, 0.114, 0.414, 0.122], { color: rgb([12, 12, 14]), height: 0, metal: 0 });
    text(fill, 'TRYITEM', 0.016, 0.01, 0.0068, { stroke: 0.15, color: rgb([80, 82, 86]), height: 0.3 });
    text(fill, 'AV RECEIVER', W - 0.016, 0.011, 0.0048, { align: 'right', stroke: 0.15, color: rgb([96, 98, 102]), height: 0.3 });
  }

  // —— 低音振膜：哑光的深灰纸盆，径向的纤维，外沿一圈压纹 ——
  region(out, S, box('cone'), m, (u, v) => {
    const fib = 0.6 * nC(u * 260, v * 5) + 0.4 * nC(u * 700 + 9, v * 12);
    const ring = Math.exp(-(((v - 0.06) / 0.02) ** 2));
    const c = mul(rgb([44, 44, 46]), (0.9 + 0.14 * fib) * (1 - 0.25 * ring));
    return [c, 0.5 + 0.2 * fib - 0.3 * ring, 0.72, 0];
  });
  // —— 中音振膜：银灰的编织纤维（篮纹），u 绕一圈 96 格、v 径向 12 格 ——
  region(out, S, box('weave'), m, (u, v) => {
    const cu = u * 96, cv = v * 12, i = Math.floor(cu), j = Math.floor(cv), fu = cu - i, fv = cv - j;
    const along = (i + j) % 2 === 0;
    const f = along ? fv : fu, g = along ? fu : fv;
    const bump = Math.sin(Math.PI * f) * (0.75 + 0.25 * Math.sin(Math.PI * g * 6) ** 2);
    const c = mul(rgb([176, 178, 180]), 0.72 + 0.34 * bump + 0.04 * nC(u * 40, v * 8));
    return [c, bump, 0.42, 0.25];
  });
  // —— 投影仪正面的针织网布 ——
  {
    const b = box('fabric'), { w: W, h: H } = A.fabric;
    region(out, S, b, m, (u, v) => {
      const x = u * W, y = v * H;
      const kx = Math.sin((x / 0.0016) * Math.PI), ky = Math.sin((y / 0.0016) * Math.PI + (Math.floor(x / 0.0016) % 2) * 1.2);
      const knit = 0.5 + 0.5 * kx * ky;
      const c = mul(rgb([56, 58, 62]), 0.86 + 0.18 * knit + 0.05 * nF(x * 60, y * 60));
      return [c, knit, 0.92, 0];
    });
  }
  // —— 铭牌：音箱的拉丝铝牌（黑字），投影仪顶上的灰字 ——
  {
    const b = box('badge'), { w: W, h: H } = A.badge;
    region(out, S, b, m, (u, v) => {
      const brush = nB(u * 20, v * 600);
      return [mul(rgb([196, 198, 202]), 0.92 + 0.08 * brush), 0.6, 0.28, 1];
    });
    const { fill } = painter(out, S, [b[0] + m, b[1] + m, b[2] - m, b[3] - m], W, H);
    text(fill, 'TRYITEM', W / 2, 0.0022, 0.0044, { align: 'center', stroke: 0.14, color: rgb([20, 20, 22]), metal: 0, rough: 0.5, height: 0.2 });
  }
  {
    const b = box('badgeW'), { w: W, h: H } = A.badgeW;
    region(out, S, b, m, () => [rgb([228, 228, 224]), 0.5, 0.32, 0]);
    const { fill } = painter(out, S, [b[0] + m, b[1] + m, b[2] - m, b[3] - m], W, H);
    text(fill, 'TRYITEM  LASER 4K', W / 2, 0.0045, 0.006, { align: 'center', stroke: 0.14, color: rgb([150, 152, 156]) });
  }
  // —— 沙发扶手侧面的按键：黑色面板上两个圆键（躺下 / 坐起的箭头）、一个 USB-C 口 ——
  {
    const b = box('control'), { w: W, h: H } = A.control;
    region(out, S, b, m, () => [rgb([26, 26, 28]), 0.4, 0.45, 0]);
    const { fill } = painter(out, S, [b[0] + m, b[1] + m, b[2] - m, b[3] - m], W, H);
    for (const [cx, dir] of [[0.016, 1], [0.036, -1]]) {
      fill((x, y) => Math.hypot(x - cx, y - H / 2) - 0.0072, [cx - 0.008, 0.002, cx + 0.008, 0.018], { color: rgb([150, 152, 156]), metal: 1, rough: 0.3, height: 0.7 });
      fill((x, y) => Math.hypot(x - cx, y - H / 2) - 0.0062, [cx - 0.007, 0.003, cx + 0.007, 0.017], { color: rgb([48, 48, 52]), metal: 0, rough: 0.4, height: 0.6 });
      const tri = dir > 0 ? [[cx - 0.0032, H / 2 + 0.0018], [cx + 0.0032, H / 2 + 0.0018], [cx, H / 2 - 0.0026]] : [[cx - 0.0032, H / 2 - 0.0018], [cx + 0.0032, H / 2 - 0.0018], [cx, H / 2 + 0.0026]];
      fill((x, y) => sdPoly(x, y, tri), [cx - 0.004, H / 2 - 0.004, cx + 0.004, H / 2 + 0.004], { color: rgb([236, 236, 236]), height: 0.7 });
    }
    fill((x, y) => sdRoundRect(x, y, 0.062, H / 2, 0.0045, 0.0016, 0.0016), [0.056, H / 2 - 0.003, 0.068, H / 2 + 0.003], { color: rgb([8, 8, 8]), height: 0 });
  }
  return out;
}
