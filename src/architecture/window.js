import { xf } from '../core/vec.js';
import { WALL, wallBox, wallEnds, skirting } from './walls.js';

// 窗：一块 2m 墙模块，正中一樘黑色钢窗（和白墙、门首尾相接）。
//   · 窗洞 120 × 135cm，窗台高 85cm；四周抹灰的窗洞侧壁（外框前后各留出一段进深，AO 让它自然变暗）；
//   · 细框钢窗：外框 4cm，两扇平开扇各分 2 × 3 格（窗棂 18mm），经典的“克里托”式钢窗；
//     框和扇的棱都有 1.5mm 倒角，黑色粉末喷涂在灯光下有一道细细的高光；
//   · 玻璃是半透明混合的材质（每扇一块，4 个三角形），不参与 AO 遮挡；
//   · 室内一块白色大理石窗台板，两端“耳朵”伸进墙里、前沿圆角。
const WIN = { w: 1.2, y0: 0.85, y1: 2.2 };
const F = { face: 0.04, depth: 0.045, z: -0.012 }; // 外框：正面宽、进深、中心 z
const S = { face: 0.035, depth: 0.03, z: -0.004 }; // 扇框
const MUNTIN = 0.018;

export const wallWindow = {
  id: 'wall_window',
  name: '窗',
  nameEn: 'Steel Casement Window in Wall',
  category: 'architecture',
  aoDensity: 90,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 10, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    const { L, T } = WALL;
    const hx = WIN.w / 2, h = WIN.y1 - WIN.y0;
    // —— 墙体：窗洞两侧、上方、下方 ——
    // 墙垛朝窗洞的面只要窗洞那一段（单独一片），埋在墙里的部分不生成：
    // 否则远看时它在凹角处和墙面抢深度，漏出一条被 AO 压黑的细线
    wallBox(k, { name: 'wallL', x0: -L / 2, x1: -hx, omit: ['ny', 'px'], splitY: [WIN.y0, WIN.y1], ends: ['nx'] });
    wallBox(k, { name: 'wallR', x0: hx, x1: L / 2, omit: ['ny', 'nx'], splitY: [WIN.y0, WIN.y1], ends: ['px'] });
    for (const s of [-1, 1]) {
      wallBox(k, {
        name: `reveal${s > 0 ? 'R' : 'L'}`, x0: s * hx - 0.0005, x1: s * hx + 0.0005, y0: WIN.y0, y1: WIN.y1,
        omit: ['ny', 'py', 'pz', 'nz', s > 0 ? 'px' : 'nx'],
      });
    }
    wallBox(k, { name: 'wallTop', x0: -hx, x1: hx, y0: WIN.y1, omit: ['px', 'nx'] });
    wallEnds(k);
    wallBox(k, { name: 'wallLow', x0: -hx, x1: hx, y1: WIN.y0, omit: ['ny', 'px', 'nx'] });
    skirting(k, { name: 'skirtingF', x0: -L / 2, x1: L / 2, zFace: T / 2, side: 1 });
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
    // —— 外框 ——
    const r = q(0.0015, 0, 0), segs = q(1, 0, 0);
    const bar = (name, cx, cy, w, hh, d, z, o = {}) => k.box({
      name, mat: 'steel', size: [w, hh, d], r: o.r ?? r, segs: o.segs ?? segs, omit: o.omit ?? [],
      xf: xf({ pos: [cx, cy, z] }),
    });
    bar('frameL', -hx + F.face / 2, WIN.y0 + h / 2, F.face, h, F.depth, F.z, { omit: ['nx'] });
    bar('frameR', hx - F.face / 2, WIN.y0 + h / 2, F.face, h, F.depth, F.z, { omit: ['px'] });
    bar('frameT', 0, WIN.y1 - F.face / 2, WIN.w - 2 * F.face, F.face, F.depth, F.z, { omit: ['py', 'px', 'nx'] });
    bar('frameB', 0, WIN.y0 + F.face / 2, WIN.w - 2 * F.face, F.face, F.depth, F.z, { omit: ['ny', 'px', 'nx'] });
    // —— 两扇平开扇：扇框 + 1 竖 2 横窗棂 + 一块玻璃 ——
    const ix0 = -hx + F.face, iy0 = WIN.y0 + F.face, iw = (WIN.w - 2 * F.face) / 2, ih = h - 2 * F.face;
    for (let sgn = 0; sgn < 2; sgn++) {
      const sx0 = ix0 + sgn * iw, cx = sx0 + iw / 2, cy = iy0 + ih / 2;
      const n = `sash${sgn}`;
      bar(`${n}L`, sx0 + S.face / 2, cy, S.face, ih, S.depth, S.z);
      bar(`${n}R`, sx0 + iw - S.face / 2, cy, S.face, ih, S.depth, S.z);
      bar(`${n}T`, cx, iy0 + ih - S.face / 2, iw - 2 * S.face, S.face, S.depth, S.z, { omit: ['px', 'nx'] });
      bar(`${n}B`, cx, iy0 + S.face / 2, iw - 2 * S.face, S.face, S.depth, S.z, { omit: ['px', 'nx'] });
      // 窗棂：1 竖 2 横，把一扇分成 2 × 3 格
      const gw = iw - 2 * S.face, gh = ih - 2 * S.face;
      const mo = { r: 0, segs: 0 };
      bar(`${n}MV`, cx, cy, MUNTIN, gh, 0.02, S.z, { ...mo, omit: ['py', 'ny'] });
      for (const t of [1 / 3, 2 / 3]) {
        bar(`${n}MH${Math.round(t * 3)}`, cx, iy0 + S.face + gh * t, gw, MUNTIN, 0.02, S.z, { ...mo, omit: ['px', 'nx'] });
      }
      k.box({
        name: `glass${sgn}`, mat: 'glass', size: [gw, gh, 0.004], segs: 0, omit: ['px', 'nx', 'py', 'ny'],
        xf: xf({ pos: [cx, cy, S.z] }),
      });
    }
    // 执手：右扇的碰头边上一个小底座 + 一根下垂的扳手
    if (k.lod < 2) {
      const hxp = ix0 + iw + S.face / 2, hy = WIN.y0 + h * 0.5;
      const z0 = S.z + S.depth / 2;
      bar('handleBase', hxp, hy, 0.022, 0.05, 0.008, z0 + 0.004, { r: q(0.002, 0), segs: q(1, 0) });
      bar('handleLever', hxp, hy - 0.045, 0.012, 0.1, 0.01, z0 + 0.016, { r: q(0.003, 0), segs: q(1, 0) });
      bar('handleNeck', hxp, hy - 0.002, 0.01, 0.012, 0.016, z0 + 0.012, { r: 0, segs: 0 });
    }
    // —— 室内窗台板：白色大理石，两端伸进墙里，前沿圆角 ——
    const sw = WIN.w + 0.1, sd = 0.085, st = 0.025;
    const sill = k.box({
      name: 'sill', mat: 'marble', size: [sw, st, sd], r: q(0.008, 0.006, 0), segs: q(2, 1, 0),
      omit: ['nz'], grain: 'x',
      xf: xf({ pos: [0, WIN.y0 + st / 2, F.z + F.depth / 2 + sd / 2] }),
    });
    sill.uvKey = 'sill';
  },
};
