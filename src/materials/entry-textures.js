// 玄关的程序化贴图：棋盘格大理石地面、洞石台面、毛毡帽。
import { perlin, fbm, worley, mulberry } from './noise.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function alloc(S) {
  return { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
}
function put(out, i, c, h, r) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h;
  out.rough[i] = r;
}
// 不要求周期的 fBm（砖内坐标用）
function fbm2(n, x, y, oct = 3, gain = 0.5) {
  let s = 0, a = 1, t = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f); t += a; a *= gain; f *= 2; }
  return s / t;
}

// ——————————————————————— 棋盘格大理石 ———————————————————————
// 贴图 = 一整块 2m 地板模块，n × n 块砖（黑白相间）。每块砖是单独切出来的一块石头：
//   · 纹路在砖内坐标里画，每块砖一个随机的起点和走向 —— 石纹在砖缝处断开，同色的砖也各不相同；
//   · 白砖（卡拉拉）是灰色细纹 + 淡云，黑砖（黑白根一类）是稀疏的白色粗纹；
//   · 砖缝 2mm，浅灰，比砖面低 1mm，砖边有一点圆；贴图四周各半条缝，模块拼起来是一条完整的缝。
// 高度单位是毫米（法线强度按像素的物理尺寸换算）
export function checker(S, P) {
  const N = P.tiles, T = P.period / N;
  const nV = perlin(P.seed), nV2 = perlin(P.seed + 1), nC = perlin(P.seed + 2), nF = perlin(P.seed + 3), nA = perlin(P.seed + 4);
  const rnd = mulberry(P.seed + 9);
  const tiles = Array.from({ length: N * N }, () => {
    const a = rnd() * Math.PI, a2 = a + 0.9 + rnd() * 0.6;
    return {
      ox: rnd() * 50, oy: rnd() * 50, ca: Math.cos(a), sa: Math.sin(a), ca2: Math.cos(a2), sa2: Math.sin(a2),
      tone: (rnd() - 0.5) * 2, dens: 0.75 + rnd() * 0.5,
    };
  });
  const out = alloc(S);
  const px = P.period / S; // 一个像素（米）
  // 一层纹路：t = 走向 · 密度 + 湍流，纹在 t 的整数等值线上；线宽用 |t - round(t)| / |∇t|（数值梯度）算，处处按米计。
  // 纹的浓淡、粗细沿着纹再用一层噪声调 —— 时隐时现、忽粗忽细，才不像等高线
  const vein = (n, L, a, b, t0, second) => {
    const ca = second ? t0.ca2 : t0.ca, sa = second ? t0.sa2 : t0.sa;
    const tf = (x, y) => (x * ca + y * sa) * L.dens * t0.dens / T + L.amp * fbm2(n, (x + t0.ox) * L.freq / T, (y + t0.oy) * L.freq / T, 4);
    const t = tf(a, b), e = px * 0.5;
    const g = Math.hypot(tf(a + e, b) - t, tf(a, b + e) - t) / e;
    const d = Math.abs(t - Math.round(t)) / (g + 1e-6);
    const m = fbm2(nA, (a + t0.ox) * 2.2 / T + (second ? 17 : 0), (b + t0.oy) * 2.2 / T, 3);
    const w = L.width * (0.35 + 1.3 * clamp01(0.5 + m * 1.4));
    const on = clamp01(0.35 + m * 2.2);
    return { line: (1 - sstep(0, w, d)) * on, halo: (1 - sstep(0, w * 9, d)) * on };
  };
  for (let y = 0; y < S; y++) {
    const wy = (y + 0.5) * px;
    const j = Math.min(N - 1, Math.floor(wy / T)), b = wy - j * T;
    for (let x = 0; x < S; x++) {
      const wx = (x + 0.5) * px;
      const i = Math.min(N - 1, Math.floor(wx / T)), a = wx - i * T;
      const tile = tiles[j * N + i];
      const M = (i + j) % 2 === 1 ? P.black : P.white;
      const cloud = fbm2(nC, (a + tile.ox) * 3 / T * 0.33, (b + tile.oy) * 3 / T * 0.33, 4);
      let c = mix3(M.base, M.cloud, clamp01(0.5 + cloud * 1.3) * 0.7);
      c = c.map((v) => v * (1 + tile.tone * M.tone));
      let rough = M.rough + (cloud + 1) * 0.02;
      const v1 = vein(nV, M.main, a, b, tile, false);
      c = mix3(c, M.haloColor, v1.halo * M.main.halo);
      c = mix3(c, M.vein, v1.line * M.main.strength);
      const v2 = vein(nV2, M.fine, a, b, tile, true);
      c = mix3(c, M.vein2, v2.line * M.fine.strength);
      rough += v1.line * 0.03;
      // 细小的晶粒闪点
      const fleck = fbm(nF, wx / P.period, wy / P.period, 900, 900, 1);
      c = c.map((v) => v * (1 + fleck * 0.02));
      // 砖缝：到砖边的距离（米）；贴图边上正好是半条缝
      const e = Math.min(a, T - a, b, T - b);
      const joint = 1 - sstep(P.joint / 2 - px * 0.5, P.joint / 2 + px * 0.5, e);
      const edge = 1 - sstep(P.joint / 2, P.joint / 2 + P.bevel, e); // 砖边的一点圆角
      c = mix3(c, P.grout, joint);
      put(out, y * S + x, c, -edge * 0.3 - joint * 0.7, mix(rough, 0.85, joint));
    }
  }
  return out;
}

