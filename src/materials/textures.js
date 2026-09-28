// 程序化 PBR 贴图（全部可无缝平铺）。每种材质输出三张图：
//   color  基础色（sRGB，JPEG）
//   normal 切线空间法线（glTF 约定：+X 右，+Y 上）
//   rough  G 通道 = 粗糙度，B 通道 = 金属度（glTF metallicRoughness 约定）
//
// 生成结果按“名称 + 尺寸 + 版本号”缓存到 .cache/tex，改参数后记得把 VERSION 加一。
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { perlin, fbm, worley, mulberry } from './noise.js';
import * as decor from './decor-textures.js';
import * as lamp from './lamp-textures.js';
import { INTERIOR } from './interior-textures.js';
import * as patio from './patio-textures.js';
import * as entry from './entry-textures.js';

const VERSION = 8;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (r, g, b) => [r / 255, g / 255, b / 255];
const fract = (x) => x - Math.floor(x);

// ——————————————————————— 木材 ———————————————————————
// 贴图代表一块“拼板”：沿 v 方向由若干窄板条拼成，每条板的颜色、年轮密度、
// 纹理走向（径切直纹 / 弦切山纹）都略有不同 —— 真实实木桌面的样子。
function wood(S, P) {
  const nWarp = perlin(P.seed), nFib = perlin(P.seed + 11), nPore = perlin(P.seed + 23), nCol = perlin(P.seed + 37);
  const rnd = mulberry(P.seed + 5);
  const K = P.staves;
  // 板条宽度随机（0.6~1.4 倍），累加后归一化
  const widths = Array.from({ length: K }, () => 0.6 + 0.8 * rnd());
  const total = widths.reduce((a, b) => a + b, 0);
  const edges = [0];
  for (const w of widths) edges.push(edges[edges.length - 1] + w / total);
  const staves = Array.from({ length: K }, () => ({
    rings: P.rings * (0.7 + 0.6 * rnd()),
    phase: rnd() * 10,
    tint: 1 + (rnd() - 0.5) * P.staveTint,
    warm: (rnd() - 0.5) * P.staveWarm,
    arch: rnd() < P.archChance ? 0.25 + 0.5 * rnd() : 0,
    archPhase: rnd(),
    archCenter: 0.25 + 0.5 * rnd(),
    archCycles: 1 + Math.floor(rnd() * 2),
  }));
  const out = alloc(S);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    let k = 0;
    while (k < K - 1 && v >= edges[k + 1]) k++;
    const w = (v - edges[k]) / (edges[k + 1] - edges[k]);
    const st = staves[k];
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const warp = fbm(nWarp, u, v, 2, K * 2, 4) * P.warp;
      let r;
      if (st.arch > 0) {
        // 弦切“山纹”：年轮到一条倾斜髓心线的距离
        const d = (w - st.archCenter) * 1.0;
        const lift = st.arch * (0.55 + 0.45 * Math.sin(2 * Math.PI * (u * st.archCycles + st.archPhase)));
        r = Math.sqrt(d * d * 4 + lift * lift) * st.rings + warp + st.phase;
      } else {
        r = w * st.rings + warp + st.phase;
      }
      const t = fract(r);
      // 晚材：窄而深，从早材渐变过去、再突然回到早材
      const late = sstep(0.55, 0.88, t) * (1 - sstep(0.9, 1.0, t));
      // 顺纹方向的细纤维
      const fib = fbm(nFib, u, v, 6, 700, 3);
      // 导管孔：早材里一段段的短暗线
      const pn = nPore(u * 90, v * 1600, 90, 1600);
      const pore = sstep(0.25, 0.65, pn) * (1 - 0.7 * sstep(0.2, 0.5, t)) * P.pores;
      // 大尺度色差
      const cv = fbm(nCol, u, v, 3, 5, 3);
      let c = mix3(P.early, P.late, late * P.lateMix);
      c = mix3(c, P.pore, pore * 0.55);
      const b = st.tint * (1 + cv * P.colorVar + fib * P.fiberVar);
      c = [c[0] * b * (1 + st.warm), c[1] * b, c[2] * b * (1 - st.warm)];
      const i = y * S + x;
      out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
      out.height[i] = -pore * 1.0 - late * 0.25 + fib * 0.35;
      out.rough[i] = P.rough + pore * 0.12 - late * 0.04 + fib * 0.03;
    }
  }
  return out;
}

