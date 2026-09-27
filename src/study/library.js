import { profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { faceFrame, shakerFront } from '../kitchen/cabinetry.js';
import { vessel3d } from '../decor/vases.js';
import { bookRow, bookStack, fillBooks } from './shelf-books.js';

// 书架墙：一整面 2m 宽、2.6m 高（和墙模块一样高，顶面和墙顶齐平）的嵌入式书柜
//   · 下半截是 44cm 深的柜子：面框 + 四扇嵌入式 Shaker 门（和厨房同一套部件）+ 黄铜圆钮；
//     柜顶压一条胡桃木台面，往前探 2cm；
//   · 上半截 34cm 深、分三格，每格四块层板，背板是竖纹胡桃木 —— 墨蓝色的框、暖色的木背板；
//   · 顶上一圈凹弧顶线，沿正面和两侧一次扫掠（拐角斜接）；
//   · 2.3m 高处一根黄铜梯轨，挂着一架胡桃木移动书梯（顶上黄铜挂钩、脚下黄铜滚轮）；
//   · 书：一百多本，一格一格按“摆法”排 —— 立着的一套一套、平放的一摞、斜靠的一本，偶尔一件陶罐 / 黄铜碗 / 书挡；
//     书用的是精简过的书模型（shelf-books.js）和书的调色板图集，整面墙的书只占一个材质。
// 原点在墙根、宽度中点（z = 0 是墙面，y = 0 是地面），贴着地面和墙两个面。
const W = 2.0, H = 2.6, T = 0.025;
const LOW = { d: 0.44, top: 0.8, kick: 0.1 };
const LEDGE = { t: 0.03, over: 0.02 };
const UP = { d: 0.34, y0: LOW.top + LEDGE.t, y1: 2.52 };
const TOPB = 2.45; // 最上一排的“天花板”
const SHELVES = [1.17, 1.51, 1.85, 2.19]; // 层板顶面
const ST = 0.025; // 层板厚
const BACK = 0.012; // 背板正面离墙
const BW = (W - 4 * T) / 3; // 每格净宽
const bayX = (i) => [-W / 2 + T + i * (BW + T), -W / 2 + T + i * (BW + T) + BW];
const RAIL = { y: 2.3, z: 0.41, r: 0.011 };
const LADDER = { x: -0.62, w: 0.44, foot: 0.95, top: 2.34 };

// 每一格的摆法（自下而上，每排左、中、右三格）：
//   fill 立着的书占这一格宽度的比例，align 从哪一头开始排；stack 平放一摞几本；lean 斜靠一本；
//   item 一件摆设（jar 月亮罐、bottle 细颈瓶、bowl 黄铜碗 —— 放在那一摞书上）；bookend 黄铜书挡
const PLAN = [
  [{ fill: 0.7 }, { fill: 0.45, item: 'jar' }, { fill: 0.4, align: 'right', stack: 3 }],
  [{ fill: 0.5, lean: true }, { fill: 0.72 }, { fill: 0.42, stack: 2, item: 'bowl' }],
  [{ fill: 0.46, align: 'right', stack: 4 }, { fill: 0.4, bookend: true }, { fill: 0.7 }],
  [{ fill: 0.72 }, { fill: 0.42, align: 'right', item: 'bottle' }, { fill: 0.48, lean: true }],
  [{ fill: 0.42, stack: 3 }, { fill: 0.32, align: 'right', stack: 2 }, { fill: 0.62 }],
];
// 书的颜色：深色的布面为主，几本浅色、几本亮色点缀
const PALS = [0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 8, 10, 11, 12, 13, 14, 15];

export default {
  id: 'library_wall',
  name: '书架墙',
  nameEn: 'Built-in Library Wall',
  category: 'study',
  planes: ['floor', 'wall'],
  aoDensity: 100,
  shadow: {
    floor: { margin: 0.2, maxDist: 0.6, density: 60 },
    wall: { margin: 0.14, maxDist: 0.3, density: 50, strength: 0.7 },
  },
  view: { el: 12, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    const c = q(0.002, 0.0015, 0), cs = q(1, 1, 0);
    // —— 下柜 ——
    // 两侧板（落地）、踢脚（缩进）、柜体正面（门缝里看得见，藏在门后 5mm）
    for (const s of [-1, 1]) {
      k.box({
        name: `lowSide${s > 0 ? 'R' : 'L'}`, mat: 'paint_navy', size: [T, LOW.top, LOW.d - 0.02], r: c, segs: cs,
        omit: ['ny', 'py', 'nz'], grain: 'y', density: { [s > 0 ? 'nx' : 'px']: 0.1 },
        xf: xf({ pos: [s * (W / 2 - T / 2), LOW.top / 2, (LOW.d - 0.02) / 2] }),
      });
    }
    k.box({
      name: 'kick', mat: 'paint_navy', size: [W - 2 * T, LOW.kick, 0.02], segs: 0, omit: ['ny', 'px', 'nx', 'nz'],
      xf: xf({ pos: [0, LOW.kick / 2, LOW.d - 0.045] }),
    });
    k.box({
      name: 'lowBody', mat: 'paint_navy', size: [W - 2 * T, LOW.top - LOW.kick, 0.01], segs: 0,
      omit: ['ny', 'py', 'px', 'nx', 'nz'], density: { pz: 0.25 },
      xf: xf({ pos: [0, (LOW.top + LOW.kick) / 2, LOW.d - 0.02 - 0.005 - 0.005] }),
    });
    // 面框：五根竖梃、上下横档；四扇门两两对开
    const fz0 = LOW.d - 0.02, fz1 = LOW.d;
    const st = [[-W / 2, -W / 2 + 0.04], [-0.52, -0.48], [-0.02, 0.02], [0.48, 0.52], [W / 2 - 0.04, W / 2]];
    const railY = [[LOW.kick, LOW.kick + 0.04], [LOW.top - 0.05, LOW.top]];
    const rails = [];
    for (let i = 0; i + 1 < st.length; i++) for (const [y0, y1] of railY) rails.push({ x0: st[i][1], x1: st[i + 1][0], y0, y1 });
    faceFrame(k, { name: 'frame', mat: 'paint_navy', z0: fz0, z1: fz1, y0: LOW.kick, y1: LOW.top, stiles: st, rails });
    const g = 0.0025;
    for (let i = 0; i + 1 < st.length; i++) {
      const x0 = st[i][1] + g, x1 = st[i + 1][0] - g, y0 = railY[0][1] + g, y1 = railY[1][0] - g;
      shakerFront(k, { name: `door${i}`, mat: 'paint_navy', x0, x1, y0, y1, z: fz0, t: 0.02, fw: 0.06, pd: 0.007 });
      // 圆钮在靠对开缝的一侧、门的上三分之一
      if (k.lod < 2) {
        const kx = i % 2 === 0 ? x1 - 0.045 : x0 + 0.045;
        k.lathe({
          name: `knob${i}`, mat: 'brass', segs: q(6, 5),
          profile: profile([[0.006, 0], [0.006, 0.012, { smooth: true }], [0.013, 0.02, { smooth: true }], [0, 0.026]]),
          xf: xf({ pos: [kx, y1 - 0.12, fz1], rot: [Math.PI / 2, 0, 0] }),
        });
      }
    }
    // 胡桃木台面：正面、两侧探出，前沿圆角
    k.extrude({
      name: 'ledge', mat: 'walnut', axis: 'y', depth: LEDGE.t,
      shape: rect(W + 0.01, LOW.d + LEDGE.over, { corners: [q(0.006, 0.004, 0), q(0.006, 0.004, 0), 0, 0], segs: q(2, 1, 1) }),
      caps: [true, true], bevel: [0, q(0.002, 0.002, 0)], bsegs: 1, grain: 'across', density: { cap0: 0.3 },
      xf: xf({ pos: [0, LOW.top, (LOW.d + LEDGE.over) / 2] }),
    });

    // —— 上柜 ——
    const upH = UP.y1 - UP.y0;
    for (const s of [-1, 1]) {
      k.box({
        name: `upSide${s > 0 ? 'R' : 'L'}`, mat: 'paint_navy', size: [T, upH, UP.d], r: c, segs: cs,
        omit: ['ny', 'py', 'nz'], grain: 'y', density: { [s > 0 ? 'nx' : 'px']: 0.5 },
        xf: xf({ pos: [s * (W / 2 - T / 2), UP.y0 + upH / 2, UP.d / 2] }),
      });
    }
    for (const i of [1, 2]) {
      const x = bayX(i)[0] - T / 2;
      k.box({
        name: `div${i}`, mat: 'paint_navy', size: [T, TOPB - UP.y0, UP.d - BACK], r: c, segs: cs,
        omit: ['ny', 'py', 'nz'], grain: 'y',
        xf: xf({ pos: [x, (UP.y0 + TOPB) / 2, BACK + (UP.d - BACK) / 2] }),
      });
    }
    // 背板（胡桃木，竖纹）、层板、最上一排的顶板、正面的楣板
    for (let b = 0; b < 3; b++) {
      const [x0, x1] = bayX(b);
      const bp = k.box({
        name: `back${b}`, mat: 'walnut', size: [BW, TOPB - UP.y0, 0.004], segs: 0, grain: 'y',
        omit: ['px', 'nx', 'py', 'ny', 'nz'],
        xf: xf({ pos: [(x0 + x1) / 2, (UP.y0 + TOPB) / 2, BACK - 0.002] }),
      });
      bp.uvShift = [(UP.y0 + TOPB) / 2, (x0 + x1) / 2];
      SHELVES.forEach((y, j) => shelfBoard(k, { name: `shelf${b}${j}`, x0, x1, y, z0: BACK, z1: UP.d - 0.005, t: ST }));
    }
    k.box({
      name: 'ceil', mat: 'paint_navy', size: [W - 2 * T, 0.02, UP.d - BACK], segs: 0, omit: ['px', 'nx', 'py', 'pz', 'nz'], density: { ny: 0.5 },
      xf: xf({ pos: [0, TOPB + 0.01, BACK + (UP.d - BACK) / 2] }),
    });
    k.box({
      name: 'frieze', mat: 'paint_navy', size: [W - 2 * T, UP.y1 - TOPB, 0.02], segs: 0, omit: ['px', 'nx', 'py', 'nz'], grain: 'x',
      xf: xf({ pos: [0, (UP.y1 + TOPB) / 2, UP.d - 0.01] }),
    });
    // 顶面（从上往下看得见）
    k.box({
      name: 'lid', mat: 'paint_navy', size: [W, 0.02, UP.d], segs: 0, omit: ['px', 'nx', 'ny', 'pz', 'nz'], grain: 'x', density: { py: 0.4 },
      xf: xf({ pos: [0, H - 0.01, UP.d / 2] }),
    });
    // 顶线：沿左侧 → 正面 → 右侧一次扫掠；截面 x 取负是离开柜面的方向。
    // 拐角两侧各加一个 2mm 外的路径点：拐角那一圈的法线是两边的平均，把这段过渡压在 2mm 里，拐角就是利落的直角
    const cove = [];
    for (let i = 0; i <= 3; i++) {
      const a = (Math.PI / 2) * (1 - i / 3);
      cove.push([-0.043 + 0.03 * Math.cos(a), 0.016 + 0.03 * Math.sin(a), i === 0 || i === 3 ? {} : { smooth: true }]);
    }
    const crownShape = k.lod === 0
      ? profile([
        [0, 0.08], [-0.047, 0.08, { r: 0.003, segs: 1 }], [-0.047, 0.064], [-0.043, 0.058],
        [-0.043, 0.046], ...cove.slice(1), [-0.013, 0.008], [-0.006, 0.005], [-0.006, 0], [0, 0],
      ])
      // 稍远：凹弧只剩一道斜面
      : profile([[0, 0.08], [-0.047, 0.08], [-0.047, 0.058], [-0.036, 0.042, { smooth: true }], [-0.013, 0.016], [-0.006, 0], [0, 0]]);
    const e = 0.002, yc = UP.y1, zc = UP.d, xw = W / 2;
    k.sweep({
      name: 'crown', mat: 'paint_navy', shape: crownShape, caps: [false, false], up: [0, 1, 0], maxChart: 1.2,
      path: [[-xw, yc, 0.004], [-xw, yc, zc - e], [-xw, yc, zc], [-xw + e, yc, zc], [xw - e, yc, zc], [xw, yc, zc], [xw, yc, zc - e], [xw, yc, 0.004]],
    });

    // —— 梯轨：一根黄铜管，四个支架伸到侧板和中隔板的前沿 ——
    k.sweep({
      name: 'rail', mat: 'brass', shape: circle(RAIL.r, q(10, 8, 6)), caps: [true, true], up: [0, 1, 0], maxChart: 1.2,
      path: [[-W / 2 + 0.03, RAIL.y, RAIL.z], [W / 2 - 0.03, RAIL.y, RAIL.z]],
    });
    if (k.lod < 2) {
      [-W / 2 + T / 2, bayX(1)[0] - T / 2, bayX(2)[0] - T / 2, W / 2 - T / 2].forEach((x, i) => {
        k.sweep({
          name: `bracket${i}`, mat: 'brass', shape: circle(0.0065, q(8, 6)), caps: [false, false], up: [0, 1, 0],
          path: [[x, RAIL.y, UP.d - 0.002], [x, RAIL.y, RAIL.z]],
        });
      });
    }

    // —— 移动书梯：两根胡桃木侧梁 + 六级踏板；顶上黄铜挂钩勾住梯轨，脚下黄铜滚轮 ——
    ladder(k);

    // —— 书 ——
    const zf = UP.d - 0.005 - 0.016; // 书脊离层板前沿 1.6cm
    const rows = [UP.y0, ...SHELVES];
    const ceilings = [...SHELVES.map((y) => y - ST), TOPB];
    const rnd = k.rand('books');
    PLAN.forEach((cells, ri) => cells.forEach((cell, bi) => {
      const [bx0, bx1] = bayX(bi);
      const y0 = rows[ri], clear = ceilings[ri] - y0;
      const name = `r${ri}${bi}`;
      const align = cell.align ?? 'left';
      const span = (bx1 - bx0) * cell.fill;
      const { books: cut } = fillBooks(rnd, {
        x0: align === 'left' ? bx0 + 0.003 : bx1 - 0.003 - span, x1: align === 'left' ? bx0 + 0.003 + span : bx1 - 0.003,
        clear, zDepth: zf - BACK - 0.006, align, pals: PALS,
      });
      const rowZ = zf - rnd() * 0.004;
      bookRow(k, { name, books: cut, y0, zf: rowZ });
      // 立着的书排到哪儿：另一头就是空地
      const inner = align === 'left' ? cut[cut.length - 1].x + cut[cut.length - 1].T : cut[0].x;
      const edge = align === 'left' ? cut[cut.length - 1] : cut[0];
      const free = align === 'left' ? [inner, bx1] : [bx0, inner];
      const dir = align === 'left' ? 1 : -1;
      let slot = free;
      if (cell.lean) {
        const a = 0.26 + rnd() * 0.08, Tb = 0.026, Hb = Math.min(clear - 0.02, edge.H * (0.92 + rnd() * 0.1)), Db = edge.D;
        const pal = PALS[Math.floor(rnd() * PALS.length)];
        const xb = inner + dir * (edge.H * Math.tan(a) + 0.002);
        bookRow(k, {
          name: `${name}lean`, books: [{ x: dir > 0 ? 0 : -Tb, T: Tb, H: Hb, D: Db, pal }], y0: 0, zf: 0,
          place: xf({ pos: [xb, y0, rowZ], rot: [0, 0, dir * a] }),
        });
        slot = dir > 0 ? [xb + Tb, bx1] : [bx0, xb - Tb];
      }
      if (cell.bookend && k.lod < 2) {
        const x = inner + dir * 0.002;
        k.box({
          name: `${name}end`, mat: 'brass', size: [0.003, 0.16, 0.11], segs: 0, omit: ['ny'],
          xf: xf({ pos: [x + dir * 0.0015, y0 + 0.08, rowZ - 0.07] }),
        });
      }
      let top = y0;
      const mid = (slot[0] + slot[1]) / 2;
      if (cell.stack) {
        // 平放的一摞靠在格子的另一头；最大的一本放最下面，长度不超过空地
        const room = slot[1] - slot[0] - 0.02;
        const list = [];
        for (let i = 0; i < cell.stack; i++) {
          const Hs = Math.min(room - 0.012, 0.3) - i * 0.022 - rnd() * 0.015;
          list.push({
            T: 0.022 + rnd() * 0.018, H: Hs, D: Math.min(Hs * (0.7 + rnd() * 0.06), rowZ - BACK - 0.01), pal: PALS[Math.floor(rnd() * PALS.length)],
            dx: (rnd() - 0.5) * 0.01, turn: (rnd() - 0.5) * 0.08,
          });
        }
        const cx = dir > 0 ? slot[1] - 0.012 - list[0].H / 2 : slot[0] + 0.012 + list[0].H / 2;
        top = bookStack(k, { name: `${name}stack`, books: list, x: cx, y0, zf: rowZ }).top;
        if (cell.item === 'bowl' && k.lod < 2) bowl(k, { name: `${name}bowl`, pos: [cx + 0.01, top, rowZ - 0.12] });
      }
      if (cell.item === 'jar') vessel3d(k, { name: `${name}jar`, shape: 'moon', segs: [10, 7, 5], scale: 0.9, pos: [mid, y0, rowZ - 0.13], rot: 0.6, tol: [0.002, 0.004, 0.008] });
      if (cell.item === 'bottle') vessel3d(k, { name: `${name}bottle`, shape: 'bottle', segs: [10, 6, 5], scale: 0.8, pos: [mid, y0, rowZ - 0.12], rot: 2, tol: [0.002, 0.004, 0.008] });
    }));
  },
};

// 层板：沿 x 挤出，只有前沿上下两条棱倒角（后沿贴着背板、两头插进侧板，看不见）
function shelfBoard(k, { name, x0, x1, y, z0, z1, t }) {
  const q = (...v) => k.q(...v);
  const d = z1 - z0, r = q(0.002, 0);
  // 截面：x → 世界 -z（挤出轴 x 时截面 X → -Z），y 向上；截面 x 负的一侧是前沿
  k.extrude({
    name, mat: 'paint_navy', axis: 'x', center: true, depth: x1 - x0, caps: [false, false], grain: 'len',
    shape: rect(d, t, { corners: [r, 0, 0, r], segs: 1 }), density: { side: 0.8 },
    xf: xf({ pos: [(x0 + x1) / 2, y - t / 2, (z0 + z1) / 2] }),
  });
}

// 黄铜浅碗（放在一摞书上）
function bowl(k, { name, pos }) {
  const q = (...v) => k.q(...v);
  k.lathe({
    name, mat: 'brass', segs: q(12, 8),
    profile: profile([
      [0.03, 0], [0.062, 0.018, { smooth: true }], [0.077, 0.038], [0.07, 0.036], [0.045, 0.014, { smooth: true }], [0, 0.007],
    ]),
    xf: xf({ pos }),
  });
}

// 移动书梯：侧梁是沿梯子方向挤出的圆角矩形；踏板水平（不垂直于侧梁）
function ladder(k) {
  const q = (...v) => k.q(...v);
  const { x, w, foot, top } = LADDER;
  const zTop = RAIL.z + 0.04, yFoot = 0.03;
  const dz = zTop - foot, dy = top - yFoot, len = Math.hypot(dz, dy);
  const tilt = Math.atan2(-dz, dy); // 侧梁绕 x 轴往墙那边倒
  const at = (y) => foot + (dz * (y - yFoot)) / dy; // 高度 y 处侧梁中线的 z
  for (const s of [-1, 1]) {
    k.extrude({
      name: `stile${s > 0 ? 'R' : 'L'}`, mat: 'walnut', axis: 'y', depth: len,
      shape: rect(0.026, 0.058, { r: q(0.005, 0.004, 0), segs: 1 }),
      caps: [true, true], bevel: q(0.002, 0), grain: 'len', density: { cap0: 0.2, cap1: 0.2 },
      xf: xf({ pos: [x + (s * w) / 2, yFoot, foot], rot: [-tilt, 0, 0] }),
    });
    if (k.lod < 2) {
      // 挂钩：一条黄铜扁条，从侧梁背面伸出来，从前面绕过梯轨顶上、一直勾到梯轨背后
      const hx = x + (s * w) / 2, R = RAIL.r + 0.006, m = q(5, 3);
      const path = [[hx, RAIL.y, at(RAIL.y) - 0.012]];
      for (let i = 0; i <= m; i++) {
        const a = ((200 * Math.PI) / 180) * (i / m); // 从正前方（0°）经过顶上到背后偏下（200°）
        path.push([hx, RAIL.y + R * Math.sin(a), RAIL.z + R * Math.cos(a)]);
      }
      k.sweep({ name: `hook${s > 0 ? 'R' : 'L'}`, mat: 'brass', shape: rect(0.005, 0.012), caps: [true, true], up: [1, 0, 0], path });
      // 滚轮
      k.lathe({
        name: `wheel${s > 0 ? 'R' : 'L'}`, mat: 'brass', segs: q(10, 6),
        profile: profile([[0, -0.009], [0.03, -0.009], [0.03, 0.009], [0, 0.009]]),
        xf: xf({ pos: [x + (s * w) / 2 + s * 0.022, 0.03, foot + 0.01], rot: [0, 0, Math.PI / 2] }),
      });
    }
  }
  // 踏板：六级，前后沿倒角（两头插进侧梁）
  for (let i = 0; i < 6; i++) {
    const y = 0.32 + i * 0.33, z = at(y) + 0.01;
    k.extrude({
      name: `tread${i}`, mat: 'walnut', axis: 'x', center: true, depth: w - 0.026, caps: [false, false], grain: 'len',
      shape: rect(0.1, 0.022, { r: q(0.004, 0), segs: 1 }), density: { side: 0.6 },
      xf: xf({ pos: [x, y, z] }),
    });
  }
}
