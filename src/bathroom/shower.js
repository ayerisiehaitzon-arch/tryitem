import { profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { barPull } from '../furniture/parts.js';

// 淋浴间：1.2m × 0.9m，靠墙。左边一堵 10cm 厚的矮墙，里面两面贴苔绿色手工釉面砖；
// 前面和右边是黑钢细框玻璃（Crittall 式：每块玻璃两道横档分成三格），前面一扇门配黄铜把手；
// 墙上明装一套黄铜恒温花洒：横杆式混水阀 → 立管 → 往前弯出的顶喷。
//   · 原点在墙根、宽度中点（z = 0 是墙，y = 0 是地面），贴着地面和墙两个面；
//   · 玻璃是半透明混合（每块 4 个三角形），不挡 AO、不投接触阴影，自己也不压 AO；
//   · 钢框是闭合路径扫掠（矩形截面、四角斜接），横档是直的扫掠，两头插进框里；
//   · 砖从淋浴底座上沿起铺：两面墙的砖缝在墙角对齐，贴图不加随机偏移；
//   · 大理石底座贴墙的一侧是一条不锈钢线性地漏。
const W = 1.2, D = 0.9, TRAY = 0.035, TILE = 0.01;
const STUB = { t: 0.1, h: 2.1 };
const GLASS = { top: 2.0, face: 0.022, depth: 0.03, bar: 0.016, barDepth: 0.022, t: 0.006 };
const FIX = { x: 0, y: 1.1, z: 0.055 }; // 混水阀横杆中心

export default {
  id: 'shower',
  name: '淋浴间',
  nameEn: 'Crittall Shower Enclosure',
  category: 'bathroom',
  planes: ['floor', 'wall'],
  aoDensity: 90,
  shadow: {
    floor: { margin: 0.2, maxDist: 0.6, density: 60 },
    wall: { margin: 0.14, maxDist: 0.3, density: 50, strength: 0.7 },
  },
  view: { el: 14, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    const x0 = -W / 2, x1 = W / 2;
    // —— 底座：大理石，四边小倒角；左端顶着矮墙、背面贴墙 ——
    k.box({
      name: 'tray', mat: 'marble_slab', size: [W, TRAY, D], r: q(0.003, 0.002, 0), segs: q(1, 1, 0), grain: 'x',
      omit: ['ny', 'nz', 'nx'],
      xf: xf({ pos: [0, TRAY / 2, D / 2] }),
    });
    // 线性地漏：一条不锈钢盖板 + 中间一道黑缝
    k.box({
      name: 'drain', mat: 'stainless', size: [W - 0.1, 0.001, 0.05], segs: 0, omit: ['ny', 'px', 'nx', 'pz', 'nz'],
      xf: xf({ pos: [0, TRAY + 0.0003, 0.07] }),
    });
    k.box({
      name: 'drainSlot', mat: 'steel', size: [W - 0.14, 0.001, 0.008], segs: 0, omit: ['ny', 'px', 'nx', 'pz', 'nz'],
      xf: xf({ pos: [0, TRAY + 0.0008, 0.07] }),
    });
    // —— 左边的矮墙（外面抹灰）+ 两面墙砖 ——
    k.box({
      name: 'stub', mat: 'plaster', size: [STUB.t, STUB.h, D], segs: 0, grain: 'z', omit: ['nz', 'ny', 'px'],
      xf: xf({ pos: [x0 - STUB.t / 2, STUB.h / 2, D / 2] }),
    });
    const th = STUB.h - TRAY, ty = TRAY + th / 2;
    const side = k.box({
      name: 'tileSide', mat: 'zellige_green', size: [TILE, th, D], segs: 0, grain: 'z', omit: ['nx', 'nz', 'ny'], density: { px: 1 },
      xf: xf({ pos: [x0 + TILE / 2, ty, D / 2] }),
    });
    side.uvShift = [D / 2, th / 2]; // 砖缝从墙角、底座上沿起算
    const back = k.box({
      name: 'tileBack', mat: 'zellige_green', size: [W - TILE, th, TILE], segs: 0, grain: 'x', omit: ['nz', 'ny', 'nx'],
      xf: xf({ pos: [(x0 + TILE + x1) / 2, ty, TILE / 2] }),
    });
    back.uvShift = [(W - TILE) / 2, th / 2];
    // —— 玻璃隔断：右边一块固定玻璃，前面一块固定 + 一扇门 ——
    const c = GLASS.face / 2, gy0 = TRAY, gy1 = GLASS.top;
    const xr = x1 - GLASS.depth / 2, zf = D - GLASS.depth / 2; // 右边、前面玻璃所在的平面
    // 一块钢框玻璃：a、b 是玻璃平面里水平方向的两端点，n 是平面法线
    const panel = (name, a, b, n) => {
      const along = [b[0] - a[0], 0, b[2] - a[2]], L = Math.hypot(along[0], along[2]);
      const u = [along[0] / L, 0, along[2] / L];
      const at = (s, y) => [a[0] + u[0] * s, y, a[2] + u[2] * s];
      k.sweep({
        name: `${name}Frame`, mat: 'steel', shape: rect(GLASS.face, GLASS.depth), closed: true, caps: [false, false], up: n, maxChart: 2,
        path: [at(c, gy0 + c), at(L - c, gy0 + c), at(L - c, gy1 - c), at(c, gy1 - c)],
      });
      // 两道横档：三格等高
      for (let i = 1; i <= 2; i++) {
        const y = gy0 + ((gy1 - gy0) * i) / 3;
        k.sweep({
          name: `${name}Bar${i}`, mat: 'steel', shape: rect(GLASS.bar, GLASS.barDepth), caps: [false, false], up: n,
          path: [at(c, y), at(L - c, y)],
        });
      }
      // 玻璃：一整块，四边藏在框里
      const g = k.box({
        name: `${name}Glass`, mat: 'glass', size: [L - 0.01, gy1 - gy0 - 0.01, GLASS.t], segs: 0, omit: ['px', 'nx', 'py', 'ny'], density: { pz: 0.2, nz: 0.2 },
        xf: xf({ pos: at(L / 2, (gy0 + gy1) / 2), rot: [0, Math.atan2(u[0], u[2]) - Math.PI / 2, 0] }),
      });
      return g;
    };
    panel('right', [xr, 0, TILE], [xr, 0, D], [1, 0, 0]);
    panel('front', [x0 + TILE, 0, zf], [-0.002, 0, zf], [0, 0, 1]);
    panel('door', [0.002, 0, zf], [xr + GLASS.depth / 2, 0, zf], [0, 0, 1]);
    // 门把手装在门框左边的竖框上
    if (k.lod < 2) barPull(k, { name: 'handle', mat: 'brass', len: 0.32, depth: 0.04, r: 0.007, segs: q(6, 5), corner: 0.012, csegs: q(2, 1), pos: [0.002 + c, 1.05, D], axis: 'y' });
    // —— 明装恒温花洒 ——
    // 混水阀：一根横杆（车削轴转到 x），两头各一圈旋钮
    k.lathe({
      name: 'mixer', mat: 'brass', segs: q(10, 8, 6),
      profile: profile([
        [0, -0.155], [0.03, -0.15, { r: q(0.004, 0), segs: 1 }], [0.03, -0.11], [0.023, -0.105], [0.023, 0.105], [0.03, 0.11],
        [0.03, 0.15, { r: q(0.004, 0), segs: 1 }], [0, 0.155],
      ]),
      xf: xf({ pos: [FIX.x, FIX.y, FIX.z], rot: [0, 0, -Math.PI / 2] }),
    });
    if (k.lod < 2) {
      // 两个入墙接头
      for (const s of [-1, 1]) {
        k.lathe({
          name: `union${s > 0 ? 'R' : 'L'}`, mat: 'brass', segs: q(8, 6),
          profile: profile([[0.03, 0], [0.03, 0.004], [0.012, 0.01, { smooth: true }], [0.011, FIX.z - TILE]]),
          xf: xf({ pos: [FIX.x + s * 0.075, FIX.y, TILE], rot: [Math.PI / 2, 0, 0] }),
        });
      }
    }
    // 立管 + 往前弯出的顶喷臂
    const hy = 2.05, hz = 0.45;
    k.sweep({
      name: 'riser', mat: 'brass', shape: circle(0.011, q(8, 6, 5)), caps: [false, false], up: [1, 0, 0],
      // 末端插进顶喷的拱顶里
      path: roundedPath([[FIX.x, FIX.y + 0.02, FIX.z], [FIX.x, hy, FIX.z], [FIX.x, hy, hz], [FIX.x, hy - 0.04, hz]], [0, 0.08, 0.02, 0], q(4, 2, 1)),
    });
    // 顶喷：一个扁圆盘（顶面微拱，朝下的出水面）
    k.lathe({
      name: 'head', mat: 'brass', segs: q(20, 14, 10),
      profile: profile([[0, -0.002], [0.123, -0.002], [0.125, 0.004, { r: q(0.004, 0.003, 0), segs: 1 }], [0.11, 0.009, { smooth: true }], [0, 0.012]]),
      xf: xf({ pos: [FIX.x, hy - 0.045, hz] }),
    });
  },
};