// ——————————————————————— 亚麻 ———————————————————————
// 平纹组织：经纱（竖）与纬纱（横）一上一下交织；每根纱有自己的粗细变化（竹节）和色调。
function linen(S, P) {
  const T = P.threads;
  const n = perlin(P.seed), nc = perlin(P.seed + 3);
  const rnd = mulberry(P.seed + 9);
  const tone = Array.from({ length: T * 2 }, (_, i) => (rnd() - 0.5) * P.threadTone + n(i * 0.37, 77.5, 4096, 4096) * P.threadTone * 0.6);
  const out = alloc(S);
  const prof = (a, thick) => {
    const d = (a - 0.5) / (0.5 * thick);
    return d * d >= 1 ? 0 : Math.sqrt(1 - d * d);
  };
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    const fy = v * T, j = Math.floor(fy), ay = fy - j;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const fx = u * T, i = Math.floor(fx), ax = fx - i;
      // 竹节：沿纱线方向的低频粗细变化
      const slW = 1 + P.slub * n(v * 6, i * 7.31, 6, 4096);
      const slF = 1 + P.slub * n(u * 6, j * 5.17 + 1000, 6, 4096);
      const upW = 0.5 + 0.5 * Math.sin(Math.PI * (fy + i));
      const upF = 0.5 + 0.5 * Math.sin(Math.PI * (fx + j + 1));
      const hw = prof(ax, 0.86 * slW) * (0.45 + 0.55 * upW) * slW;
      const hf = prof(ay, 0.86 * slF) * (0.45 + 0.55 * upF) * slF;
      const warpTop = hw >= hf;
      const h = Math.max(hw, hf);
      const t = warpTop ? tone[i] : tone[T + j];
      const mott = fbm(nc, u, v, 3, 3, 3) * P.mottle;
      const cav = 0.72 + 0.28 * Math.min(1, h * 1.2);
      const base = warpTop ? P.warpColor : P.weftColor;
      const b = (1 + t + mott) * cav * (1 + ((warpTop ? slW : slF) - 1) * 0.25);
      const idx = y * S + x;
      out.color[idx * 3] = base[0] * b; out.color[idx * 3 + 1] = base[1] * b; out.color[idx * 3 + 2] = base[2] * b;
      out.height[idx] = h;
      out.rough[idx] = mix(0.96, 0.84, h);
    }
  }
  return out;
}

// ——————————————————————— 圈绒（bouclé）———————————————————————
// 两层 Worley：每个格子是一个小线圈（环形高度），线圈之间的缝隙压暗，像真实的圈圈纱。
function boucle(S, P) {
  const w1 = worley(P.seed), w2 = worley(P.seed + 1), n = perlin(P.seed + 2);
  const out = alloc(S);
  const C1 = P.cells, C2 = Math.round(P.cells * 1.7);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const a = w1(u * C1, v * C1, C1, C1);
      const b = w2(u * C2 + 0.37, v * C2 + 0.71, C2, C2);
      const loop = (f) => Math.exp(-(((f - 0.33) / 0.14) ** 2)) * 0.8 + Math.max(0, 1 - f / 0.55) * 0.5;
      const ha = loop(a.f1) * (0.7 + 0.3 * a.id);
      const hb = loop(b.f1) * (0.6 + 0.3 * b.id) * 0.85;
      const h = Math.max(ha, hb);
      const mott = fbm(n, u, v, 4, 4, 3) * P.mottle;
      const cav = 0.78 + 0.22 * Math.min(1, h);
      const tint = ha >= hb ? 1 + (a.id - 0.5) * 0.06 : 1 + (b.id - 0.5) * 0.06;
      const k = cav * tint * (1 + mott);
      const i = y * S + x;
      out.color[i * 3] = P.color[0] * k; out.color[i * 3 + 1] = P.color[1] * k; out.color[i * 3 + 2] = P.color[2] * k;
      out.height[i] = h;
      out.rough[i] = mix(0.98, 0.9, h);
    }
  }
  return out;
}

// ——————————————————————— 丝绒 ———————————————————————
// 绒面几乎没有可见纹理，重点是“倒绒”造成的大块明暗（配合 sheen）。
function velvet(S, P) {
  const n = perlin(P.seed), nf = perlin(P.seed + 1);
  const out = alloc(S);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const crush = fbm(n, u, v, 2, 3, 4);
      const pile = fbm(nf, u, v, 64, 64, 2);
      const b = 1 + crush * P.crush + pile * 0.04;
      const i = y * S + x;
      out.color[i * 3] = P.color[0] * b; out.color[i * 3 + 1] = P.color[1] * b; out.color[i * 3 + 2] = P.color[2] * b;
      out.height[i] = crush * 0.6 + pile * 0.15;
      out.rough[i] = 0.78 + crush * 0.06;
    }
  }
  return out;
}

