import { rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { cupPull } from './cabinetry.js';

// 岛台：1.8m × 0.94m 大理石台面 + 橡木柜身
//   · 座位一侧（+z）台面探出 30cm，底下是一整面竖向凸条的橡木板（reeded）：
//     40 道圆弧凸条是一条开放截面，沿竖直路径扫掠一次 —— 只占一个图块；凸条之间的缝是真正的折线（法线不连续），
//     每段的法线取圆弧的解析法线，所以 3 段就很圆；AO 在每道缝里压出一条细线。
//     LOD2 每道凸条只剩一段弦，法线仍是 ±α 的圆弧法线 —— 几何是平的，明暗里还看得出一道道凸条；
//   · 工作一侧（-z，朝着地柜）是四个大抽屉：一整块橡木板上裁下来的纹理（对花）+ 黄铜杯形拉手；
//   · 两头是整块橡木侧板落地，踢脚往里收；
//   · 原点在柜身中心的地面上。
const TOP = { w: 1.8, z0: -0.32, z1: 0.62, y: 0.86, t: 0.04 };
const IN = 0.83; // 侧板内侧
const SIDE = 0.02; // 侧板厚
const PLINTH = 0.08;
const BODY_Z = 0.3; // 柜体前后面
const REED = { n: 40, base: 0.008, sag: 0.009 };
const GAP = 0.003;

// 凸条截面：开放轮廓（截面 x 取 -世界 x，y 离开柜体），每道凸条是一段圆弧（弦 = 条距，拱高 sag）
function reedProfile(k, x0, x1, { n, base, sag }) {
  const nr = k.q(3, 2, 1);
  const p = (x1 - x0) / n, R = (p * p / 4 + sag * sag) / (2 * sag), al = Math.asin(p / 2 / R);
  const segs = [];
  let s = 0;
  for (let j = 0; j < n; j++) {
    const xc = x0 + (j + 0.5) * p;
    const at = (th) => ({ p: [-(xc + R * Math.sin(th)), base + R * (Math.cos(th) - Math.cos(al))], n: [-Math.sin(th), Math.cos(th)] });
    for (let i = 0; i < nr; i++) {
      const A = at(-al + (2 * al * i) / nr), B = at(-al + (2 * al * (i + 1)) / nr);
      const L = Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]);
      segs.push({ a: A.p, b: B.p, na: A.n, nb: B.n, sa: s, sb: s + L, kind: 'edge', group: 0 });
      s += L;
    }
  }
  return { segs, closed: false, length: s };
}

export default {
  id: 'kitchen_island',
  name: '岛台',
  nameEn: 'Reeded Oak Kitchen Island',
  category: 'kitchen',
  aoDensity: 130,
  shadow: { margin: 0.2, maxDist: 0.7, density: 70 },
  view: { el: 18, az: 32 },
  build(k) {
    const q = (...v) => k.q(...v);
    const H = TOP.y;
    // —— 台面：四角 6mm 圆角，上沿 3mm 圆边；底面在探出的 30cm 下面看得见 ——
    k.extrude({
      name: 'top', mat: 'marble_slab', shape: rect(TOP.w, TOP.z1 - TOP.z0, { r: 0.006, segs: q(2, 1, 1) }), depth: TOP.t, axis: 'y',
      bevel: [0, q(0.003, 0.003, 0.002)], bsegs: q(2, 1, 1), density: { cap0: 0.4 },
      xf: xf({ pos: [0, H, (TOP.z0 + TOP.z1) / 2] }),
    });
    // —— 柜体（门缝里看得见的正面）、踢脚 ——
    k.box({
      name: 'carcass', mat: 'oak', size: [2 * IN, H - PLINTH, 2 * BODY_Z], segs: 0, omit: ['pz', 'py', 'px', 'nx'],
      density: { nz: 0.3, ny: 0.3 },
      xf: xf({ pos: [0, (H + PLINTH) / 2, 0] }),
    });
    k.box({
      name: 'plinth', mat: 'oak', size: [2 * IN, PLINTH, 2 * (BODY_Z - 0.04)], segs: 0, omit: ['py', 'ny', 'px', 'nx'], density: { pz: 0.5, nz: 0.5 },
      xf: xf({ pos: [0, PLINTH / 2, 0] }),
    });
    // —— 两头的侧板：落地，前后和抽屉面、凸条板齐平 ——
    for (const s of [-1, 1]) {
      k.box({
        name: `side${s > 0 ? 'R' : 'L'}`, mat: 'oak', size: [SIDE, H, 2 * (BODY_Z + 0.02)], r: q(0.002, 0.0015, 0), segs: q(1, 1, 0),
        omit: ['py', 'ny'], grain: 'y', density: { [s > 0 ? 'nx' : 'px']: 0.4 },
        xf: xf({ pos: [s * (IN + SIDE / 2), H / 2, 0] }),
      });
    }
    // —— 座位一侧：凸条板 + 底下一条封边（从下往上看不穿）——
    k.sweep({
      name: 'reeds', mat: 'oak', shape: reedProfile(k, -IN, IN, REED), up: [0, 0, 1], caps: [false, false], maxChart: 2,
      path: [[0, PLINTH, BODY_Z], [0, H, BODY_Z]],
    });
    k.box({
      name: 'reedsSole', mat: 'oak', size: [2 * IN, 0.001, REED.base + REED.sag], segs: 0, omit: ['py', 'px', 'nx', 'pz', 'nz'],
      xf: xf({ pos: [0, PLINTH - 0.0005, BODY_Z + (REED.base + REED.sag) / 2] }),
    });
    // —— 工作一侧：四个大抽屉（两列两行），纹理对花；拉手在上沿居中 ——
    const rows = [[PLINTH, 0.56], [0.56, H]];
    const cols = [[-IN, 0], [0, IN]];
    rows.forEach(([y0, y1], r) => cols.forEach(([x0, x1], c) => {
      const a = x0 + (c === 0 ? GAP : GAP / 2), b = x1 - (c === 0 ? GAP / 2 : GAP);
      const lo = y0 + (r === 0 ? 0 : GAP / 2), hi = y1 - (r === 0 ? GAP / 2 : GAP);
      const cx = (a + b) / 2, cy = (lo + hi) / 2;
      const f = k.box({
        name: `drawer${r}${c}`, mat: 'oak', size: [b - a, hi - lo, 0.02], r: q(0.0015, 0.001, 0), segs: q(1, 1, 0), grain: 'x',
        omit: ['pz'], density: { px: 0.5, nx: 0.5, py: 0.5, ny: 0.5 },
        xf: xf({ pos: [cx, cy, -BODY_Z - 0.01] }),
      });
      f.uvKey = 'fronts';
      f.uvShift = [cx, cy];
      if (k.lod < 2) cupPull(k, { name: `pull${r}${c}`, pos: [cx, hi - 0.045, -BODY_Z - 0.02], rotY: Math.PI });
    }));
  },
};