// ——————————————————————— 洞石（顺纹切，哑光）———————————————————————
// 一层层的沉积带（横向，带与带之间深浅不一、边缘扭曲），带里是被拉长的小孔：
// 孔填了同色系、略深的填料 —— 表面是平的（只有一点点凹），但颜色、粗糙度都不一样。贴图可平铺
export function travertine(S, P) {
  const nW = perlin(P.seed), nC = perlin(P.seed + 2), nF = perlin(P.seed + 3), nS = perlin(P.seed + 6);
  const pits = worley(P.seed + 4), pits2 = worley(P.seed + 5);
  const rnd = mulberry(P.seed + 7);
  // 每一层沉积：厚薄（有的一两毫米、有的一两厘米）、颜色（在几种石色之间）、层内的深浅渐变、疏松程度（孔多不多）
  const layers = Array.from({ length: P.bands }, () => {
    const k = rnd();
    let acc = 0, ci = 0;
    while (ci < P.tones.length - 1 && k > (acc += P.tones[ci].p)) ci++;
    return {
      th: 0.3 + rnd() * rnd() * 2.4, c: P.tones[ci].c, shade: 1 + (rnd() - 0.5) * 0.05, grad: (rnd() - 0.5) * 0.1,
      porous: rnd() < P.porous ? 0.5 + rnd() * 0.5 : rnd() * 0.15,
    };
  });
  const total = layers.reduce((a, L) => a + L.th, 0);
  let acc0 = 0;
  for (const L of layers) { L.v0 = acc0 / total; acc0 += L.th; L.v1 = acc0 / total; }
  const layerAt = (v) => { let lo = 0, hi = layers.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (layers[m].v0 <= v) lo = m; else hi = m - 1; } return lo; };
  const out = alloc(S);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      // 层：v 方向，被低频噪声扭曲；层与层之间是一条清楚但不锯齿的边界
      const warp = fbm(nW, u, v, 2, 2, 4) * 0.035;
      const vv = ((v + warp) % 1 + 1) % 1;
      const k = layerAt(vv), A = layers[k], B = layers[(k + 1) % layers.length];
      const f = (vv - A.v0) / (A.v1 - A.v0);
      const blend = sstep(0.78, 1.0, f);
      const ca = A.c.map((m) => m * A.shade * (1 + (f - 0.5) * A.grad)), cb = B.c.map((m) => m * B.shade * (1 - 0.5 * B.grad));
      let c = mix3(ca, cb, blend);
      const porous = mix(A.porous, B.porous, blend);
      // 层里的细纹理：极淡的横向细线
      const striae = fbm(nS, u, v, 3, 90, 2);
      const cloud = fbm(nC, u, v, 4, 4, 4);
      c = c.map((m) => m * (1 + cloud * 0.05 + striae * 0.04));
      let h = 0, rough = P.rough + cloud * 0.04;
      // 孔：横向拉长的 Worley 格子；疏松的层里孔多
      for (const [w, C, r0] of [[pits, [P.pitsX, P.pitsY], 0.24], [pits2, [P.pitsX * 2.4, P.pitsY * 2.4], 0.2]]) {
        const cell = w(u * C[0], v * C[1], C[0], C[1]);
        if (((cell.id * 97.3) % 1) > porous) continue;
        const r = r0 * (0.55 + ((cell.id * 31.7) % 1) * 0.7);
        const d = 1 - sstep(r * 0.55, r, cell.f1);
        if (d <= 0) continue;
        c = mix3(c, P.fill, d * 0.8);
        h -= d * 0.6;
        rough = mix(rough, P.roughFill, d);
      }
      const fleck = fbm(nF, u, v, 256, 256, 1);
      c = c.map((m) => m * (1 + fleck * 0.02));
      put(out, y * S + x, c, h + fleck * 0.05, rough);
    }
  }
  return out;
}

// ——————————————————————— 毛毡 ———————————————————————
// 没有织纹，只有极细的纤维颗粒和一点点深浅不匀；毡帽的柔和全靠 sheen
export function felt(S, P) {
  const nF = perlin(P.seed), nM = perlin(P.seed + 1);
  const out = alloc(S);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const fiber = fbm(nF, u, v, 96, 96, 3);
      const mott = fbm(nM, u, v, 3, 3, 4);
      const b = 1 + fiber * 0.05 + mott * P.mottle;
      put(out, y * S + x, P.color.map((m) => m * b), fiber * 0.5 + mott * 0.3, 0.9 + fiber * 0.04);
    }
  }
  return out;
}