// ——————————————————————— 皮革 ———————————————————————
// 荔枝纹：Worley F2-F1 做出细密的“颗粒 + 折痕”，再叠加大尺度的褶皱与包浆色差。
function leather(S, P) {
  const w = worley(P.seed), n = perlin(P.seed + 1), nw = perlin(P.seed + 2);
  const out = alloc(S);
  const C = P.cells;
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const c = w(u * C, v * C, C, C);
      const edge = sstep(0.0, 0.16, c.f2 - c.f1);
      const dome = 1 - Math.min(1, c.f1 * c.f1 * 1.6);
      const wr = fbm(nw, u, v, 3, 9, 4);
      const wrinkle = 1 - sstep(0.0, 0.035, Math.abs(wr));
      const patina = fbm(n, u, v, 2, 2, 4);
      const h = edge * (0.55 + 0.45 * dome) - wrinkle * 0.25;
      const b = (0.9 + 0.1 * edge) * (1 + patina * P.patina) * (1 - wrinkle * 0.05) * (1 + (c.id - 0.5) * 0.04);
      const i = y * S + x;
      out.color[i * 3] = P.color[0] * b; out.color[i * 3 + 1] = P.color[1] * b; out.color[i * 3 + 2] = P.color[2] * b * 0.98;
      out.height[i] = h;
      out.rough[i] = mix(0.62, 0.4, edge * dome) + wrinkle * 0.08 - patina * 0.05;
    }
  }
  return out;
}

// ——————————————————————— 大理石 ———————————————————————
// 域扭曲噪声的零值等值线 = 石纹。主纹粗一些、次纹细而淡；抛光面粗糙度很低。
function marble(S, P) {
  const n1 = perlin(P.seed), n2 = perlin(P.seed + 1), n3 = perlin(P.seed + 2), n5 = perlin(P.seed + 4);
  const out = alloc(S);
  // 经典“扰动条纹”石纹：t = A·u + B·v + 湍流。A、B 取整数 → 条纹场可平铺。
  // 纹路在 t 的整数等值线上，用 dist/|∇t| 让线宽处处一致，再加一圈淡淡的晕。
  const layers = [
    { A: 1, B: 1, amp: 0.55, f: [2, 2], width: 0.0024, strength: 0.85, color: P.vein },
    { A: 2, B: -1, amp: 0.8, f: [3, 3], width: 0.0012, strength: 0.5, color: P.vein2 },
    { A: 3, B: 2, amp: 1.1, f: [4, 4], width: 0.0007, strength: 0.35, color: P.vein2 },
  ];
  const tField = (L, u, v) => L.A * u + L.B * v + L.amp * fbm(L === layers[0] ? n1 : L === layers[1] ? n2 : n3, u, v, L.f[0], L.f[1], 5);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const cloud = fbm(n5, u, v, 3, 3, 5);
      let c = mix3(P.base, P.cloud, clamp01(0.45 + cloud * 1.1) * 0.5);
      let hgt = 0, rough = 0.24 + (cloud + 1) * 0.03;
      for (const L of layers) {
        const e = 0.5 / S;
        const t = tField(L, u, v);
        const gx = (tField(L, u + e, v) - t) / e, gy = (tField(L, u, v + e) - t) / e;
        const fr = t - Math.floor(t);
        const d = Math.min(fr, 1 - fr) / (Math.hypot(gx, gy) + 1e-6);
        const line = 1 - sstep(0, L.width, d);
        const halo = 1 - sstep(0, L.width * 10, d);
        c = mix3(c, P.cloud, halo * 0.25 * L.strength);
        c = mix3(c, L.color, line * L.strength);
        hgt -= line * L.strength * 0.3;
        rough += line * 0.04 * L.strength;
      }
      const i = y * S + x;
      out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
      out.height[i] = hgt;
      out.rough[i] = rough;
    }
  }
  return out;
}

export const TEXTURES = {
  oak: {
    size: 1024, detail: 0.5, normalStrength: 2.2,
    gen: (S) => wood(S, {
      seed: 11, staves: 8, rings: 18, warp: 1.8, archChance: 0.3,
      staveTint: 0.08, staveWarm: 0.04, pores: 1, lateMix: 1, colorVar: 0.06, fiberVar: 0.05,
      early: rgb(208, 180, 142), late: rgb(148, 110, 74), pore: rgb(122, 90, 60), rough: 0.6,
    }),
  },
  walnut: {
    size: 1024, detail: 0.5, normalStrength: 1.8,
    gen: (S) => wood(S, {
      seed: 21, staves: 7, rings: 13, warp: 2.4, archChance: 0.5,
      staveTint: 0.14, staveWarm: 0.05, pores: 0.7, lateMix: 0.62, colorVar: 0.12, fiberVar: 0.07,
      early: rgb(104, 74, 56), late: rgb(68, 46, 34), pore: rgb(52, 35, 26), rough: 0.5,
    }),
  },
  linen: {
    size: 512, normalStrength: 3.5,
    gen: (S) => linen(S, {
      seed: 31, threads: 128, slub: 0.2, threadTone: 0.05, mottle: 0.04,
      warpColor: rgb(240, 236, 228), weftColor: rgb(232, 228, 219),
    }),
  },
  boucle: {
    size: 512, normalStrength: 4,
    gen: (S) => boucle(S, { seed: 41, cells: 56, mottle: 0.04, color: rgb(236, 230, 218) }),
  },
  velvet: {
    size: 512, normalStrength: 1.2,
    gen: (S) => velvet(S, { seed: 51, crush: 0.16, color: rgb(40, 76, 63) }),
  },
  leather: {
    size: 512, normalStrength: 3,
    gen: (S) => leather(S, { seed: 61, cells: 90, patina: 0.14, color: rgb(122, 72, 46) }),
  },
  marble: {
    size: 1024, detail: 0.5, normalStrength: 1,
    gen: (S) => marble(S, {
      seed: 71, base: rgb(240, 238, 234), cloud: rgb(212, 211, 208), vein: rgb(122, 124, 130), vein2: rgb(168, 169, 172),
    }),
  },
  // —— 摆件 ——（v 是单张贴图自己的版本号，改参数时只让这一张重新生成）
  // 图集里有细线和小字：颜色图不做色度抽样（4:4:4），金线不会糊成一片
  books: { size: 512, normalStrength: 1.5, v: 3, chroma444: true, gen: decor.books },
  ceramics: { size: 1024, normalStrength: 3, v: 2, gen: decor.ceramics },
  foliage: { size: 1024, detail: 0.5, normalStrength: 2, v: 1, gen: decor.foliage },
  // 地毯：颜色是整幅图案（2m × 1.4m 一张图）；法线另用一小块可平铺的羊毛绒面（0.25m 见方），
  // 材质里用 KHR_texture_transform 重复 8 × 5.6 次 —— 整幅图案 + 毫米级绒面细节，贴图总量不变
  rug: { size: 1024, detail: 0.5, v: 4, gen: decor.rug, normalTile: { size: 512, strength: 2.5, gen: decor.woolPile } },
  fringe: { size: 512, normalStrength: 2, v: 4, alpha: true, gen: decor.fringe },
  // —— 灯具 ——
  paper: { size: 1024, detail: 0.5, normalStrength: 2.5, v: 4, emit: true, gen: lamp.paper },
  // —— 建筑构件 ——（地板贴图的周期整除 2m 模块：人字拼 1m、宽板 2m、水磨石 1m）
  herringbone: { size: 1024, detail: 0.5, normalStrength: 3, v: 3, gen: INTERIOR.herringbone },
  planks: { size: 2048, detail: 0.5, normalStrength: 3, v: 1, gen: INTERIOR.planks },
  terrazzo: { size: 1024, detail: 0.5, normalStrength: 1.2, v: 2, gen: INTERIOR.terrazzo },
  plaster: { size: 512, normalStrength: 1.2, v: 1, gen: INTERIOR.plaster },
  // —— 新家具 ——
  cane: { size: 512, normalStrength: 3, v: 2, gen: INTERIOR.cane },
  // —— 厨房 ——（高度以毫米计：法线强度 ≈ 高度范围 / 像素尺寸，釉面起伏的斜率就是真实的）
  zellige: { size: 1024, detail: 0.5, normalStrength: 9, v: 3, gen: INTERIOR.zellige },
  // —— 浴室 ——（六角马赛克周期 1m，整除 2m 的地板模块）
  hexmosaic: { size: 2048, detail: 0.5, normalStrength: 2, v: 2, gen: INTERIOR.hexMosaic },
  // —— 阳台 ——
  teak: {
    size: 1024, detail: 0.5, normalStrength: 2, v: 2,
    gen: (S) => wood(S, {
      seed: 81, staves: 9, rings: 15, warp: 1.6, archChance: 0.3,
      staveTint: 0.12, staveWarm: 0.05, pores: 0.8, lateMix: 0.75, colorVar: 0.1, fiberVar: 0.06,
      early: rgb(166, 114, 70), late: rgb(116, 76, 44), pore: rgb(88, 56, 34), rough: 0.6,
    }),
  },
  rope: { size: 256, normalStrength: 4, v: 1, gen: (S) => patio.rope(S, { seed: 661, color: rgb(168, 156, 136) }) },
  decking: { size: 2048, detail: 0.5, normalStrength: 3, v: 1, gen: INTERIOR.decking },
  patio: { size: 1024, detail: 0.5, normalStrength: 2.5, v: 2, gen: patio.patio },
  // —— 书房 ——
  velvet_rust: { size: 512, normalStrength: 1.2, v: 2, gen: (S) => velvet(S, { seed: 52, crush: 0.16, color: rgb(116, 44, 30) }) },
  // —— 玄关 ——（棋盘格：一张贴图 = 一整块 2m 地板模块，6 × 6 块 33cm 的砖）
  checker: {
    size: 2048, detail: 0.5, normalStrength: 0.8, v: 2,
    gen: (S) => entry.checker(S, {
      seed: 401, period: 2, tiles: 6, joint: 0.002, bevel: 0.0012, grout: rgb(196, 194, 188),
      // 白砖（卡拉拉）：灰色主纹 + 另一个方向的浅色细纹，主纹旁边一圈淡灰的晕；黑砖：稀疏的白色粗纹 + 细碎的白纹
      white: {
        base: rgb(236, 234, 229), cloud: rgb(222, 221, 218), haloColor: rgb(214, 213, 211), vein: rgb(128, 130, 136), vein2: rgb(170, 171, 175),
        main: { dens: 1.6, amp: 0.7, freq: 0.5, width: 0.0014, strength: 0.7, halo: 0.35 },
        fine: { dens: 3.2, amp: 0.9, freq: 0.9, width: 0.0006, strength: 0.4 },
        tone: 0.02, rough: 0.14,
      },
      black: {
        base: rgb(30, 30, 33), cloud: rgb(44, 44, 48), haloColor: rgb(58, 58, 62), vein: rgb(224, 220, 212), vein2: rgb(150, 148, 144),
        main: { dens: 0.9, amp: 0.6, freq: 0.45, width: 0.0022, strength: 0.9, halo: 0.3 },
        fine: { dens: 3.5, amp: 1.1, freq: 1.0, width: 0.0005, strength: 0.45 },
        tone: 0.06, rough: 0.12,
      },
    }),
  },
  travertine: {
    size: 1024, detail: 0.5, normalStrength: 1, v: 4,
    gen: (S) => entry.travertine(S, {
      seed: 411, bands: 40, porous: 0.4,
      tones: [
        { p: 0.36, c: rgb(230, 218, 196) }, { p: 0.3, c: rgb(218, 201, 172) }, { p: 0.2, c: rgb(202, 181, 146) },
        { p: 0.14, c: rgb(238, 230, 214) },
      ],
      fill: rgb(188, 166, 130), pitsX: 12, pitsY: 90, rough: 0.5, roughFill: 0.75,
    }),
  },
  felt: { size: 256, normalStrength: 2, v: 1, gen: (S) => entry.felt(S, { seed: 421, color: rgb(160, 118, 76), mottle: 0.05 }) },
};

function alloc(S) {
  return { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
}

// 高度图 → 法线图（循环边界，保证平铺无缝）
function heightToNormal(h, S, strength) {
  const out = new Uint8Array(S * S * 3);
  const k = strength / 8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const at = (xx, yy) => h[((yy + S) % S) * S + ((xx + S) % S)];
    // Sobel
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * k, ny = dy * k, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * S + x) * 3;
    out[i] = Math.round((nx / l * 0.5 + 0.5) * 255);
    out[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
    out[i + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
  }
  return out;
}

async function encode(name, S, field, strength, detail = 1, { chroma444 = false } = {}) {
  // 带透明度的贴图（流苏）存成 RGBA PNG；其余存 JPEG
  const ch = field.alpha ? 4 : 3;
  const col = new Uint8Array(S * S * ch);
  for (let i = 0; i < S * S; i++) {
    for (let c = 0; c < 3; c++) col[i * ch + c] = Math.round(clamp01(field.color[i * 3 + c]) * 255);
    if (field.alpha) col[i * ch + 3] = Math.round(clamp01(field.alpha[i]) * 255);
  }
  const rough = new Uint8Array(S * S * 3);
  for (let i = 0; i < S * S; i++) {
    rough[i * 3] = 255;
    rough[i * 3 + 1] = Math.round(clamp01(field.rough[i]) * 255);
    rough[i * 3 + 2] = field.metal ? Math.round(clamp01(field.metal[i]) * 255) : 0; // glTF：B = 金属度
  }
  // 高度图归一化到单位幅度，strength 控制凹凸
  const nt = field.normalTile; // 独立的可平铺细节法线（有的话）
  const H = nt ? nt.height : field.height, HS = nt ? nt.S : S;
  let mn = Infinity, mx = -Infinity;
  for (const v of H) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  const hn = H.map((v) => (v - mn) / (mx - mn + 1e-9));
  const nrm = heightToNormal(hn, HS, nt ? nt.strength : strength);
  const raw = { raw: { width: S, height: S, channels: 3 } };
  // 法线 / 粗糙度可以用半分辨率（detail < 1）：细节主要靠颜色图，省一半以上体积
  const D = Math.round(S * detail);
  const sized = (buf) => (D === S ? sharp(Buffer.from(buf), raw) : sharp(Buffer.from(buf), raw).resize(D, D, { kernel: 'lanczos3' }));
  const normalImg = nt ? sharp(Buffer.from(nrm), { raw: { width: HS, height: HS, channels: 3 } }) : sized(nrm);
  const colorImg = field.alpha
    ? { data: await sharp(Buffer.from(col), { raw: { width: S, height: S, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer(), mime: 'image/png' }
    : { data: await sharp(Buffer.from(col), raw).jpeg({ quality: 90, mozjpeg: true, ...(chroma444 ? { chromaSubsampling: '4:4:4' } : {}) }).toBuffer(), mime: 'image/jpeg' };
  const res = {
    color: colorImg,
    normal: { data: await normalImg.jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer(), mime: 'image/jpeg' },
    rough: { data: await sized(rough).jpeg({ quality: 88, mozjpeg: true }).toBuffer(), mime: 'image/jpeg' },
  };
  // 独立的自发光贴图（纸灯笼：点亮时竹骨和接缝的影子比白天明显得多）
  if (field.emit) {
    const em = new Uint8Array(S * S * 3);
    for (let i = 0; i < S * S * 3; i++) em[i] = Math.round(clamp01(field.emit[i]) * 255);
    res.emit = { data: await sharp(Buffer.from(em), raw).jpeg({ quality: 88, mozjpeg: true }).toBuffer(), mime: 'image/jpeg' };
  }
  return res;
}

export async function buildTextures({ scale = 1, cacheDir = null, only = null } = {}) {
  const out = {};
  for (const [name, def] of Object.entries(TEXTURES)) {
    if (only && !only.includes(name)) continue;
    const S = Math.max(64, Math.round(def.size * scale));
    const key = def.v ? `${name}_${S}_d${def.v}` : `${name}_${S}_v${VERSION}`;
    const colorExt = def.alpha ? 'png' : 'jpg';
    const maps = def.emit ? ['color', 'normal', 'rough', 'emit'] : ['color', 'normal', 'rough'];
    const files = maps.map((m) => cacheDir && path.join(cacheDir, `${key}_${m}.${m === 'color' ? colorExt : 'jpg'}`));
    if (cacheDir) {
      try {
        const bufs = await Promise.all(files.map((f) => fs.readFile(f)));
        out[name] = {
          color: { data: bufs[0], mime: def.alpha ? 'image/png' : 'image/jpeg' },
          normal: { data: bufs[1], mime: 'image/jpeg' }, rough: { data: bufs[2], mime: 'image/jpeg' },
        };
        if (def.emit) out[name].emit = { data: bufs[3], mime: 'image/jpeg' };
        continue;
      } catch {}
    }
    const field = def.gen(S);
    if (def.normalTile) {
      const NS = Math.max(64, Math.round(def.normalTile.size * scale));
      field.normalTile = { S: NS, height: def.normalTile.gen(NS), strength: def.normalTile.strength };
    }
    out[name] = await encode(name, S, field, def.normalStrength, def.detail ?? 1, def);
    if (cacheDir) {
      await fs.mkdir(cacheDir, { recursive: true });
      await Promise.all(maps.map((m, i) => fs.writeFile(files[i], out[name][m].data)));
    }
  }
  return out;
}
